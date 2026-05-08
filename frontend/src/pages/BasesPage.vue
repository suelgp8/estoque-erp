<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useNotifier } from "../composables/useNotifier";
import { ApiError, api } from "../services/api";
import { useAuthStore } from "../stores/auth";
import type { BaseEntity } from "../types/api";
import { formatDateTime } from "../utils/format";

const auth = useAuthStore();
const notifier = useNotifier();

const bases = ref<BaseEntity[]>([]);
const loading = ref(false);
const createLoading = ref(false);
const editLoading = ref(false);
const deleteLoadingId = ref<string | null>(null);

const createForm = reactive({
  name: ""
});

const editForm = reactive({
  id: "",
  name: ""
});

const createTouched = reactive({
  name: false
});

const editTouched = reactive({
  name: false
});

const canManage = computed(() => auth.state.user?.role === "ADMIN" || auth.state.user?.role === "GESTOR");
const isEditing = computed(() => Boolean(editForm.id));

function validateName(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    return "Nome é obrigatório.";
  }

  if (normalized.length < 2) {
    return "Nome deve ter pelo menos 2 caracteres.";
  }

  if (normalized.length > 120) {
    return "Nome deve ter no máximo 120 caracteres.";
  }

  return "";
}

const createNameError = computed(() => validateName(createForm.name));
const editNameError = computed(() => validateName(editForm.name));
const createFormValid = computed(() => !createNameError.value);
const editFormValid = computed(() => !editNameError.value);

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

function resetCreateForm() {
  createForm.name = "";
  createTouched.name = false;
}

function startEdit(base: BaseEntity) {
  editForm.id = base.id;
  editForm.name = base.name;
  editTouched.name = false;
}

function cancelEdit() {
  editForm.id = "";
  editForm.name = "";
  editTouched.name = false;
}

