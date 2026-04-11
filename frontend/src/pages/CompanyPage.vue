<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useNotifier } from "../composables/useNotifier";
import { api, ApiError } from "../services/api";
import { useAuthStore } from "../stores/auth";
import type { CompanyEntity } from "../types/api";
import { formatDateTime } from "../utils/format";

const COMPANY_LOGO_CANVAS_WIDTH = 640;
const COMPANY_LOGO_CANVAS_HEIGHT = 240;
const IMAGE_MAX_FILE_SIZE = 5 * 1024 * 1024;
const COMPANY_LOGO_MAX_LENGTH = 850_000;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const auth = useAuthStore();
const notifier = useNotifier();

const companyForm = reactive({
  name: "",
  logoDataUrl: null as string | null
});

const companyTouched = reactive({
  name: false
});

const loading = ref(false);
const refreshLoading = ref(false);
const logoProcessing = ref(false);
const logoInputRef = ref<HTMLInputElement | null>(null);
const company = ref<CompanyEntity | null>(null);

function validateName(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    return "Nome da empresa é obrigatório.";
  }

  if (normalized.length < 2) {
    return "Nome da empresa deve ter pelo menos 2 caracteres.";
  }

  if (normalized.length > 120) {
    return "Nome da empresa deve ter no máximo 120 caracteres.";
  }

  return "";
}

const companyNameError = computed(() => validateName(companyForm.name));
const formValid = computed(() => !companyNameError.value);
const hasLogo = computed(() => Boolean(companyForm.logoDataUrl));

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

  if (typeof error === "string") {
    return error;
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

      reject(new Error("Não foi possível ler a imagem selecionada."));
    };

    reader.onerror = () => reject(new Error("Não foi possível ler a imagem selecionada."));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível processar a imagem selecionada."));
    image.src = source;
  });
}

async function buildCompanyLogoDataUrl(file: File): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    throw new Error("Use uma imagem JPG, PNG ou WebP.");
  }

  if (file.size > IMAGE_MAX_FILE_SIZE) {
    throw new Error("A imagem deve ter no máximo 5 MB.");
  }

  const imageSource = await readFileAsDataUrl(file);
  const image = await loadImage(imageSource);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("Não foi possível processar a imagem selecionada.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = COMPANY_LOGO_CANVAS_WIDTH;
  canvas.height = COMPANY_LOGO_CANVAS_HEIGHT;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Não foi possível preparar a logo para envio.");
  }

  context.clearRect(0, 0, COMPANY_LOGO_CANVAS_WIDTH, COMPANY_LOGO_CANVAS_HEIGHT);

  const scale = Math.min(COMPANY_LOGO_CANVAS_WIDTH / sourceWidth, COMPANY_LOGO_CANVAS_HEIGHT / sourceHeight);
  const targetWidth = sourceWidth * scale;
  const targetHeight = sourceHeight * scale;
  const targetX = (COMPANY_LOGO_CANVAS_WIDTH - targetWidth) / 2;
  const targetY = (COMPANY_LOGO_CANVAS_HEIGHT - targetHeight) / 2;

  context.drawImage(image, 0, 0, sourceWidth, sourceHeight, targetX, targetY, targetWidth, targetHeight);

  const dataUrl = canvas.toDataURL("image/png");

  if (dataUrl.length <= COMPANY_LOGO_MAX_LENGTH) {
    return dataUrl;
  }

  throw new Error("A logo continua muito grande. Tente uma imagem mais leve.");
}

function clearLogoInput() {
  if (logoInputRef.value) {
    logoInputRef.value.value = "";
  }
}

function openLogoPicker() {
  logoInputRef.value?.click();
}

async function handleLogoSelected(event: Event) {
  const target = event.target;

  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const file = target.files?.[0];

  if (!file) {
    return;
  }

  logoProcessing.value = true;

  try {
    companyForm.logoDataUrl = await buildCompanyLogoDataUrl(file);
    notifier.success("Logo carregada", "Salve as configurações da empresa para aplicar a nova imagem.");
  } catch (error) {
    notifier.error("Falha ao preparar logo", resolveErrorMessage(error));
  } finally {
    logoProcessing.value = false;
    clearLogoInput();
  }
}

function removeSelectedLogo() {
  companyForm.logoDataUrl = null;
  clearLogoInput();
}

function syncCompanyForm(nextCompany: CompanyEntity | null) {
  company.value = nextCompany;
  companyForm.name = nextCompany?.name ?? "";
  companyForm.logoDataUrl = nextCompany?.logoDataUrl ?? null;
  companyTouched.name = false;
  clearLogoInput();
}

