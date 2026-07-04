<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useNotifier } from "../composables/useNotifier";
import { ApiError, api } from "../services/api";
import { useAuthStore } from "../stores/auth";
import type { BaseEntity, CategoryEntity, ProductEntity, ReportFormat, StockStatus } from "../types/api";
import { formatDateTime } from "../utils/format";

const auth = useAuthStore();
const notifier = useNotifier();

const products = ref<ProductEntity[]>([]);
const categories = ref<CategoryEntity[]>([]);
const bases = ref<BaseEntity[]>([]);
const loading = ref(false);
const createLoading = ref(false);
const editLoading = ref(false);
const deleteLoadingId = ref<string | null>(null);
const exporting = ref<ReportFormat | null>(null);
const selectedListBaseId = ref("");
const selectedListCategoryId = ref("");
const selectedListIndicator = ref<"" | StockStatus>("");
const productSearch = ref("");
const expandedProductIds = ref<string[]>([]);
const stockConfigDrafts = reactive<Record<string, { minimumQuantity: number; idealQuantity: number }>>({});
const stockConfigSavingKey = ref("");

const createForm = reactive({
  name: "",
  description: "",
  minimumStock: 0,
  categoryId: "",
  allowedBaseIds: [] as string[]
});

const editForm = reactive({
  id: "",
  name: "",
  sku: "",
  description: "",
  minimumStock: 0,
  categoryId: "",
  allowedBaseIds: [] as string[]
});

const createTouched = reactive({
  name: false,
  description: false,
  allowedBases: false,
  categoryId: false
});

const editTouched = reactive({
  name: false,
  description: false,
  allowedBases: false,
  categoryId: false
});

const canManage = computed(() => auth.state.user?.role === "ADMIN" || auth.state.user?.role === "GESTOR");
const isAdmin = computed(() => auth.state.user?.role === "ADMIN");
const accessibleBaseIds = computed(() => new Set((auth.state.user?.allowedBases ?? []).map((base) => base.id)));
const visibleProducts = computed(() => {
  if (isAdmin.value) {
    return products.value;
  }

  return products.value.filter((product) =>
    product.allowedBases.some((base) => accessibleBaseIds.value.has(base.id))
  );
});

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

const normalizedProductSearch = computed(() => normalizeSearchText(productSearch.value));
const selectedListIndicatorLabel = computed(() => {
  if (selectedListIndicator.value === "CRITICAL") {
    return "Critico";
  }

  if (selectedListIndicator.value === "WARNING") {
    return "Atencao";
  }

  if (selectedListIndicator.value === "HEALTHY") {
    return "Saudavel";
  }

  return "";
});

const filteredProducts = computed(() => {
  const productsByBase = !selectedListBaseId.value
    ? visibleProducts.value
    : visibleProducts.value.filter((product) =>
        product.allowedBases.some((base) => base.id === selectedListBaseId.value)
      );

  const productsByCategory = !selectedListCategoryId.value
    ? productsByBase
    : productsByBase.filter((product) => product.categoryId === selectedListCategoryId.value);

  const productsByIndicator = !selectedListIndicator.value
    ? productsByCategory
    : productsByCategory.filter((product) => resolveProductHealthStatus(product) === selectedListIndicator.value);

  if (!normalizedProductSearch.value) {
    return productsByIndicator;
  }

  return productsByIndicator.filter((product) => {
    const searchTarget = `${product.name} ${product.sku}`;
    return normalizeSearchText(searchTarget).includes(normalizedProductSearch.value);
  });
});
const selectedListBaseName = computed(
  () => bases.value.find((base) => base.id === selectedListBaseId.value)?.name ?? ""
);
const selectedListCategoryName = computed(
  () => categories.value.find((category) => category.id === selectedListCategoryId.value)?.name ?? ""
);

function resolveDisplayedStockQuantity(product: ProductEntity): number {
  if (!selectedListBaseId.value) {
    return product.stockQuantity;
  }

  return product.stockByBase.find((stock) => stock.baseId === selectedListBaseId.value)?.quantity ?? 0;
}

function resolveDisplayedThresholds(product: ProductEntity): {
  minimumQuantity: number | null;
  idealQuantity: number | null;
} {
  if (!selectedListBaseId.value) {
    return {
      minimumQuantity: null,
      idealQuantity: null
    };
  }

  const stock = product.stockByBase.find((item) => item.baseId === selectedListBaseId.value);

  return {
    minimumQuantity: stock?.minimumQuantity ?? 0,
    idealQuantity: stock?.idealQuantity ?? 0
  };
}

