<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useNotifier } from "../composables/useNotifier";
import { ApiError, api } from "../services/api";
import { useAuthStore } from "../stores/auth";
import type { BaseEntity, CategoryEntity } from "../types/api";
import { formatDateTime } from "../utils/format";

const auth = useAuthStore();
const notifier = useNotifier();

const categories = ref<CategoryEntity[]>([]);
const bases = ref<BaseEntity[]>([]);
const loading = ref(false);
const basesLoading = ref(false);
const createLoading = ref(false);
const editLoading = ref(false);
const deleteLoadingId = ref<string | null>(null);
const selectedListBaseId = ref("");

const createForm = reactive({
  name: "",
  description: "",
  allowedBaseIds: [] as string[]
});

const editForm = reactive({
  id: "",
  name: "",
  description: "",
  allowedBaseIds: [] as string[]
});

const createTouched = reactive({
  name: false,
  description: false,
  allowedBases: false
});

const editTouched = reactive({
  name: false,
  description: false,
  allowedBases: false
});

const canManage = computed(() => auth.state.user?.role === "ADMIN" || auth.state.user?.role === "GESTOR");
const isAdmin = computed(() => auth.state.user?.role === "ADMIN");
const isEditing = computed(() => Boolean(editForm.id));
const accessibleBaseIds = computed(() => new Set((auth.state.user?.allowedBases ?? []).map((base) => base.id)));
const visibleCategories = computed(() => {
  if (isAdmin.value) {
    return categories.value;
  }

  return categories.value.filter((category) =>
    category.allowedBases.some((base) => accessibleBaseIds.value.has(base.id))
  );
});
const filteredCategories = computed(() => {
  if (!selectedListBaseId.value) {
    return visibleCategories.value;
  }

  return visibleCategories.value.filter((category) =>
    category.allowedBases.some((base) => base.id === selectedListBaseId.value)
  );
});
const selectedListBaseName = computed(
  () => bases.value.find((base) => base.id === selectedListBaseId.value)?.name ?? ""
);