async function loadCompany() {
  if (!auth.state.token) {
    return;
  }

  refreshLoading.value = true;

  try {
    const response = await api.getCompany(auth.state.token);
    syncCompanyForm(response.company);
  } catch (error) {
    notifier.error("Falha ao carregar empresa", resolveErrorMessage(error));
  } finally {
    refreshLoading.value = false;
  }
}

async function handleUpdateCompany() {
  if (!auth.state.token) {
    notifier.error("Sessão inválida", "Faça login novamente para continuar.");
    return;
  }

  if (!formValid.value) {
    companyTouched.name = true;
    notifier.error("Dados inválidos", "Corrija os campos destacados antes de salvar.");
    return;
  }

  loading.value = true;

  try {
    const response = await api.updateCompany(auth.state.token, {
      name: companyForm.name.trim(),
      logoDataUrl: companyForm.logoDataUrl
    });

    syncCompanyForm(response.company);
    await auth.refreshProfile();
    notifier.success("Empresa atualizada", "Os dados da empresa foram salvos com sucesso.");
  } catch (error) {
    notifier.error("Falha ao atualizar empresa", resolveErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!auth.state.initialized) {
    await auth.bootstrap();
  }

  await loadCompany();
});
</script>

<template>
  <section class="space-y-6">
    <article class="erp-surface p-6 reveal-up">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Administração</p>
          <h1 class="font-heading mt-2 text-3xl text-slate-900">Empresa</h1>
          <p class="mt-2 text-sm text-slate-600">Gerencie a identidade visual e os dados centrais usados em toda a aplicação.</p>
        </div>

        <button type="button" class="erp-button-muted" :disabled="refreshLoading" @click="loadCompany">
          {{ refreshLoading ? "Atualizando..." : "Atualizar dados" }}
        </button>
      </div>
    </article>

    <section class="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
      <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.05s">
        <h2 class="font-heading text-2xl text-slate-900">Dados da empresa</h2>

        <form class="mt-5 space-y-4" @submit.prevent="handleUpdateCompany">
          <div>
            <label class="erp-label">Nome da empresa</label>
            <input
              v-model="companyForm.name"
              class="erp-field"
              :class="companyTouched.name && companyNameError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200' : ''"
              type="text"
              required
              @input="companyTouched.name = true"
              @blur="companyTouched.name = true"
            />
            <p v-if="companyTouched.name && companyNameError" class="mt-1 text-xs text-rose-600">{{ companyNameError }}</p>
          </div>

          <button type="submit" class="erp-button-primary h-11 w-full" :disabled="loading || logoProcessing || !formValid">
            {{ loading ? "Salvando..." : "Salvar empresa" }}
          </button>
        </form>
      </article>

      <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.1s">
        <h2 class="font-heading text-2xl text-slate-900">Logo da empresa</h2>

        <div class="mt-5 rounded-[26px] border border-slate-200 bg-slate-50 p-4">
          <div class="flex h-28 items-center justify-center overflow-hidden rounded-[22px] border border-slate-200 bg-transparent px-4">
            <img
              v-if="companyForm.logoDataUrl"
              :src="companyForm.logoDataUrl"
              alt="Logo da empresa"
              class="block h-full w-full object-contain"
            />
            <div v-else class="text-center text-sm text-slate-400">
              Nenhuma logo cadastrada
            </div>
          </div>

          <input
            ref="logoInputRef"
            class="hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            @change="handleLogoSelected"
          />

          <div class="mt-4 flex flex-wrap gap-3">
            <button type="button" class="erp-button-muted" :disabled="logoProcessing || loading" @click="openLogoPicker">
              {{ logoProcessing ? "Preparando..." : hasLogo ? "Trocar logo" : "Adicionar logo" }}
            </button>

            <button
              v-if="hasLogo"
              type="button"
              class="erp-button-muted border-rose-200 text-rose-700 hover:bg-rose-50"
              :disabled="logoProcessing || loading"
              @click="removeSelectedLogo"
            >
              Remover logo
            </button>
          </div>

          <p class="mt-4 text-sm leading-6 text-slate-500">
            A logo aparece no menu lateral para todos os usuários da empresa. Salve as alterações para publicar a nova versão.
          </p>
        </div>

        <div class="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div>
            <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Empresa atual</p>
            <p class="mt-1 font-semibold text-slate-900">{{ company?.name ?? "-" }}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Criada em</p>
            <p class="mt-1 font-semibold text-slate-900">{{ company ? formatDateTime(company.createdAt) : "-" }}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Atualizada em</p>
            <p class="mt-1 font-semibold text-slate-900">{{ company ? formatDateTime(company.updatedAt) : "-" }}</p>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>