function resolveStatusMeta(status: StockStatus): {
  label: string;
  tone: string;
} {
  if (status === "CRITICAL") {
    return {
      label: "Critico",
      tone: "border-rose-200 bg-rose-100 text-rose-800"
    };
  }

  if (status === "WARNING") {
    return {
      label: "Atencao",
      tone: "border-amber-200 bg-amber-100 text-amber-800"
    };
  }

  return {
    label: "Saudavel",
    tone: "border-emerald-200 bg-emerald-100 text-emerald-800"
  };
}

function resolveStockHealth(product: ProductEntity): {
  label: string;
  tone: string;
} {
  return resolveStatusMeta(resolveProductHealthStatus(product));
}

function resolveProductHealthStatus(product: ProductEntity): StockStatus {
  if (selectedListBaseId.value) {
    const stock = product.stockByBase.find((item) => item.baseId === selectedListBaseId.value);
    return stock?.status ?? "HEALTHY";
  }

  if (product.stockByBase.some((stock) => stock.status === "CRITICAL")) {
    return "CRITICAL";
  }

  if (product.stockByBase.some((stock) => stock.status === "WARNING")) {
    return "WARNING";
  }

  return "HEALTHY";
}

function resolveHealthSummary(product: ProductEntity): string {
  if (selectedListBaseId.value) {
    return resolveStockHealth(product).label;
  }

  const criticalCount = product.stockByBase.filter((stock) => stock.status === "CRITICAL").length;
  const warningCount = product.stockByBase.filter((stock) => stock.status === "WARNING").length;

  if (criticalCount > 0) {
    return `${criticalCount} base(s) em nivel critico`;
  }

  if (warningCount > 0) {
    return `${warningCount} base(s) em atencao`;
  }

  return "Bases dentro da meta";
}

function normalizeBaseIds(baseIds: string[]): string[] {
  return Array.from(new Set(baseIds.map((baseId) => baseId.trim()).filter((baseId) => baseId.length > 0)));
}