async function loadBases() {
  if (!auth.state.token) {
    return;
  }

  loading.value = true;

  try {
    const response = await api.listBases(auth.state.token);
    bases.value = response.bases;
  } catch (error) {
    notifier.error("Falha ao carregar bases", resolveErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

async function handleCreateBase() {
  if (!auth.state.token || !canManage.value) {
    return;
  }

  if (!createFormValid.value) {
    createTouched.name = true;
    notifier.error("Dados inválidos", "Corrija os campos destacados para criar a base.");
    return;
  }

  createLoading.value = true;

  try {
    await api.createBase(auth.state.token, {
      name: createForm.name.trim()
    });

    notifier.success("Base criada", "Cadastro realizado com sucesso.");
    resetCreateForm();
    await loadBases();
  } catch (error) {
    notifier.error("Falha ao criar base", resolveErrorMessage(error));
  } finally {
    createLoading.value = false;
  }
}

async function handleEditBase() {
  if (!auth.state.token || !canManage.value || !editForm.id) {
    return;
  }

  if (!editFormValid.value) {
    editTouched.name = true;
    notifier.error("Dados inválidos", "Corrija os campos destacados para salvar a edição.");
    return;
  }

  editLoading.value = true;

  try {
    await api.updateBase(auth.state.token, editForm.id, {
      name: editForm.name.trim()
    });

    notifier.success("Base atualizada", "Dados da base foram atualizados.");
    cancelEdit();
    await loadBases();
  } catch (error) {
    notifier.error("Falha ao atualizar base", resolveErrorMessage(error));
  } finally {
    editLoading.value = false;
  }
}

async function handleDeleteBase(base: BaseEntity) {
  if (!auth.state.token || !canManage.value) {
    return;
  }

  if (!window.confirm(`Deseja realmente excluir a base ${base.name}?`)) {
    return;
  }

  deleteLoadingId.value = base.id;

  try {
    const response = await api.deleteBase(auth.state.token, base.id);
    notifier.success("Base excluída", response.message);

    if (editForm.id === base.id) {
      cancelEdit();
    }

    await loadBases();
  } catch (error) {
    notifier.error("Falha ao excluir base", resolveErrorMessage(error));
  } finally {
    deleteLoadingId.value = null;
  }
}

onMounted(async () => {
  if (!auth.state.initialized) {
    await auth.bootstrap();
  }

  await loadBases();
});
</script>

<template>
  <section class="space-y-6">
    <article class="erp-surface p-6 reveal-up">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Cadastros</p>
          <h1 class="font-heading mt-2 text-3xl text-slate-900">Gestão de bases</h1>
          <p class="mt-2 text-sm text-slate-600">Cadastre e mantenha as bases utilizadas nas movimentações de estoque.</p>
        </div>

        <button type="button" class="erp-button-muted" :disabled="loading" @click="loadBases">
          <ion-icon name="refresh-outline"></ion-icon>
          {{ loading ? "Atualizando..." : "Atualizar lista" }}
        </button>
      </div>
    </article>

    <article v-if="!canManage" class="erp-surface p-6">
      <p class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Seu perfil está em modo consulta para este cadastro.
      </p>
    </article>

    <section v-if="canManage" class="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.05s">
        <h2 class="font-heading text-2xl text-slate-900">Nova base</h2>

        <form class="mt-5 space-y-4" @submit.prevent="handleCreateBase">
          <div>
            <label class="erp-label">Nome da base</label>
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

          <button type="submit" class="erp-button-primary h-11 w-full" :disabled="createLoading || !createFormValid">
            <ion-icon name="add-circle-outline"></ion-icon>
            {{ createLoading ? "Criando..." : "Criar base" }}
          </button>
        </form>
      </article>

      <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.1s">
        <h2 class="font-heading text-2xl text-slate-900">Editar base</h2>

        <div
          v-if="!isEditing"
          class="mt-5 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500"
        >
          Selecione uma base na tabela para editar.
        </div>

        <form v-else class="mt-5 space-y-4" @submit.prevent="handleEditBase">
          <div>
            <label class="erp-label">Nome da base</label>
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

          <div class="flex flex-wrap gap-2">
            <button type="submit" class="erp-button-primary" :disabled="editLoading || !editFormValid">
              <ion-icon name="save-outline"></ion-icon>
              {{ editLoading ? "Salvando..." : "Salvar alterações" }}
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
        <h2 class="font-heading text-xl text-slate-900">Bases cadastradas</h2>
        <p class="text-xs uppercase tracking-[0.14em] text-slate-500">{{ bases.length }} registros</p>
      </div>

      <div class="erp-table-wrap">
        <table class="erp-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Criado em</th>
              <th>Atualizado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="4" class="text-center text-slate-500">Carregando bases...</td>
            </tr>
            <tr v-else-if="bases.length === 0">
              <td colspan="4" class="text-center text-slate-500">Nenhuma base encontrada.</td>
            </tr>
            <tr v-for="base in bases" :key="base.id">
              <td data-label="Nome" class="font-medium text-slate-900">{{ base.name }}</td>
              <td data-label="Criado em">{{ formatDateTime(base.createdAt) }}</td>
              <td data-label="Atualizado em">{{ formatDateTime(base.updatedAt) }}</td>
              <td data-label="Acoes">
                <div v-if="canManage" class="flex flex-wrap gap-2">
                  <button type="button" class="erp-button-muted px-3 py-1.5 text-xs" @click="startEdit(base)">
                    <ion-icon name="create-outline"></ion-icon>
                    Editar
                  </button>
                  <button
                    type="button"
                    class="erp-button-muted border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                    :disabled="deleteLoadingId === base.id"
                    @click="handleDeleteBase(base)"
                  >
                    <ion-icon name="trash-outline"></ion-icon>
                    {{ deleteLoadingId === base.id ? "Excluindo..." : "Excluir" }}
                  </button>
                </div>
                <span v-else class="text-xs text-slate-500">Somente consulta</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>
