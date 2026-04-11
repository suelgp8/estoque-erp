<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useNotifier } from "../composables/useNotifier";
import { ApiError } from "../services/api";
import { useAuthStore } from "../stores/auth";
import { formatRole } from "../utils/format";

const PROFILE_PHOTO_CANVAS_SIZE = 320;
const IMAGE_MAX_FILE_SIZE = 5 * 1024 * 1024;
const PROFILE_PHOTO_MAX_LENGTH = 580_000;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const auth = useAuthStore();
const notifier = useNotifier();

const profileForm = reactive({
  name: "",
  email: "",
  profilePhotoDataUrl: null as string | null
});

const passwordForm = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
});

const profileTouched = reactive({
  name: false,
  email: false
});

const passwordTouched = reactive({
  currentPassword: false,
  newPassword: false,
  confirmPassword: false
});

const profileLoading = ref(false);
const passwordLoading = ref(false);
const refreshLoading = ref(false);
const photoProcessing = ref(false);
const photoInputRef = ref<HTMLInputElement | null>(null);
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateName(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    return "Nome e obrigatorio.";
  }

  if (normalized.length < 2) {
    return "Nome deve ter pelo menos 2 caracteres.";
  }

  if (normalized.length > 120) {
    return "Nome deve ter no maximo 120 caracteres.";
  }

  return "";
}

function validateEmail(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    return "E-mail e obrigatorio.";
  }

  if (!emailRegex.test(normalized)) {
    return "E-mail invalido.";
  }

  return "";
}

function validateCurrentPassword(value: string): string {
  if (!value) {
    return "Senha atual e obrigatoria.";
  }

  return "";
}

function validateNewPassword(value: string, currentPassword: string): string {
  if (!value) {
    return "Nova senha e obrigatoria.";
  }

  if (value.length < 6) {
    return "Nova senha deve ter no minimo 6 caracteres.";
  }

  if (value.length > 100) {
    return "Nova senha deve ter no maximo 100 caracteres.";
  }

  if (currentPassword && value === currentPassword) {
    return "A nova senha deve ser diferente da atual.";
  }

  return "";
}

function validateConfirmPassword(value: string, newPassword: string): string {
  if (!value) {
    return "Confirmacao de senha e obrigatoria.";
  }

  if (value !== newPassword) {
    return "A confirmacao de senha nao confere.";
  }

  return "";
}

const profileNameError = computed(() => validateName(profileForm.name));
const profileEmailError = computed(() => validateEmail(profileForm.email));
const profileFormValid = computed(() => !profileNameError.value && !profileEmailError.value);
const profilePreviewInitial = computed(() => {
  const source = profileForm.name.trim() || (auth.state.user?.name ?? "U");
  return source.charAt(0).toUpperCase() || "U";
});
const hasProfilePhoto = computed(() => Boolean(profileForm.profilePhotoDataUrl));

const currentPasswordError = computed(() => validateCurrentPassword(passwordForm.currentPassword));
const newPasswordError = computed(() => validateNewPassword(passwordForm.newPassword, passwordForm.currentPassword));
const confirmPasswordError = computed(() => validateConfirmPassword(passwordForm.confirmPassword, passwordForm.newPassword));

const passwordStrengthScore = computed(() => {
  const password = passwordForm.newPassword;

  if (!password) {
    return 0;
  }

  let score = 0;

  if (password.length >= 8) {
    score += 1;
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  }

  if (/[a-z]/.test(password)) {
    score += 1;
  }

  if (/\d/.test(password)) {
    score += 1;
  }

  if (/[^A-Za-z0-9]/.test(password)) {
    score += 1;
  }

  return score;
});

const passwordStrengthLabel = computed(() => {
  if (passwordStrengthScore.value <= 1) {
    return "Muito fraca";
  }

  if (passwordStrengthScore.value === 2) {
    return "Fraca";
  }

  if (passwordStrengthScore.value === 3) {
    return "Media";
  }

  if (passwordStrengthScore.value === 4) {
    return "Forte";
  }

  return "Muito forte";
});