function categorySupportsBases(category: CategoryEntity, baseIds: string[]): boolean {
  const categoryBaseIds = new Set(category.allowedBases.map((base) => base.id));
  return baseIds.every((baseId) => categoryBaseIds.has(baseId));
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

function validateMinimumStock(value: number): string {
  if (!Number.isInteger(value) || value < 0) {
    return "Estoque minimo deve ser um numero inteiro maior ou igual a zero.";
  }

  return "";
}

function validateAllowedBases(selectedBaseIds: string[]): string {
  if (bases.value.length === 0) {
    return "Cadastre ao menos uma base antes de criar produtos.";
  }

  if (normalizeBaseIds(selectedBaseIds).length === 0) {
    return "Selecione ao menos uma base para o produto.";
  }

  return "";
}

function validateCategory(categoryId: string, selectedBaseIds: string[]): string {
  if (!categoryId) {
    return "";
  }

  const normalizedBaseIds = normalizeBaseIds(selectedBaseIds);
  const category = categories.value.find((item) => item.id === categoryId);

  if (!category) {
    return "Categoria invalida.";
  }

  if (!categorySupportsBases(category, normalizedBaseIds)) {
    return "A categoria selecionada deve permitir todas as bases do produto.";
  }

  return "";
}

const createNameError = computed(() => validateName(createForm.name));
const createDescriptionError = computed(() => validateDescription(createForm.description));
const createMinimumStockError = computed(() => validateMinimumStock(createForm.minimumStock));
const createAllowedBasesError = computed(() => validateAllowedBases(createForm.allowedBaseIds));
const createCategoryError = computed(() => validateCategory(createForm.categoryId, createForm.allowedBaseIds));

const editNameError = computed(() => validateName(editForm.name));
const editDescriptionError = computed(() => validateDescription(editForm.description));
const editMinimumStockError = computed(() => validateMinimumStock(editForm.minimumStock));
const editAllowedBasesError = computed(() => validateAllowedBases(editForm.allowedBaseIds));
const editCategoryError = computed(() => validateCategory(editForm.categoryId, editForm.allowedBaseIds));

const createFormValid = computed(
  () =>
    !createNameError.value &&
    !createDescriptionError.value &&
    !createMinimumStockError.value &&
    !createAllowedBasesError.value &&
    !createCategoryError.value
);

const editFormValid = computed(
  () =>
    !editNameError.value &&
    !editDescriptionError.value &&
    !editMinimumStockError.value &&
    !editAllowedBasesError.value &&
    !editCategoryError.value
);

const availableCreateCategories = computed(() => {
  const normalizedBaseIds = normalizeBaseIds(createForm.allowedBaseIds);

  if (normalizedBaseIds.length === 0) {
    return categories.value;
  }

  return categories.value.filter((category) => categorySupportsBases(category, normalizedBaseIds));
});

const availableEditCategories = computed(() => {
  const normalizedBaseIds = normalizeBaseIds(editForm.allowedBaseIds);

  if (normalizedBaseIds.length === 0) {
    return categories.value;
  }

  return categories.value.filter((category) => categorySupportsBases(category, normalizedBaseIds));
});

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

function downloadExport(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

function syncListCategorySelection() {
  const selectedCategoryStillExists = categories.value.some((category) => category.id === selectedListCategoryId.value);

  if (!selectedCategoryStillExists) {
    selectedListCategoryId.value = "";
  }
}

function productIsVisibleInSelectedBase(product: ProductEntity): boolean {
  if (!selectedListBaseId.value) {
    return true;
  }

  return product.allowedBases.some((base) => base.id === selectedListBaseId.value);
}

function canManageProductItem(product: ProductEntity): boolean {
  if (!canManage.value) {
    return false;
  }

  if (isAdmin.value) {
    return true;
  }

  return product.allowedBases.every((base) => accessibleBaseIds.value.has(base.id));
}

function canManageProductBase(product: ProductEntity, baseId: string): boolean {
  if (!canManage.value) {
    return false;
  }

  if (isAdmin.value) {
    return true;
  }

  return product.allowedBases.some((base) => base.id === baseId) && accessibleBaseIds.value.has(baseId);
}

function resolveProductBaseSummary(product: ProductEntity): string {
  if (selectedListBaseId.value) {
    return product.allowedBases.find((base) => base.id === selectedListBaseId.value)?.name ?? "-";
  }

  if (product.allowedBases.length === 1) {
    return product.allowedBases[0]?.name ?? "-";
  }

  return `${product.allowedBases.length} bases vinculadas`;
}

function resolveVisibleStockRows(product: ProductEntity) {
  const visibleRows = !selectedListBaseId.value
    ? product.stockByBase
    : product.stockByBase.filter((stock) => stock.baseId === selectedListBaseId.value);

  return [...visibleRows].sort((left, right) =>
    resolveBaseName(product, left.baseId).localeCompare(resolveBaseName(product, right.baseId), "pt-BR")
  );
}

function resolveBaseName(product: ProductEntity, baseId: string): string {
  return product.allowedBases.find((base) => base.id === baseId)?.name ?? baseId;
}

function isProductExpanded(productId: string): boolean {
  return expandedProductIds.value.includes(productId);
}

function toggleProductExpansion(productId: string) {
  if (isProductExpanded(productId)) {
    if (editForm.id === productId) {
      cancelEdit();
    }

    expandedProductIds.value = expandedProductIds.value.filter((id) => id !== productId);
    return;
  }

  expandedProductIds.value = [...expandedProductIds.value, productId];
}

function syncExpandedProducts() {
  const visibleProductIds = new Set(filteredProducts.value.map((product) => product.id));
  expandedProductIds.value = expandedProductIds.value.filter((productId) => visibleProductIds.has(productId));
}

function buildStockConfigDraftKey(productId: string, baseId: string): string {
  return `${productId}:${baseId}`;
}

function syncStockConfigDrafts() {
  for (const key of Object.keys(stockConfigDrafts)) {
    delete stockConfigDrafts[key];
  }

  for (const product of products.value) {
    for (const stock of product.stockByBase) {
      stockConfigDrafts[buildStockConfigDraftKey(product.id, stock.baseId)] = {
        minimumQuantity: stock.minimumQuantity,
        idealQuantity: stock.idealQuantity
      };
    }
  }
}

function getStockConfigDraft(productId: string, baseId: string): { minimumQuantity: number; idealQuantity: number } {
  const key = buildStockConfigDraftKey(productId, baseId);

  if (!stockConfigDrafts[key]) {
    stockConfigDrafts[key] = {
      minimumQuantity: 0,
      idealQuantity: 0
    };
  }

  return stockConfigDrafts[key];
}

function validateStockConfiguration(minimumQuantity: number, idealQuantity: number): string {
  if (!Number.isInteger(minimumQuantity) || minimumQuantity < 0) {
    return "Estoque minimo deve ser um numero inteiro maior ou igual a zero.";
  }

  if (!Number.isInteger(idealQuantity) || idealQuantity < 0) {
    return "Estoque ideal deve ser um numero inteiro maior ou igual a zero.";
  }

  if (idealQuantity < minimumQuantity) {
    return "Estoque ideal deve ser maior ou igual ao mínimo";
  }

  return "";
}

function resolveStockConfigurationError(productId: string, baseId: string): string {
  const draft = getStockConfigDraft(productId, baseId);

  return validateStockConfiguration(draft.minimumQuantity, draft.idealQuantity);
}

function resetCreateForm() {
  createForm.name = "";
  createForm.description = "";
  createForm.minimumStock = 0;
  createForm.categoryId = "";
  createForm.allowedBaseIds = [];
  createTouched.name = false;
  createTouched.description = false;
  createTouched.allowedBases = false;
  createTouched.categoryId = false;
}

function startEdit(product: ProductEntity) {
  if (!canManageProductItem(product)) {
    notifier.error(
      "Acesso parcial",
      "Este cadastro tambem pertence a outras bases. Apenas um ADMIN com acesso total pode altera-lo."
    );
    return;
  }

  editForm.id = product.id;
  editForm.name = product.name;
  editForm.sku = product.sku;
  editForm.description = product.description ?? "";
  editForm.minimumStock = product.minimumStock;
  editForm.categoryId = product.categoryId ?? "";
  editForm.allowedBaseIds = product.allowedBases.map((base) => base.id);
  editTouched.name = false;
  editTouched.description = false;
  editTouched.allowedBases = false;
  editTouched.categoryId = false;

  if (!isProductExpanded(product.id)) {
    expandedProductIds.value = [...expandedProductIds.value, product.id];
  }
}

function cancelEdit() {
  editForm.id = "";
  editForm.name = "";
  editForm.sku = "";
  editForm.description = "";
  editForm.minimumStock = 0;
  editForm.categoryId = "";
  editForm.allowedBaseIds = [];
  editTouched.name = false;
  editTouched.description = false;
  editTouched.allowedBases = false;
  editTouched.categoryId = false;
}

async function handleSaveStockConfiguration(product: ProductEntity, baseId: string) {
  if (!auth.state.token || !canManageProductBase(product, baseId)) {
    return;
  }

  const draft = getStockConfigDraft(product.id, baseId);

  const validationMessage = validateStockConfiguration(draft.minimumQuantity, draft.idealQuantity);

  if (validationMessage) {
    notifier.error("Configuracao invalida", validationMessage);
    return;
  }

  const savingKey = buildStockConfigDraftKey(product.id, baseId);
  stockConfigSavingKey.value = savingKey;

  try {
    await api.updateStockConfiguration(auth.state.token, {
      productId: product.id,
      baseId,
      minimumQuantity: draft.minimumQuantity,
      idealQuantity: draft.idealQuantity
    });

    notifier.success("Configuracao salva", `Estoque por base atualizado para ${resolveBaseName(product, baseId)}.`);
    await loadProductsCategoriesAndBases();
  } catch (error) {
    notifier.error("Falha ao salvar configuracao", resolveErrorMessage(error));
  } finally {
    if (stockConfigSavingKey.value === savingKey) {
      stockConfigSavingKey.value = "";
    }
  }
}

async function loadProductsCategoriesAndBases() {
  if (!auth.state.token) {
    return;
  }

  loading.value = true;

  try {
    const [productsResponse, categoriesResponse, basesResponse] = await Promise.all([
      api.listProducts(auth.state.token),
      api.listCategories(auth.state.token),
      api.listBases(auth.state.token)
    ]);

    products.value = productsResponse.products;
    categories.value = categoriesResponse.categories;
    bases.value = basesResponse.bases;
    syncStockConfigDrafts();
    syncListBaseSelection();
    syncListCategorySelection();
  } catch (error) {
    notifier.error("Falha ao carregar produtos", resolveErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

async function handleCreateProduct() {
  if (!auth.state.token || !canManage.value) {
    return;
  }

  if (!createFormValid.value) {
    createTouched.name = true;
    createTouched.description = true;
    createTouched.allowedBases = true;
    createTouched.categoryId = true;
    notifier.error("Dados invalidos", "Corrija os campos destacados para criar o produto.");
    return;
  }

  createLoading.value = true;

  try {
    await api.createProduct(auth.state.token, {
      name: createForm.name.trim(),
      ...(createForm.description.trim() ? { description: createForm.description.trim() } : {}),
      minimumStock: createForm.minimumStock,
      ...(createForm.categoryId ? { categoryId: createForm.categoryId } : {}),
      allowedBaseIds: normalizeBaseIds(createForm.allowedBaseIds)
    });

    notifier.success("Produto criado", "Cadastro realizado com sucesso.");
    resetCreateForm();
    await loadProductsCategoriesAndBases();
  } catch (error) {
    notifier.error("Falha ao criar produto", resolveErrorMessage(error));
  } finally {
    createLoading.value = false;
  }
}

async function handleEditProduct() {
  if (!auth.state.token || !canManage.value || !editForm.id) {
    return;
  }

  if (!editFormValid.value) {
    editTouched.name = true;
    editTouched.description = true;
    editTouched.allowedBases = true;
    editTouched.categoryId = true;
    notifier.error("Dados invalidos", "Corrija os campos destacados para salvar a edicao.");
    return;
  }

  editLoading.value = true;

  try {
    await api.updateProduct(auth.state.token, editForm.id, {
      name: editForm.name.trim(),
      description: editForm.description.trim() || null,
      minimumStock: editForm.minimumStock,
      categoryId: editForm.categoryId || null,
      allowedBaseIds: normalizeBaseIds(editForm.allowedBaseIds)
    });

    notifier.success("Produto atualizado", "Dados do produto foram atualizados.");
    cancelEdit();
    await loadProductsCategoriesAndBases();
  } catch (error) {
    notifier.error("Falha ao atualizar produto", resolveErrorMessage(error));
  } finally {
    editLoading.value = false;
  }
}

async function handleDeleteProduct(product: ProductEntity) {
  if (!auth.state.token || !canManage.value) {
    return;
  }

  if (!canManageProductItem(product)) {
    notifier.error(
      "Acesso parcial",
      "Este cadastro tambem pertence a outras bases. Apenas um ADMIN com acesso total pode exclui-lo."
    );
    return;
  }

  if (!window.confirm(`Deseja realmente excluir o produto ${product.name}?`)) {
    return;
  }

  deleteLoadingId.value = product.id;

  try {
    const response = await api.deleteProduct(auth.state.token, product.id);
    notifier.success("Produto excluido", response.message);

    if (editForm.id === product.id) {
      cancelEdit();
    }

    await loadProductsCategoriesAndBases();
  } catch (error) {
    notifier.error("Falha ao excluir produto", resolveErrorMessage(error));
  } finally {
    deleteLoadingId.value = null;
  }
}

async function exportProductsStock(format: ReportFormat) {
  if (!auth.state.token) {
    return;
  }

  exporting.value = format;

  try {
    const exported = await api.exportProductsTable(auth.state.token, format, {
      baseId: selectedListBaseId.value || undefined,
      categoryId: selectedListCategoryId.value || undefined
    });
    downloadExport(exported.blob, exported.fileName);
    notifier.success("Exportacao concluida", `Arquivo ${exported.fileName} pronto para uso.`);
  } catch (error) {
    notifier.error("Falha na exportacao", resolveErrorMessage(error));
  } finally {
    exporting.value = null;
  }
}

onMounted(async () => {
  if (!auth.state.initialized) {
    await auth.bootstrap();
  }

  await loadProductsCategoriesAndBases();
});

watch(selectedListBaseId, () => {
  if (!editForm.id) {
    return;
  }

  const currentProduct = products.value.find((product) => product.id === editForm.id);

  if (!currentProduct || !productIsVisibleInSelectedBase(currentProduct) || !canManageProductItem(currentProduct)) {
    cancelEdit();
  }
});

watch(selectedListCategoryId, () => {
  if (!editForm.id) {
    return;
  }

  const currentProduct = products.value.find((product) => product.id === editForm.id);

  if (!currentProduct || (selectedListCategoryId.value && currentProduct.categoryId !== selectedListCategoryId.value)) {
    cancelEdit();
  }
});

watch(filteredProducts, () => {
  syncExpandedProducts();

  if (editForm.id && !filteredProducts.value.some((product) => product.id === editForm.id)) {
    cancelEdit();
  }
});
</script>

<template>
  <section class="space-y-6">
    <article class="erp-surface p-6 reveal-up">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Cadastros</p>
          <h1 class="font-heading mt-2 text-3xl text-slate-900">Gestao de produtos</h1>
          <p class="mt-2 text-sm text-slate-600">
            Cadastre produtos com codigo gerado automaticamente, categoria opcional e vinculacao a uma ou mais bases.
          </p>
        </div>

        <button type="button" class="erp-button-muted" :disabled="loading" @click="loadProductsCategoriesAndBases">
          <ion-icon name="refresh-outline"></ion-icon>
          {{ loading ? "Atualizando..." : "Atualizar lista" }}
        </button>
      </div>
    </article>

    <article v-if="!canManage" class="erp-surface p-6">
      <p class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Seu perfil esta em modo consulta para este cadastro.
      </p>
    </article>

    <section v-if="canManage" class="grid gap-6 xl:max-w-4xl">
      <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.05s">
        <h2 class="font-heading text-2xl text-slate-900">Novo produto</h2>

        <form class="mt-5 space-y-4" @submit.prevent="handleCreateProduct">
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

          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            O SKU sera gerado automaticamente pelo sistema ao salvar o produto.
          </div>

          <div class="space-y-3">
            <label class="erp-label">Bases vinculadas</label>

            <div
              v-if="bases.length === 0"
              class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              Cadastre ao menos uma base antes de criar produtos.
            </div>

            <div v-else class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-medium text-slate-700">Selecione uma ou mais bases para este produto.</p>
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

          <div>
            <label class="erp-label">Categoria (opcional)</label>
            <select
              v-model="createForm.categoryId"
              class="erp-select"
              @change="createTouched.categoryId = true"
            >
              <option value="">Sem categoria</option>
              <option v-for="category in availableCreateCategories" :key="category.id" :value="category.id">
                {{ category.name }}
              </option>
            </select>
            <p v-if="createTouched.categoryId && createCategoryError" class="mt-1 text-xs text-rose-600">
              {{ createCategoryError }}
            </p>
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

          <button type="submit" class="erp-button-primary h-11 w-full" :disabled="createLoading || !createFormValid">
            <ion-icon name="add-circle-outline"></ion-icon>
            {{ createLoading ? "Criando..." : "Criar produto" }}
          </button>
        </form>
      </article>
    </section>

    <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.1s">
      <div
        class="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,180px)_minmax(0,180px)_minmax(0,180px)_minmax(220px,1fr)_auto_auto] lg:items-end"
      >
        <div>
          <label class="erp-label">Base visualizada</label>
          <select v-model="selectedListBaseId" class="erp-select" :disabled="loading || bases.length === 0">
            <option v-if="isAdmin" value="">Todas as bases</option>
            <option v-for="base in bases" :key="base.id" :value="base.id">{{ base.name }}</option>
          </select>
        </div>

        <div>
          <label class="erp-label">Categoria visualizada</label>
          <select v-model="selectedListCategoryId" class="erp-select" :disabled="loading || categories.length === 0">
            <option value="">Todas as categorias</option>
            <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
          </select>
        </div>

        <div>
          <label class="erp-label">Indicador</label>
          <select v-model="selectedListIndicator" class="erp-select" :disabled="loading">
            <option value="">Todos os indicadores</option>
            <option value="HEALTHY">Saudavel</option>
            <option value="WARNING">Atencao</option>
            <option value="CRITICAL">Critico</option>
          </select>
        </div>

        <div class="md:col-span-2 lg:col-span-1">
          <label class="erp-label">Pesquisa</label>
          <input
            v-model="productSearch"
            class="erp-field"
            type="search"
            placeholder="Buscar por nome do produto ou SKU"
          />
        </div>

        <div class="flex flex-col justify-end">
          <span class="erp-label invisible">Exportar</span>
          <button
            type="button"
            class="erp-button-muted h-11 w-full lg:w-auto"
            :disabled="exporting !== null"
            @click="exportProductsStock('excel')"
          >
            <ion-icon name="download-outline"></ion-icon>
            {{ exporting === "excel" ? "Exportando..." : "Exportar Excel" }}
          </button>
        </div>

        <div class="flex flex-col justify-end">
          <span class="erp-label invisible">Exportar</span>
          <button
            type="button"
            class="erp-button-primary h-11 w-full lg:w-auto"
            :disabled="exporting !== null"
            @click="exportProductsStock('pdf')"
          >
            <ion-icon name="document-text-outline"></ion-icon>
            {{ exporting === "pdf" ? "Exportando..." : "Exportar PDF" }}
          </button>
        </div>
      </div>

      <p class="mt-3 text-xs text-slate-500">
        {{
          selectedListBaseName
            ? `Base: ${selectedListBaseName}`
            : isAdmin
              ? "Base: todas"
              : "Base filtrada pelo seu acesso"
        }}
        {{
          selectedListCategoryName
            ? ` • Categoria: ${selectedListCategoryName}`
            : " • Categoria: todas"
        }}
        {{
          selectedListIndicatorLabel
            ? ` • Indicador: ${selectedListIndicatorLabel}`
            : " • Indicador: todos"
        }}
        {{
          productSearch.trim()
            ? ` • Busca: ${productSearch.trim()}`
            : " • Busca instantanea por nome ou SKU"
        }}
      </p>
    </article>

    <article class="erp-surface p-5 reveal-up" style="animation-delay: 0.14s">
      <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 class="font-heading text-xl text-slate-900">Produtos cadastrados</h2>
          <p class="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{{ filteredProducts.length }} registros</p>
        </div>
        <p class="text-xs text-slate-500">Clique em um item para visualizar o estoque por base e editar o cadastro sem sair da listagem.</p>
      </div>

      <div class="erp-table-wrap">
        <table class="erp-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Contexto</th>
              <th>Indicadores</th>
              <th>Atualizado em</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="5" class="text-center text-slate-500">Carregando produtos...</td>
            </tr>
            <tr v-else-if="filteredProducts.length === 0">
              <td colspan="5" class="text-center text-slate-500">
                {{ selectedListBaseName ? "Nenhum produto vinculado a esta base." : "Nenhum produto encontrado." }}
              </td>
            </tr>
            <template v-for="product in filteredProducts" :key="product.id">
              <tr
                class="cursor-pointer transition hover:bg-slate-50"
                :class="isProductExpanded(product.id) ? 'bg-slate-50/80' : ''"
                tabindex="0"
                role="button"
                :aria-expanded="isProductExpanded(product.id)"
                @click="toggleProductExpansion(product.id)"
                @keydown.enter.prevent="toggleProductExpansion(product.id)"
                @keydown.space.prevent="toggleProductExpansion(product.id)"
              >
                <td data-label="Produto">
                  <div class="flex min-w-0 items-start gap-3">
                    <span
                      class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
                    >
                      <ion-icon :name="isProductExpanded(product.id) ? 'chevron-up-outline' : 'chevron-down-outline'"></ion-icon>
                    </span>
                    <div class="min-w-0 space-y-1">
                      <p class="font-medium text-slate-900">{{ product.name }}</p>
                      <p class="font-mono text-xs text-slate-500">SKU {{ product.sku }}</p>
                      <p class="text-xs text-slate-400">Clique para {{ isProductExpanded(product.id) ? "ocultar" : "ver" }} o estoque por base</p>
                    </div>
                  </div>
                </td>
                <td data-label="Contexto">
                  <div class="flex flex-col gap-2">
                    <p class="text-sm text-slate-700">{{ product.category?.name ?? "Sem categoria" }}</p>
                    <span class="inline-flex w-fit rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {{ resolveProductBaseSummary(product) }}
                    </span>
                  </div>
                </td>
                <td data-label="Indicadores">
                  <div class="flex flex-wrap gap-2">
                    <span
                      class="inline-flex rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800"
                      :title="`${product.stocksCount} base(s) com registro de estoque`"
                    >
                      Estoque {{ resolveDisplayedStockQuantity(product) }}
                    </span>
                    <span class="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                      <template v-if="selectedListBaseId">
                        Min. {{ resolveDisplayedThresholds(product).minimumQuantity }} | Ideal. {{ resolveDisplayedThresholds(product).idealQuantity }}
                      </template>
                      <template v-else>Config. por base</template>
                    </span>
                    <span
                      class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold"
                      :class="resolveStockHealth(product).tone"
                    >
                      {{ resolveHealthSummary(product) }}
                    </span>
                  </div>
                </td>
                <td data-label="Atualizado em" class="text-sm">{{ formatDateTime(product.updatedAt) }}</td>
                <td data-label="Acoes" class="w-[180px]">
                  <div v-if="canManageProductItem(product)" class="flex flex-wrap gap-2">
                    <button type="button" class="erp-button-muted px-3 py-1.5 text-xs" @click.stop="startEdit(product)">
                      <ion-icon name="create-outline"></ion-icon>
                      {{ editForm.id === product.id ? "Editando" : "Editar" }}
                    </button>
                    <button
                      type="button"
                      class="erp-button-muted border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                      :disabled="deleteLoadingId === product.id"
                      @click.stop="handleDeleteProduct(product)"
                    >
                      <ion-icon name="trash-outline"></ion-icon>
                      {{ deleteLoadingId === product.id ? "Excluindo..." : "Excluir" }}
                    </button>
                  </div>
                  <span v-else-if="canManage" class="text-xs text-amber-700">Acesso parcial</span>
                  <span v-else class="text-xs text-slate-500">Somente consulta</span>
                </td>
              </tr>
              <tr v-if="isProductExpanded(product.id)" class="bg-slate-50/70">
                <td colspan="5" class="px-4 py-4">
                  <div class="rounded-2xl border border-slate-200 bg-white p-4">
                    <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p class="text-sm font-semibold text-slate-900">Estoque por Base</p>
                        <p class="text-xs text-slate-500">
                          Configure minimo e ideal por unidade sem alterar o saldo fisico.
                        </p>
                      </div>
                      <p class="text-xs text-slate-500">
                        Produto {{ product.name }} | {{ resolveVisibleStockRows(product).length }} base(s) exibida(s)
                      </p>
                    </div>

                    <div class="mt-4 overflow-x-auto">
                      <table class="min-w-full text-sm">
                        <thead>
                          <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                            <th class="px-3 py-2 font-medium">Base</th>
                            <th class="px-3 py-2 font-medium">Estoque atual</th>
                            <th class="px-3 py-2 font-medium">Estoque minimo</th>
                            <th class="px-3 py-2 font-medium">Estoque ideal</th>
                            <th class="px-3 py-2 font-medium">Status</th>
                            <th class="px-3 py-2 font-medium text-right">Acao</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-if="resolveVisibleStockRows(product).length === 0">
                            <td colspan="6" class="px-3 py-4 text-center text-slate-500">
                              Nenhum estoque por base encontrado para o filtro atual.
                            </td>
                          </tr>
                          <tr
                            v-for="stock in resolveVisibleStockRows(product)"
                            :key="`${product.id}-${stock.baseId}`"
                            class="border-b border-slate-100 last:border-b-0"
                          >
                            <td class="px-3 py-3 font-medium text-slate-900">{{ resolveBaseName(product, stock.baseId) }}</td>
                            <td class="px-3 py-3 text-slate-700">{{ stock.quantity }}</td>
                            <td class="px-3 py-3">
                              <input
                                v-model.number="getStockConfigDraft(product.id, stock.baseId).minimumQuantity"
                                class="erp-field min-w-[110px]"
                                type="number"
                                min="0"
                                step="1"
                                :disabled="!canManageProductBase(product, stock.baseId)"
                              />
                            </td>
                            <td class="px-3 py-3">
                              <input
                                v-model.number="getStockConfigDraft(product.id, stock.baseId).idealQuantity"
                                class="erp-field min-w-[110px]"
                                type="number"
                                min="0"
                                step="1"
                                :disabled="!canManageProductBase(product, stock.baseId)"
                              />
                              <p
                                v-if="resolveStockConfigurationError(product.id, stock.baseId)"
                                class="mt-1 text-xs text-rose-600"
                              >
                                {{ resolveStockConfigurationError(product.id, stock.baseId) }}
                              </p>
                            </td>
                            <td class="px-3 py-3">
                              <span
                                class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold"
                                :class="resolveStatusMeta(stock.status).tone"
                              >
                                {{ resolveStatusMeta(stock.status).label }}
                              </span>
                            </td>
                            <td class="px-3 py-3 text-right">
                              <button
                                v-if="canManageProductBase(product, stock.baseId)"
                                type="button"
                                class="erp-button-muted px-3 py-1.5 text-xs"
                                :disabled="
                                  stockConfigSavingKey === buildStockConfigDraftKey(product.id, stock.baseId) ||
                                  Boolean(resolveStockConfigurationError(product.id, stock.baseId))
                                "
                                @click="handleSaveStockConfiguration(product, stock.baseId)"
                              >
                                <ion-icon name="save-outline"></ion-icon>
                                {{
                                  stockConfigSavingKey === buildStockConfigDraftKey(product.id, stock.baseId)
                                    ? "Salvando..."
                                    : "Salvar"
                                }}
                              </button>
                              <span v-else class="text-xs text-slate-500">Somente consulta</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div v-if="editForm.id === product.id && canManageProductItem(product)" class="mt-6 border-t border-slate-200 pt-5">
                      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p class="text-sm font-semibold text-slate-900">Editar produto</p>
                          <p class="text-xs text-slate-500">Atualize o cadastro sem sair da listagem.</p>
                        </div>
                        <p class="text-xs text-slate-500">
                          {{ selectedListBaseName ? `Filtro atual: ${selectedListBaseName}` : "Exibindo todas as bases vinculadas" }}
                        </p>
                      </div>

                      <form class="mt-4 space-y-4" @submit.prevent="handleEditProduct">
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
                          <label class="erp-label">SKU gerado</label>
                          <input
                            :value="editForm.sku"
                            class="erp-field cursor-not-allowed font-mono text-slate-500"
                            type="text"
                            disabled
                            readonly
                          />
                          <p class="mt-1 text-xs text-slate-500">Esse codigo e gerado pelo sistema e nao precisa de edicao manual.</p>
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
                              <p class="text-sm font-medium text-slate-700">Selecione as bases permitidas para este produto.</p>
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
                                :key="`edit-inline-${product.id}-${base.id}`"
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

                        <div>
                          <label class="erp-label">Categoria (opcional)</label>
                          <select
                            v-model="editForm.categoryId"
                            class="erp-select"
                            @change="editTouched.categoryId = true"
                          >
                            <option value="">Sem categoria</option>
                            <option v-for="category in availableEditCategories" :key="category.id" :value="category.id">
                              {{ category.name }}
                            </option>
                          </select>
                          <p v-if="editTouched.categoryId && editCategoryError" class="mt-1 text-xs text-rose-600">
                            {{ editCategoryError }}
                          </p>
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
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>
