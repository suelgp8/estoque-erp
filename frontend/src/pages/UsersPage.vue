<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useNotifier } from "../composables/useNotifier";
import { ApiError, api } from "../services/api";
import { useAuthStore } from "../stores/auth";
import type { BaseEntity, ManagedUser, Role } from "../types/api";
import { formatDateTime, formatRole } from "../utils/format";

type AccessFormState = {
  role: Role;
  allowedBaseIds: string[];
};

const auth = useAuthStore();
const notifier = useNotifier();

const users = ref<ManagedUser[]>([]);
const companyBases = ref<BaseEntity[]>([]);
const loading = ref(false);
const basesLoading = ref(false);
const createLoading = ref(false);
const editLoading = ref(false);
const deleteLoadingId = ref<string | null>(null);

const createForm = reactive({
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "TECNICO" as Role,
  allowedBaseIds: [] as string[]
});

const editForm = reactive({
  id: "",
  name: "",
  email: "",
  role: "TECNICO" as Role,
  allowedBaseIds: [] as string[]
});

const createTouched = reactive({
  name: false,
  email: false,
  password: false,
  confirmPassword: false,
  allowedBases: false
});

const editTouched = reactive({
  name: false,
  email: false,
  allowedBases: false
});

const roleOptions: Role[] = ["ADMIN", "GESTOR", "TECNICO"];

const canManageUsers = computed(() => auth.state.user?.role === "ADMIN");
const isEditing = computed(() => Boolean(editForm.id));
const isEditingOwnUser = computed(() => auth.state.user?.id === editForm.id);
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeBaseIds(baseIds: string[]): string[] {
  return Array.from(new Set(baseIds.map((id) => id.trim()).filter((id) => id.length > 0)));
}

function normalizeAllowedBaseIdsForRole(role: Role, baseIds: string[]): string[] {
  const normalizedBaseIds = normalizeBaseIds(baseIds);

  if (role === "TECNICO") {
    return normalizedBaseIds.slice(0, 1);
  }

  return normalizedBaseIds;
}

function syncAllowedBasesForRole(form: AccessFormState) {
  form.allowedBaseIds = normalizeAllowedBaseIdsForRole(form.role, form.allowedBaseIds);
}

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

function validatePassword(value: string): string {
  if (!value) {
    return "Senha e obrigatoria.";
  }

  if (value.length < 6) {
    return "Senha deve ter no minimo 6 caracteres.";
  }

  if (value.length > 100) {
    return "Senha deve ter no maximo 100 caracteres.";
  }

  return "";
}

function validateConfirmPassword(value: string, password: string): string {
  if (!value) {
    return "Confirmacao de senha e obrigatoria.";
  }

  if (value !== password) {
    return "As senhas nao conferem.";
  }

  return "";
}

function validateAllowedBases(role: Role, selectedBaseIds: string[]): string {
  if (role === "ADMIN") {
    return "";
  }

  if (companyBases.value.length === 0) {
    return "Cadastre ao menos uma base antes de usar esse perfil.";
  }

  const normalizedBaseIds = normalizeAllowedBaseIdsForRole(role, selectedBaseIds);

  if (role === "GESTOR" && normalizedBaseIds.length === 0) {
    return "Selecione ao menos uma base para o gestor.";
  }

  if (role === "TECNICO" && normalizedBaseIds.length !== 1) {
    return "Selecione exatamente uma base para o tecnico.";
  }

  return "";
}

const createNameError = computed(() => validateName(createForm.name));
const createEmailError = computed(() => validateEmail(createForm.email));
const createPasswordError = computed(() => validatePassword(createForm.password));
const createConfirmPasswordError = computed(() =>
  validateConfirmPassword(createForm.confirmPassword, createForm.password)
);
const createAllowedBasesError = computed(() => validateAllowedBases(createForm.role, createForm.allowedBaseIds));