const passwordStrengthLabelClass = computed(() => {
  if (passwordStrengthScore.value <= 1) {
    return "text-rose-600";
  }

  if (passwordStrengthScore.value === 2) {
    return "text-orange-600";
  }

  if (passwordStrengthScore.value === 3) {
    return "text-amber-600";
  }

  if (passwordStrengthScore.value === 4) {
    return "text-sky-700";
  }

  return "text-emerald-700";
});

const passwordStrengthBarClass = computed(() => {
  if (passwordStrengthScore.value <= 1) {
    return "bg-rose-500";
  }

  if (passwordStrengthScore.value === 2) {
    return "bg-orange-500";
  }

  if (passwordStrengthScore.value === 3) {
    return "bg-amber-500";
  }

  if (passwordStrengthScore.value === 4) {
    return "bg-sky-600";
  }

  return "bg-emerald-600";
});

const passwordStrengthWidth = computed(() => `${(passwordStrengthScore.value / 5) * 100}%`);

const passwordFormValid = computed(
  () => !currentPasswordError.value && !newPasswordError.value && !confirmPasswordError.value
);

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (typeof error.payload === "object" && error.payload !== null && "issues" in error.payload) {
      const issues = (error.payload as { issues?: Array<{ message: string }> }).issues ?? [];

      if (issues.length > 0) {
        return issues.map((issue) => issue.message).join(" | ");
      }
    }

    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Erro inesperado";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Nao foi possivel ler a imagem selecionada."));
    };

    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem selecionada."));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nao foi possivel processar a imagem selecionada."));
    image.src = source;
  });
}

async function buildProfilePhotoDataUrl(file: File): Promise<string> {
  return buildImageDataUrl(file, {
    canvasWidth: PROFILE_PHOTO_CANVAS_SIZE,
    canvasHeight: PROFILE_PHOTO_CANVAS_SIZE,
    maxLength: PROFILE_PHOTO_MAX_LENGTH,
    fit: "cover",
    mimeType: "image/jpeg",
    backgroundColor: "#ffffff"
  });
}

async function buildImageDataUrl(
  file: File,
  options: {
    canvasWidth: number;
    canvasHeight: number;
    maxLength: number;
    fit: "cover" | "contain";
    mimeType: "image/jpeg" | "image/png";
    backgroundColor: string | null;
  }
): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    throw new Error("Use uma imagem JPG, PNG ou WebP.");
  }

  if (file.size > IMAGE_MAX_FILE_SIZE) {
    throw new Error("A imagem deve ter no maximo 5 MB.");
  }

  const imageSource = await readFileAsDataUrl(file);
  const image = await loadImage(imageSource);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("Nao foi possivel processar a imagem selecionada.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = options.canvasWidth;
  canvas.height = options.canvasHeight;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Nao foi possivel preparar a foto para envio.");
  }

  context.clearRect(0, 0, options.canvasWidth, options.canvasHeight);

  if (options.backgroundColor) {
    context.fillStyle = options.backgroundColor;
    context.fillRect(0, 0, options.canvasWidth, options.canvasHeight);
  }

  if (options.fit === "cover") {
    const sourceSize = Math.min(sourceWidth, sourceHeight);
    const sourceX = (sourceWidth - sourceSize) / 2;
    const sourceY = (sourceHeight - sourceSize) / 2;

    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, options.canvasWidth, options.canvasHeight);
  } else {
    const scale = Math.min(options.canvasWidth / sourceWidth, options.canvasHeight / sourceHeight);
    const targetWidth = sourceWidth * scale;
    const targetHeight = sourceHeight * scale;
    const targetX = (options.canvasWidth - targetWidth) / 2;
    const targetY = (options.canvasHeight - targetHeight) / 2;

    context.drawImage(image, 0, 0, sourceWidth, sourceHeight, targetX, targetY, targetWidth, targetHeight);
  }

  if (options.mimeType === "image/png") {
    const dataUrl = canvas.toDataURL("image/png");

    if (dataUrl.length <= options.maxLength) {
      return dataUrl;
    }

    throw new Error("A imagem continua muito grande. Tente uma imagem mais leve.");
  }

  for (const quality of [0.9, 0.82, 0.74]) {
    const dataUrl = canvas.toDataURL(options.mimeType, quality);

    if (dataUrl.length <= options.maxLength) {
      return dataUrl;
    }
  }

  throw new Error("A imagem continua muito grande. Tente uma imagem mais leve.");
}