function normalizeBaseIds(baseIds: string[]): string[] {
  return Array.from(new Set(baseIds.map((baseId) => baseId.trim()).filter((baseId) => baseId.length > 0)));
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

function validateDescription(value: string): string {
  if (value.trim().length > 255) {
    return "Descricao deve ter no maximo 255 caracteres.";
  }

  return "";
}

function validateAllowedBases(selectedBaseIds: string[]): string {
  if (bases.value.length === 0) {
    return "Cadastre ao menos uma base antes de criar categorias.";
  }

  if (normalizeBaseIds(selectedBaseIds).length === 0) {
    return "Selecione ao menos uma base para a categoria.";
  }

  return "";
}

const createNameError = computed(() => validateName(createForm.name));
const createDescriptionError = computed(() => validateDescription(createForm.description));
const createAllowedBasesError = computed(() => validateAllowedBases(createForm.allowedBaseIds));
const editNameError = computed(() => validateName(editForm.name));
const editDescriptionError = computed(() => validateDescription(editForm.description));
const editAllowedBasesError = computed(() => validateAllowedBases(editForm.allowedBaseIds));

const createFormValid = computed(
  () => !createNameError.value && !createDescriptionError.value && !createAllowedBasesError.value
);
const editFormValid = computed(
  () => !editNameError.value && !editDescriptionError.value && !editAllowedBasesError.value
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

  if (error instanceof Error) {
    return error.message;
  }

  return "Erro inesperado";
}

function toggleBaseSelection(target: { allowedBaseIds: string[] }, baseId: string) {
  if (target.allowedBaseIds.includes(baseId)) {
    target.allowedBaseIds = target.allowedBaseIds.filter((id) => id !== baseId);
    return;
  }

  target.allowedBaseIds = [...target.allowedBaseIds, baseId];
}

function selectAllBases(target: { allowedBaseIds: string[] }) {
  target.allowedBaseIds = bases.value.map((base) => base.id);
}

function clearBaseSelection(target: { allowedBaseIds: string[] }) {
  target.allowedBaseIds = [];
}

function syncListBaseSelection() {
  if (isAdmin.value) {
    const selectedBaseStillExists = bases.value.some((base) => base.id === selectedListBaseId.value);

    if (!selectedBaseStillExists) {
      selectedListBaseId.value = "";
    }

    return;
  }

  const firstAvailableBaseId = bases.value[0]?.id ?? "";
  const selectedBaseStillExists = bases.value.some((base) => base.id === selectedListBaseId.value);

  if (!selectedBaseStillExists) {
    selectedListBaseId.value = firstAvailableBaseId;
  }
}

function categoryIsVisibleInSelectedBase(category: CategoryEntity): boolean {
  if (!selectedListBaseId.value) {
    return true;
  }

  return category.allowedBases.some((base) => base.id === selectedListBaseId.value);
}

function canManageCategoryItem(category: CategoryEntity): boolean {
  if (!canManage.value) {
    return false;
  }

  if (isAdmin.value) {
    return true;
  }

  return category.allowedBases.every((base) => accessibleBaseIds.value.has(base.id));
}

function resolveCategoryBaseSummary(category: CategoryEntity): string {
  if (selectedListBaseId.value) {
    return category.allowedBases.find((base) => base.id === selectedListBaseId.value)?.name ?? "-";
  }

  if (category.allowedBases.length === 1) {
    return category.allowedBases[0]?.name ?? "-";
  }

  return `${category.allowedBases.length} bases vinculadas`;
}

function resetCreateForm() {
  createForm.name = "";
  createForm.description = "";
  createForm.allowedBaseIds = [];
  createTouched.name = false;
  createTouched.description = false;
  createTouched.allowedBases = false;
}

function startEdit(category: CategoryEntity) {
  if (!canManageCategoryItem(category)) {
    notifier.error(
      "Acesso parcial",
      "Este cadastro tambem pertence a outras bases. Apenas um ADMIN com acesso total pode altera-lo."
    );
    return;
  }

  editForm.id = category.id;
  editForm.name = category.name;
  editForm.description = category.description ?? "";
  editForm.allowedBaseIds = category.allowedBases.map((base) => base.id);
  editTouched.name = false;
  editTouched.description = false;
  editTouched.allowedBases = false;
}

function cancelEdit() {
  editForm.id = "";
  editForm.name = "";
  editForm.description = "";
  editForm.allowedBaseIds = [];
  editTouched.name = false;
  editTouched.description = false;
  editTouched.allowedBases = false;
}

async function loadCategoriesAndBases() {
  if (!auth.state.token) {
    return;
  }

  loading.value = true;
  basesLoading.value = true;

  try {
    const [categoriesResponse, basesResponse] = await Promise.all([
      api.listCategories(auth.state.token),
      api.listBases(auth.state.token)
    ]);

    categories.value = categoriesResponse.categories;
    bases.value = basesResponse.bases;
    syncListBaseSelection();
  } catch (error) {
    notifier.error("Falha ao carregar categorias", resolveErrorMessage(error));
  } finally {
    loading.value = false;
    basesLoading.value = false;
  }
}

async function handleCreateCategory() {
  if (!auth.state.token || !canManage.value) {
    return;
  }

  if (!createFormValid.value) {
    createTouched.name = true;
    createTouched.description = true;
    createTouched.allowedBases = true;
    notifier.error("Dados invalidos", "Corrija os campos destacados para criar a categoria.");
    return;
  }

  createLoading.value = true;

  try {
    await api.createCategory(auth.state.token, {
      name: createForm.name.trim(),
      ...(createForm.description.trim() ? { description: createForm.description.trim() } : {}),
      allowedBaseIds: normalizeBaseIds(createForm.allowedBaseIds)
    });

    notifier.success("Categoria criada", "Cadastro realizado com sucesso.");
    resetCreateForm();
    await loadCategoriesAndBases();
  } catch (error) {
    notifier.error("Falha ao criar categoria", resolveErrorMessage(error));
  } finally {
    createLoading.value = false;
  }
}

async function handleEditCategory() {
  if (!auth.state.token || !canManage.value || !editForm.id) {
    return;
  }

  if (!editFormValid.value) {
    editTouched.name = true;
    editTouched.description = true;
    editTouched.allowedBases = true;
    notifier.error("Dados invalidos", "Corrija os campos destacados para salvar a edicao.");
    return;
  }

  editLoading.value = true;

  try {
    await api.updateCategory(auth.state.token, editForm.id, {
      name: editForm.name.trim(),
      description: editForm.description.trim() || null,
      allowedBaseIds: normalizeBaseIds(editForm.allowedBaseIds)
    });

    notifier.success("Categoria atualizada", "Dados da categoria foram atualizados.");
    cancelEdit();
    await loadCategoriesAndBases();
  } catch (error) {
    notifier.error("Falha ao atualizar categoria", resolveErrorMessage(error));
  } finally {
    editLoading.value = false;
  }
}

async function handleDeleteCategory(category: CategoryEntity) {
  if (!auth.state.token || !canManage.value) {
    return;
  }

  if (!canManageCategoryItem(category)) {
    notifier.error(
      "Acesso parcial",
      "Este cadastro tambem pertence a outras bases. Apenas um ADMIN com acesso total pode exclui-lo."
    );
    return;
  }

  if (!window.confirm(`Deseja realmente excluir a categoria ${category.name}?`)) {
    return;
  }

  deleteLoadingId.value = category.id;

  try {
    const response = await api.deleteCategory(auth.state.token, category.id);
    notifier.success("Categoria excluida", response.message);

    if (editForm.id === category.id) {
      cancelEdit();
    }

    await loadCategoriesAndBases();
  } catch (error) {
    notifier.error("Falha ao excluir categoria", resolveErrorMessage(error));
  } finally {
    deleteLoadingId.value = null;
  }
}

onMounted(async () => {
  if (!auth.state.initialized) {
    await auth.bootstrap();
  }

  await loadCategoriesAndBases();
});

watch(selectedListBaseId, () => {
  if (!editForm.id) {
    return;
  }

  const currentCategory = categories.value.find((category) => category.id === editForm.id);

  if (!currentCategory || !categoryIsVisibleInSelectedBase(currentCategory) || !canManageCategoryItem(currentCategory)) {
    cancelEdit();
  }
});
</script>

<template>
  <section class="space-y-6">
    <article class="erp-surface p-6 reveal-up">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Cadastros</p>
          <h1 class="font-heading mt-2 text-3xl text-slate-900">Gestao de categorias</h1>
          <p class="mt-2 text-sm text-slate-600">
            Organize os produtos por categoria e vincule cada categoria a uma ou mais bases.
          </p>
        </div>

        <button type="button" class="erp-button-muted" :disabled="loading || basesLoading" @click="loadCategoriesAndBases">
          <ion-icon name="refresh-outline"></ion-icon>
          {{ loading || basesLoading ? "Atualizando..." : "Atualizar lista" }}
        </button>
      </div>
    </article>

    <article v-if="!canManage" class="erp-surface p-6">
      <p class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Seu perfil esta em modo consulta para este cadastro.
      </p>
    </article>

    <section v-if="canManage" class="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.05s">
        <h2 class="font-heading text-2xl text-slate-900">Nova categoria</h2>

        <form class="mt-5 space-y-4" @submit.prevent="handleCreateCategory">
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
            <label class="erp-label">Descricao (opcional)</label>
            <textarea
              v-model="createForm.description"
              class="min-h-[92px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              maxlength="255"
              @input="createTouched.description = true"
              @blur="createTouched.description = true"
            />
            <p v-if="createTouched.description && createDescriptionError" class="mt-1 text-xs text-rose-600">
              {{ createDescriptionError }}
            </p>
          </div>

          <div class="space-y-3">
            <label class="erp-label">Bases vinculadas</label>

            <div
              v-if="bases.length === 0"
              class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              Cadastre ao menos uma base antes de criar categorias.
            </div>

            <div v-else class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-medium text-slate-700">Selecione uma ou mais bases para esta categoria.</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="erp-button-muted px-3 py-1.5 text-xs"
                    @click="
                      selectAllBases(createForm);
                      createTouched.allowedBases = true;
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
                      createTouched.allowedBases = true;
                    "
                  >
                    <ion-icon name="close-outline"></ion-icon>
                    Limpar
                  </button>
                </div>
              </div>

              <div class="mt-3 grid gap-2">
                <label
                  v-for="base in bases"
                  :key="`create-${base.id}`"
                  class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <input
                    class="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    type="checkbox"
                    :checked="createForm.allowedBaseIds.includes(base.id)"
                    @change="
                      toggleBaseSelection(createForm, base.id);
                      createTouched.allowedBases = true;
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
            <ion-icon name="add-circle-outline"></ion-icon>
            {{ createLoading ? "Criando..." : "Criar categoria" }}
          </button>
        </form>
      </article>

      <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.1s">
        <h2 class="font-heading text-2xl text-slate-900">Editar categoria</h2>

        <div
          v-if="!isEditing"
          class="mt-5 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500"
        >
          Selecione uma categoria na tabela para editar.
        </div>

        <form v-else class="mt-5 space-y-4" @submit.prevent="handleEditCategory">
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
            <label class="erp-label">Descricao (opcional)</label>
            <textarea
              v-model="editForm.description"
              class="min-h-[92px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              maxlength="255"
              @input="editTouched.description = true"
              @blur="editTouched.description = true"
            />
            <p v-if="editTouched.description && editDescriptionError" class="mt-1 text-xs text-rose-600">
              {{ editDescriptionError }}
            </p>
          </div>

          <div class="space-y-3">
            <label class="erp-label">Bases vinculadas</label>

            <div
              v-if="bases.length === 0"
              class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              Cadastre ao menos uma base antes de usar este cadastro.
            </div>

            <div v-else class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-medium text-slate-700">Selecione as bases permitidas para esta categoria.</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="erp-button-muted px-3 py-1.5 text-xs"
                    @click="
                      selectAllBases(editForm);
                      editTouched.allowedBases = true;
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
                      editTouched.allowedBases = true;
                    "
                  >
                    <ion-icon name="close-outline"></ion-icon>
                    Limpar
                  </button>
                </div>
              </div>

              <div class="mt-3 grid gap-2">
                <label
                  v-for="base in bases"
                  :key="`edit-${base.id}`"
                  class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <input
                    class="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    type="checkbox"
                    :checked="editForm.allowedBaseIds.includes(base.id)"
                    @change="
                      toggleBaseSelection(editForm, base.id);
                      editTouched.allowedBases = true;
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
      <div class="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 class="font-heading text-xl text-slate-900">Categorias cadastradas</h2>
          <p class="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{{ filteredCategories.length }} registros</p>
        </div>

        <div class="w-full lg:max-w-xs">
          <label class="erp-label">Base visualizada</label>
          <select v-model="selectedListBaseId" class="erp-select" :disabled="basesLoading || bases.length === 0">
            <option v-if="isAdmin" value="">Todas as bases</option>
            <option v-for="base in bases" :key="base.id" :value="base.id">{{ base.name }}</option>
          </select>
          <p class="mt-1 text-xs text-slate-500">
            {{ selectedListBaseName ? `Exibindo apenas registros vinculados a ${selectedListBaseName}.` : "Visao geral de todas as bases." }}
          </p>
        </div>
      </div>

      <div class="erp-table-wrap">
        <table class="erp-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descricao</th>
              <th>Bases</th>
              <th>Produtos</th>
              <th>Atualizado em</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="6" class="text-center text-slate-500">Carregando categorias...</td>
            </tr>
            <tr v-else-if="filteredCategories.length === 0">
              <td colspan="6" class="text-center text-slate-500">
                {{ selectedListBaseName ? "Nenhuma categoria vinculada a esta base." : "Nenhuma categoria encontrada." }}
              </td>
            </tr>
            <tr v-for="category in filteredCategories" :key="category.id">
              <td data-label="Nome" class="font-medium text-slate-900">{{ category.name }}</td>
              <td data-label="Descricao" class="max-w-[320px]" :title="category.description ?? '-'">{{ category.description ?? "-" }}</td>
              <td data-label="Bases">
                <span class="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {{ resolveCategoryBaseSummary(category) }}
                </span>
              </td>
              <td data-label="Produtos">
                <span class="inline-flex rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                  {{ category.productsCount }}
                </span>
              </td>
              <td data-label="Atualizado em">{{ formatDateTime(category.updatedAt) }}</td>
              <td data-label="Acoes">
                <div v-if="canManageCategoryItem(category)" class="flex flex-wrap gap-2">
                  <button type="button" class="erp-button-muted px-3 py-1.5 text-xs" @click="startEdit(category)">
                    <ion-icon name="create-outline"></ion-icon>
                    Editar
                  </button>
                  <button
                    type="button"
                    class="erp-button-muted border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                    :disabled="deleteLoadingId === category.id"
                    @click="handleDeleteCategory(category)"
                  >
                    <ion-icon name="trash-outline"></ion-icon>
                    {{ deleteLoadingId === category.id ? "Excluindo..." : "Excluir" }}
                  </button>
                </div>
                <span v-else-if="canManage" class="text-xs text-amber-700">Acesso parcial</span>
                <span v-else class="text-xs text-slate-500">Somente consulta</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>