const passwordStrengthScore = computed(() => {
  const password = createForm.password;

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

const createFormValid = computed(
  () =>
    !createNameError.value &&
    !createEmailError.value &&
    !createPasswordError.value &&
    !createConfirmPasswordError.value &&
    !createAllowedBasesError.value
);

const editNameError = computed(() => validateName(editForm.name));
const editEmailError = computed(() => validateEmail(editForm.email));
const editAllowedBasesError = computed(() => validateAllowedBases(editForm.role, editForm.allowedBaseIds));

const editFormValid = computed(() => !editNameError.value && !editEmailError.value && !editAllowedBasesError.value);

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

  if (error instanceof Error) {
    return error.message;
  }

  return "Erro inesperado";
}

function markCreateAllowedBasesTouched() {
  createTouched.allowedBases = true;
}

function markEditAllowedBasesTouched() {
  editTouched.allowedBases = true;
}

function selectAllBases(form: AccessFormState) {
  form.allowedBaseIds = companyBases.value.map((base) => base.id);
  syncAllowedBasesForRole(form);
}

function clearBaseSelection(form: AccessFormState) {
  form.allowedBaseIds = [];
}

function toggleGestorBase(form: AccessFormState, baseId: string) {
  if (form.allowedBaseIds.includes(baseId)) {
    form.allowedBaseIds = form.allowedBaseIds.filter((id) => id !== baseId);
    return;
  }

  form.allowedBaseIds = [...form.allowedBaseIds, baseId];
  syncAllowedBasesForRole(form);
}

function selectTecnicoBase(form: AccessFormState, baseId: string) {
  form.allowedBaseIds = [baseId];
}

function handleCreateRoleChange() {
  syncAllowedBasesForRole(createForm);
  markCreateAllowedBasesTouched();
}

function handleEditRoleChange() {
  syncAllowedBasesForRole(editForm);
  markEditAllowedBasesTouched();
}

function resetCreateForm() {
  createForm.name = "";
  createForm.email = "";
  createForm.password = "";
  createForm.confirmPassword = "";
  createForm.role = "TECNICO";
  createForm.allowedBaseIds = [];
  createTouched.name = false;
  createTouched.email = false;
  createTouched.password = false;
  createTouched.confirmPassword = false;
  createTouched.allowedBases = false;
}

function startEdit(user: ManagedUser) {
  editForm.id = user.id;
  editForm.name = user.name;
  editForm.email = user.email;
  editForm.role = user.role;
  editForm.allowedBaseIds = normalizeAllowedBaseIdsForRole(
    user.role,
    user.allowedBases.map((base) => base.id)
  );
  editTouched.name = false;
  editTouched.email = false;
  editTouched.allowedBases = false;
}

function cancelEdit() {
  editForm.id = "";
  editForm.name = "";
  editForm.email = "";
  editForm.role = "TECNICO";
  editForm.allowedBaseIds = [];
  editTouched.name = false;
  editTouched.email = false;
  editTouched.allowedBases = false;
}

function isAdminRole(role: Role): boolean {
  return role === "ADMIN";
}

function isGestorRole(role: Role): boolean {
  return role === "GESTOR";
}

function visibleBaseLabels(user: ManagedUser): string[] {
  return user.allowedBases.slice(0, 3).map((base) => base.name);
}

function remainingBaseCount(user: ManagedUser): number {
  return Math.max(user.allowedBases.length - 3, 0);
}

async function loadUsers() {
  if (!auth.state.token || !canManageUsers.value) {
    return;
  }

  loading.value = true;

  try {
    const response = await api.listUsers(auth.state.token);
    users.value = response.users;
  } catch (error) {
    notifier.error("Falha ao carregar usuarios", resolveErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

async function loadCompanyBases() {
  if (!auth.state.token || !canManageUsers.value) {
    return;
  }

  basesLoading.value = true;

  try {
    const response = await api.listBases(auth.state.token);
    companyBases.value = response.bases;
  } catch (error) {
    notifier.error("Falha ao carregar bases", resolveErrorMessage(error));
  } finally {
    basesLoading.value = false;
  }
}

async function refreshUsersPageData() {
  await Promise.all([loadUsers(), loadCompanyBases()]);
}

async function handleCreateUser() {
  if (!auth.state.token) {
    return;
  }

  if (!createFormValid.value) {
    createTouched.name = true;
    createTouched.email = true;
    createTouched.password = true;
    createTouched.confirmPassword = true;
    createTouched.allowedBases = true;
    notifier.error("Dados invalidos", "Corrija os campos destacados para criar o usuario.");
    return;
  }

  createLoading.value = true;

  try {
    await api.createUser(auth.state.token, {
      name: createForm.name.trim(),
      email: createForm.email.trim(),
      password: createForm.password,
      role: createForm.role,
      ...(createForm.role === "ADMIN"
        ? {}
        : {
            allowedBaseIds: normalizeAllowedBaseIdsForRole(createForm.role, createForm.allowedBaseIds)
          })
    });

    notifier.success("Usuario criado", "Cadastro realizado com sucesso.");
    resetCreateForm();
    await loadUsers();
  } catch (error) {
    notifier.error("Falha ao criar usuario", resolveErrorMessage(error));
  } finally {
    createLoading.value = false;
  }
}

async function handleEditUser() {
  if (!auth.state.token || !editForm.id) {
    return;
  }

  if (!editFormValid.value) {
    editTouched.name = true;
    editTouched.email = true;
    editTouched.allowedBases = true;
    notifier.error("Dados invalidos", "Corrija os campos destacados para salvar a edicao.");
    return;
  }

  editLoading.value = true;

  try {
    await api.updateUser(auth.state.token, editForm.id, {
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      role: editForm.role,
      ...(editForm.role === "ADMIN"
        ? {}
        : {
            allowedBaseIds: normalizeAllowedBaseIdsForRole(editForm.role, editForm.allowedBaseIds)
          })
    });

    notifier.success("Usuario atualizado", "Dados do usuario foram atualizados.");
    cancelEdit();
    await loadUsers();
  } catch (error) {
    notifier.error("Falha ao atualizar usuario", resolveErrorMessage(error));
  } finally {
    editLoading.value = false;
  }
}

async function handleDeleteUser(user: ManagedUser) {
  if (!auth.state.token) {
    return;
  }

  if (!window.confirm(`Deseja realmente excluir o usuario ${user.name}?`)) {
    return;
  }

  deleteLoadingId.value = user.id;

  try {
    const response = await api.deleteUser(auth.state.token, user.id);
    notifier.success("Usuario excluido", response.message);

    if (editForm.id === user.id) {
      cancelEdit();
    }

    await loadUsers();
  } catch (error) {
    notifier.error("Falha ao excluir usuario", resolveErrorMessage(error));
  } finally {
    deleteLoadingId.value = null;
  }
}

onMounted(async () => {
  if (!auth.state.initialized) {
    await auth.bootstrap();
  }

  await refreshUsersPageData();
});
</script>

<template>
  <section class="space-y-6">
    <article class="erp-surface p-6 reveal-up">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Administracao</p>
          <h1 class="font-heading mt-2 text-3xl text-slate-900">Gestao de usuarios</h1>
          <p class="mt-2 text-sm text-slate-600">
            Crie, edite e remova usuarios da empresa, definindo o acesso a bases conforme o perfil.
          </p>
        </div>

        <button type="button" class="erp-button-muted" :disabled="loading || basesLoading" @click="refreshUsersPageData">
          <ion-icon name="refresh-outline"></ion-icon>
          {{ loading || basesLoading ? "Atualizando..." : "Atualizar lista" }}
        </button>
      </div>
    </article>

    <article v-if="!canManageUsers" class="erp-surface p-6">
      <p class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Seu perfil nao possui permissao para gerenciar usuarios.
      </p>
    </article>

    <template v-else>
      <section class="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.05s">
          <h2 class="font-heading text-2xl text-slate-900">Novo usuario</h2>

          <form class="mt-5 space-y-4" @submit.prevent="handleCreateUser">
            <div>
              <label class="erp-label">Nome</label>
              <input
                v-model="createForm.name"
                class="erp-field"
                :class="createTouched.name && createNameError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200' : ''"
                type="text"
                required
                @input="createTouched.name = true"
                @blur="createTouched.name = true"
              />
              <p v-if="createTouched.name && createNameError" class="mt-1 text-xs text-rose-600">{{ createNameError }}</p>
            </div>

            <div>
              <label class="erp-label">Email</label>
              <input
                v-model="createForm.email"
                class="erp-field"
                :class="createTouched.email && createEmailError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200' : ''"
                type="email"
                required
                @input="createTouched.email = true"
                @blur="createTouched.email = true"
              />
              <p v-if="createTouched.email && createEmailError" class="mt-1 text-xs text-rose-600">{{ createEmailError }}</p>
            </div>

            <div>
              <label class="erp-label">Senha inicial</label>
              <input
                v-model="createForm.password"
                class="erp-field"
                :class="createTouched.password && createPasswordError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200' : ''"
                type="password"
                minlength="6"
                autocomplete="new-password"
                required
                @input="createTouched.password = true"
                @blur="createTouched.password = true"
              />
              <p v-if="createTouched.password && createPasswordError" class="mt-1 text-xs text-rose-600">{{ createPasswordError }}</p>

              <div v-if="createForm.password" class="mt-2 space-y-1.5">
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
              <label class="erp-label">Confirmar senha</label>
              <input
                v-model="createForm.confirmPassword"
                class="erp-field"
                :class="
                  createTouched.confirmPassword && createConfirmPasswordError
                    ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                    : ''
                "
                type="password"
                minlength="6"
                autocomplete="new-password"
                required
                @input="createTouched.confirmPassword = true"
                @blur="createTouched.confirmPassword = true"
              />
              <p v-if="createTouched.confirmPassword && createConfirmPasswordError" class="mt-1 text-xs text-rose-600">
                {{ createConfirmPasswordError }}
              </p>
            </div>

            <div>
              <label class="erp-label">Perfil</label>
              <select v-model="createForm.role" class="erp-select" @change="handleCreateRoleChange">
                <option v-for="role in roleOptions" :key="role" :value="role">{{ formatRole(role) }}</option>
              </select>
            </div>

            <div class="space-y-3">
              <label class="erp-label">Bases permitidas</label>

              <div v-if="isAdminRole(createForm.role)" class="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                Usuarios ADMIN recebem acesso automatico a todas as bases cadastradas.
                <span class="mt-1 block text-xs text-sky-700">
                  Bases disponiveis no momento: {{ companyBases.length }}
                </span>
              </div>

              <div
                v-else-if="companyBases.length === 0"
                class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
              >
                Cadastre ao menos uma base antes de criar usuarios GESTOR ou TECNICO.
              </div>

              <div v-else-if="isGestorRole(createForm.role)" class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-sm font-medium text-slate-700">
                    Selecione uma ou mais bases para o gestor.
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="erp-button-muted px-3 py-1.5 text-xs"
                      @click="
                        selectAllBases(createForm);
                        markCreateAllowedBasesTouched();
                      "
                    >
                      <ion-icon name="checkmark-done-outline"></ion-icon>
                      Marcar todas
                    </button>
                    <button
                      type="button"
                      class="erp-button-muted px-3 py-1.5 text-xs"
                      @click="
                        clearBaseSelection(createForm);
                        markCreateAllowedBasesTouched();
                      "
                    >
                      <ion-icon name="close-outline"></ion-icon>
                      Limpar
                    </button>
                  </div>
                </div>

                <div class="mt-3 grid gap-2">
                  <label
                    v-for="base in companyBases"
                    :key="`create-${base.id}`"
                    class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <input
                      class="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      type="checkbox"
                      :checked="createForm.allowedBaseIds.includes(base.id)"
                      @change="
                        toggleGestorBase(createForm, base.id);
                        markCreateAllowedBasesTouched();
                      "
                    />
                    <span>{{ base.name }}</span>
                  </label>
                </div>
              </div>

              <div v-else class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p class="text-sm font-medium text-slate-700">Selecione a unica base permitida para o tecnico.</p>

                <div class="mt-3 grid gap-2">
                  <label
                    v-for="base in companyBases"
                    :key="`create-tech-${base.id}`"
                    class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <input
                      class="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
                      type="radio"
                      name="create-technician-base"
                      :checked="createForm.allowedBaseIds[0] === base.id"
                      @change="
                        selectTecnicoBase(createForm, base.id);
                        markCreateAllowedBasesTouched();
                      "
                    />
                    <span>{{ base.name }}</span>
                  </label>
                </div>
              </div>

              <p v-if="createTouched.allowedBases && createAllowedBasesError" class="text-xs text-rose-600">
                {{ createAllowedBasesError }}
              </p>
            </div>

            <button type="submit" class="erp-button-primary h-11 w-full" :disabled="createLoading || !createFormValid">
              <ion-icon name="person-add-outline"></ion-icon>
              {{ createLoading ? "Criando..." : "Criar usuario" }}
            </button>
          </form>
        </article>

        <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.1s">
          <h2 class="font-heading text-2xl text-slate-900">Editar usuario</h2>

          <div v-if="!isEditing" class="mt-5 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            Selecione um usuario na tabela para editar.
          </div>

          <form v-else class="mt-5 space-y-4" @submit.prevent="handleEditUser">
            <div>
              <label class="erp-label">Nome</label>
              <input
                v-model="editForm.name"
                class="erp-field"
                :class="editTouched.name && editNameError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200' : ''"
                type="text"
                required
                @input="editTouched.name = true"
                @blur="editTouched.name = true"
              />
              <p v-if="editTouched.name && editNameError" class="mt-1 text-xs text-rose-600">{{ editNameError }}</p>
            </div>

            <div>
              <label class="erp-label">Email</label>
              <input
                v-model="editForm.email"
                class="erp-field"
                :class="editTouched.email && editEmailError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200' : ''"
                type="email"
                required
                @input="editTouched.email = true"
                @blur="editTouched.email = true"
              />
              <p v-if="editTouched.email && editEmailError" class="mt-1 text-xs text-rose-600">{{ editEmailError }}</p>
            </div>

            <div>
              <label class="erp-label">Perfil</label>
              <select v-model="editForm.role" class="erp-select" :disabled="isEditingOwnUser" @change="handleEditRoleChange">
                <option v-for="role in roleOptions" :key="role" :value="role">{{ formatRole(role) }}</option>
              </select>
              <p v-if="isEditingOwnUser" class="mt-2 text-xs text-amber-700">
                Nao e permitido alterar o proprio perfil por esta tela.
              </p>
            </div>

            <div class="space-y-3">
              <label class="erp-label">Bases permitidas</label>

              <div v-if="isAdminRole(editForm.role)" class="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                Usuarios ADMIN recebem acesso automatico a todas as bases cadastradas.
                <span class="mt-1 block text-xs text-sky-700">
                  Bases disponiveis no momento: {{ companyBases.length }}
                </span>
              </div>

              <div
                v-else-if="companyBases.length === 0"
                class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
              >
                Cadastre ao menos uma base antes de usar esse perfil.
              </div>

              <div v-else-if="isGestorRole(editForm.role)" class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-sm font-medium text-slate-700">
                    Selecione as bases permitidas para o gestor.
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="erp-button-muted px-3 py-1.5 text-xs"
                      @click="
                        selectAllBases(editForm);
                        markEditAllowedBasesTouched();
                      "
                    >
                      <ion-icon name="checkmark-done-outline"></ion-icon>
                      Marcar todas
                    </button>
                    <button
                      type="button"
                      class="erp-button-muted px-3 py-1.5 text-xs"
                      @click="
                        clearBaseSelection(editForm);
                        markEditAllowedBasesTouched();
                      "
                    >
                      <ion-icon name="close-outline"></ion-icon>
                      Limpar
                    </button>
                  </div>
                </div>

                <div class="mt-3 grid gap-2">
                  <label
                    v-for="base in companyBases"
                    :key="`edit-${base.id}`"
                    class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <input
                      class="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      type="checkbox"
                      :checked="editForm.allowedBaseIds.includes(base.id)"
                      @change="
                        toggleGestorBase(editForm, base.id);
                        markEditAllowedBasesTouched();
                      "
                    />
                    <span>{{ base.name }}</span>
                  </label>
                </div>
              </div>

              <div v-else class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p class="text-sm font-medium text-slate-700">Selecione a unica base permitida para o tecnico.</p>

                <div class="mt-3 grid gap-2">
                  <label
                    v-for="base in companyBases"
                    :key="`edit-tech-${base.id}`"
                    class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <input
                      class="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
                      type="radio"
                      name="edit-technician-base"
                      :checked="editForm.allowedBaseIds[0] === base.id"
                      @change="
                        selectTecnicoBase(editForm, base.id);
                        markEditAllowedBasesTouched();
                      "
                    />
                    <span>{{ base.name }}</span>
                  </label>
                </div>
              </div>

              <p v-if="editTouched.allowedBases && editAllowedBasesError" class="text-xs text-rose-600">
                {{ editAllowedBasesError }}
              </p>
            </div>

            <div class="flex flex-wrap gap-2">
              <button type="submit" class="erp-button-primary" :disabled="editLoading || !editFormValid">
                <ion-icon name="save-outline"></ion-icon>
                {{ editLoading ? "Salvando..." : "Salvar alteracoes" }}
              </button>
              <button type="button" class="erp-button-muted" @click="cancelEdit">
                <ion-icon name="close-circle-outline"></ion-icon>
                Cancelar
              </button>
            </div>
          </form>
        </article>
      </section>

      <article class="erp-surface p-5 reveal-up" style="animation-delay: 0.14s">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-heading text-xl text-slate-900">Usuarios cadastrados</h2>
          <p class="text-xs uppercase tracking-[0.14em] text-slate-500">{{ users.length }} registros</p>
        </div>

        <div class="erp-table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Perfil</th>
                <th>Bases</th>
                <th>Primeiro acesso</th>
                <th>Criado em</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="7" class="text-center text-slate-500">Carregando usuarios...</td>
              </tr>
              <tr v-else-if="users.length === 0">
                <td colspan="7" class="text-center text-slate-500">Nenhum usuario encontrado.</td>
              </tr>
              <tr v-for="user in users" :key="user.id">
                <td data-label="Nome" class="font-medium text-slate-900">{{ user.name }}</td>
                <td data-label="Email">{{ user.email }}</td>
                <td data-label="Perfil">{{ formatRole(user.role) }}</td>
                <td data-label="Bases">
                  <div class="flex flex-wrap gap-1.5">
                    <span
                      v-if="isAdminRole(user.role)"
                      class="inline-flex rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800"
                    >
                      Todas as bases
                    </span>
                    <template v-else>
                      <span
                        v-for="baseName in visibleBaseLabels(user)"
                        :key="`${user.id}-${baseName}`"
                        class="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                      >
                        {{ baseName }}
                      </span>
                      <span
                        v-if="remainingBaseCount(user) > 0"
                        class="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600"
                      >
                        +{{ remainingBaseCount(user) }}
                      </span>
                    </template>
                  </div>
                </td>
                <td data-label="Primeiro acesso">
                  <span
                    class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold"
                    :class="user.isFirstLogin ? 'border-amber-200 bg-amber-100 text-amber-800' : 'border-emerald-200 bg-emerald-100 text-emerald-800'"
                  >
                    {{ user.isFirstLogin ? "Pendente" : "Concluido" }}
                  </span>
                </td>
                <td data-label="Criado em">{{ formatDateTime(user.createdAt) }}</td>
                <td data-label="Acoes">
                  <div class="flex flex-wrap gap-2">
                    <button type="button" class="erp-button-muted px-3 py-1.5 text-xs" @click="startEdit(user)">
                      <ion-icon name="create-outline"></ion-icon>
                      Editar
                    </button>
                    <button
                      type="button"
                      class="erp-button-muted border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                      :disabled="deleteLoadingId === user.id || user.id === auth.state.user?.id"
                      @click="handleDeleteUser(user)"
                    >
                      <ion-icon name="trash-outline"></ion-icon>
                      {{ deleteLoadingId === user.id ? "Excluindo..." : "Excluir" }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </template>
  </section>
</template>