function clearPhotoInput() {
  if (photoInputRef.value) {
    photoInputRef.value.value = "";
  }
}

function openPhotoPicker() {
  photoInputRef.value?.click();
}

async function handlePhotoSelected(event: Event) {
  const target = event.target;

  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const file = target.files?.[0];

  if (!file) {
    return;
  }

  photoProcessing.value = true;

  try {
    profileForm.profilePhotoDataUrl = await buildProfilePhotoDataUrl(file);
    notifier.success("Foto carregada", "Salve o perfil para aplicar a nova imagem.");
  } catch (error) {
    notifier.error("Falha ao preparar foto", resolveErrorMessage(error));
  } finally {
    photoProcessing.value = false;
    clearPhotoInput();
  }
}

function removeSelectedPhoto() {
  profileForm.profilePhotoDataUrl = null;
  clearPhotoInput();
}

function resetPasswordForm() {
  passwordForm.currentPassword = "";
  passwordForm.newPassword = "";
  passwordForm.confirmPassword = "";
  passwordTouched.currentPassword = false;
  passwordTouched.newPassword = false;
  passwordTouched.confirmPassword = false;
}

function syncProfileForm() {
  if (!auth.state.user) {
    profileForm.name = "";
    profileForm.email = "";
    profileForm.profilePhotoDataUrl = null;
    clearPhotoInput();
    return;
  }

  profileForm.name = auth.state.user.name;
  profileForm.email = auth.state.user.email;
  profileForm.profilePhotoDataUrl = auth.state.user.profilePhotoDataUrl;
  profileTouched.name = false;
  profileTouched.email = false;
  clearPhotoInput();
}

async function loadProfile() {
  refreshLoading.value = true;

  try {
    await auth.refreshProfile();
    syncProfileForm();
  } catch (error) {
    notifier.error("Falha ao carregar perfil", resolveErrorMessage(error));
  } finally {
    refreshLoading.value = false;
  }
}

async function handleUpdateProfile() {
  if (!profileFormValid.value) {
    profileTouched.name = true;
    profileTouched.email = true;
    notifier.error("Dados invalidos", "Corrija os campos destacados para atualizar o perfil.");
    return;
  }

  profileLoading.value = true;

  try {
    await auth.updateProfile({
      name: profileForm.name.trim(),
      email: profileForm.email.trim(),
      profilePhotoDataUrl: profileForm.profilePhotoDataUrl
    });

    syncProfileForm();
    notifier.success("Perfil atualizado", "Suas informacoes foram salvas com sucesso.");
  } catch (error) {
    notifier.error("Falha ao atualizar perfil", resolveErrorMessage(error));
  } finally {
    profileLoading.value = false;
  }
}

async function handleChangePassword() {
  if (!passwordFormValid.value) {
    passwordTouched.currentPassword = true;
    passwordTouched.newPassword = true;
    passwordTouched.confirmPassword = true;
    notifier.error("Dados invalidos", "Corrija os campos destacados para atualizar a senha.");
    return;
  }

  passwordLoading.value = true;

  try {
    const response = await auth.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
    notifier.success("Senha atualizada", response.message);
    resetPasswordForm();
  } catch (error) {
    notifier.error("Falha ao atualizar senha", resolveErrorMessage(error));
  } finally {
    passwordLoading.value = false;
  }
}

onMounted(async () => {
  if (!auth.state.initialized) {
    await auth.bootstrap();
  }

  syncProfileForm();
  await loadProfile();
});
</script>

<template>
  <section class="space-y-6">
    <article class="erp-surface p-6 reveal-up">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Conta</p>
          <h1 class="font-heading mt-2 text-3xl text-slate-900">Perfil do usuario</h1>
          <p class="mt-2 text-sm text-slate-600">Atualize seus dados, mantenha a foto do perfil em dia e cuide da sua senha.</p>
        </div>

        <button type="button" class="erp-button-muted" :disabled="refreshLoading" @click="loadProfile">
          {{ refreshLoading ? "Atualizando..." : "Atualizar perfil" }}
        </button>
      </div>
    </article>

    <section class="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
      <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.05s">
        <h2 class="font-heading text-2xl text-slate-900">Dados pessoais</h2>

        <form class="mt-5 space-y-4" @submit.prevent="handleUpdateProfile">
          <div>
            <label class="erp-label">Nome</label>
            <input
              v-model="profileForm.name"
              class="erp-field"
              :class="profileTouched.name && profileNameError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200' : ''"
              type="text"
              required
              @input="profileTouched.name = true"
              @blur="profileTouched.name = true"
            />
            <p v-if="profileTouched.name && profileNameError" class="mt-1 text-xs text-rose-600">{{ profileNameError }}</p>
          </div>

          <div>
            <label class="erp-label">Email</label>
            <input
              v-model="profileForm.email"
              class="erp-field"
              :class="profileTouched.email && profileEmailError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200' : ''"
              type="email"
              required
              @input="profileTouched.email = true"
              @blur="profileTouched.email = true"
            />
            <p v-if="profileTouched.email && profileEmailError" class="mt-1 text-xs text-rose-600">{{ profileEmailError }}</p>
          </div>

          <button
            type="submit"
            class="erp-button-primary h-11 w-full"
            :disabled="profileLoading || photoProcessing || !profileFormValid"
          >
            {{ profileLoading ? "Salvando..." : "Salvar perfil" }}
          </button>
        </form>
      </article>

      <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.1s">
        <h2 class="font-heading text-2xl text-slate-900">Foto e resumo</h2>

        <div class="mt-5 rounded-[26px] border border-slate-200 bg-slate-50 p-4">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div class="h-24 w-24 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-900 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.7)]">
              <img
                v-if="profileForm.profilePhotoDataUrl"
                :src="profileForm.profilePhotoDataUrl"
                :alt="`Foto de ${profileForm.name || auth.state.user?.name || 'usuario'}`"
                class="block h-full w-full rounded-full object-cover"
              />
              <div v-else class="flex h-full w-full items-center justify-center text-2xl font-semibold text-white">
                {{ profilePreviewInitial }}
              </div>
            </div>

            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-slate-900">Foto do perfil</p>
              <p class="mt-1 text-sm leading-6 text-slate-500">
                PNG, JPG ou WebP. A imagem e ajustada automaticamente para manter uma exibicao limpa e proporcional.
              </p>
              <p class="mt-2 text-xs text-slate-400">A alteracao so entra em vigor depois de salvar o perfil.</p>
            </div>
          </div>

          <input
            ref="photoInputRef"
            class="hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            @change="handlePhotoSelected"
          />

          <div class="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              class="erp-button-muted"
              :disabled="photoProcessing || profileLoading"
              @click="openPhotoPicker"
            >
              {{ photoProcessing ? "Preparando..." : hasProfilePhoto ? "Trocar foto" : "Adicionar foto" }}
            </button>

            <button
              v-if="hasProfilePhoto"
              type="button"
              class="erp-button-muted border-rose-200 text-rose-700 hover:bg-rose-50"
              :disabled="photoProcessing || profileLoading"
              @click="removeSelectedPhoto"
            >
              Remover foto
            </button>
          </div>
        </div>

        <div class="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div>
            <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Nome atual</p>
            <p class="mt-1 font-semibold text-slate-900">{{ auth.state.user?.name ?? "-" }}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Email atual</p>
            <p class="mt-1 font-semibold text-slate-900">{{ auth.state.user?.email ?? "-" }}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Perfil de acesso</p>
            <p class="mt-1 font-semibold text-slate-900">
              {{ auth.state.user?.role ? formatRole(auth.state.user.role) : "-" }}
            </p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Status de primeiro acesso</p>
            <p class="mt-1 font-semibold" :class="auth.state.user?.isFirstLogin ? 'text-amber-700' : 'text-emerald-700'">
              {{ auth.state.user?.isFirstLogin ? "Pendente" : "Concluido" }}
            </p>
          </div>
        </div>
      </article>
    </section>

    <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.14s">
      <h2 class="font-heading text-2xl text-slate-900">Alterar senha</h2>

      <form class="mt-5 grid gap-4 lg:grid-cols-3" @submit.prevent="handleChangePassword">
        <div>
          <label class="erp-label">Senha atual</label>
          <input
            v-model="passwordForm.currentPassword"
            class="erp-field"
            :class="passwordTouched.currentPassword && currentPasswordError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200' : ''"
            type="password"
            autocomplete="current-password"
            required
            @input="passwordTouched.currentPassword = true"
            @blur="passwordTouched.currentPassword = true"
          />
          <p v-if="passwordTouched.currentPassword && currentPasswordError" class="mt-1 text-xs text-rose-600">
            {{ currentPasswordError }}
          </p>
        </div>

        <div>
          <label class="erp-label">Nova senha</label>
          <input
            v-model="passwordForm.newPassword"
            class="erp-field"
            :class="passwordTouched.newPassword && newPasswordError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200' : ''"
            type="password"
            minlength="6"
            autocomplete="new-password"
            required
            @input="passwordTouched.newPassword = true"
            @blur="passwordTouched.newPassword = true"
          />
          <p v-if="passwordTouched.newPassword && newPasswordError" class="mt-1 text-xs text-rose-600">
            {{ newPasswordError }}
          </p>

          <div v-if="passwordForm.newPassword" class="mt-2 space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-500">Forca da senha</span>
              <span class="font-semibold" :class="passwordStrengthLabelClass">{{ passwordStrengthLabel }}</span>
            </div>
            <div class="h-2 w-full rounded-full bg-slate-200">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="passwordStrengthBarClass"
                :style="{ width: passwordStrengthWidth }"
              ></div>
            </div>
            <p class="text-[11px] text-slate-500">
              Use ao menos 8 caracteres com letras maiusculas, minusculas, numeros e simbolos.
            </p>
          </div>
        </div>

        <div>
          <label class="erp-label">Confirmar nova senha</label>
          <input
            v-model="passwordForm.confirmPassword"
            class="erp-field"
            :class="passwordTouched.confirmPassword && confirmPasswordError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200' : ''"
            type="password"
            minlength="6"
            autocomplete="new-password"
            required
            @input="passwordTouched.confirmPassword = true"
            @blur="passwordTouched.confirmPassword = true"
          />
          <p v-if="passwordTouched.confirmPassword && confirmPasswordError" class="mt-1 text-xs text-rose-600">
            {{ confirmPasswordError }}
          </p>
        </div>

        <div class="lg:col-span-3">
          <button type="submit" class="erp-button-primary h-11 w-full lg:w-auto" :disabled="passwordLoading || !passwordFormValid">
            {{ passwordLoading ? "Atualizando..." : "Atualizar senha" }}
          </button>
        </div>
      </form>
    </article>
  </section>
</template>
