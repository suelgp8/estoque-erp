<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useNotifier } from "../composables/useNotifier";
import { ApiError, api } from "../services/api";
import { useAuthStore } from "../stores/auth";
import type { BaseEntity, CreateStockMovementPayload, MovementReportRow, ProductEntity, StockMovementType } from "../types/api";
import { formatDateTime, formatMovementStatus, formatMovementType, formatNumber, movementStatusTone } from "../utils/format";

type MovementFormItem = {
  productId: string;
  quantity: number;
  productSearch: string;
};

const auth = useAuthStore();
const notifier = useNotifier();
const route = useRoute();
const router = useRouter();

const movementType = ref<StockMovementType>("ENTRY");
const sourceBaseId = ref("");
const destinationBaseId = ref("");
const reason = ref("");
const movementItems = ref<MovementFormItem[]>([{ productId: "", quantity: 1, productSearch: "" }]);

const createLoading = ref(false);
const referencesLoading = ref(false);
const movementsLoading = ref(false);
const stockPreviewLoading = ref(false);
const stockPreviewError = ref("");
const movementSearch = ref("");

const knownBases = ref<BaseEntity[]>([]);
const knownProducts = ref<ProductEntity[]>([]);
const recentMovements = ref<MovementReportRow[]>([]);
const selectedListBaseId = ref("");
const stockPreviewByProductId = ref<Record<string, { source?: number; destination?: number }>>({});
const openProductDropdownIndex = ref<number | null>(null);

const isAdmin = computed(() => auth.state.user?.role === "ADMIN");
const selectedListBaseName = computed(
  () => knownBases.value.find((base) => base.id === selectedListBaseId.value)?.name ?? ""
);
const selectedSourceBaseName = computed(() => knownBases.value.find((base) => base.id === sourceBaseId.value)?.name ?? "");
const selectedDestinationBaseName = computed(
  () => knownBases.value.find((base) => base.id === destinationBaseId.value)?.name ?? ""
);
const knownProductMap = computed(() => new Map(knownProducts.value.map((product) => [product.id, product])));
const availableProductsForMovement = computed(() => {
  const source = sourceBaseId.value.trim();
  const destination = destinationBaseId.value.trim();

  return knownProducts.value.filter((product) => {
    const isAllowedAtSource = !source || product.allowedBases.some((base) => base.id === source);
    const isAllowedAtDestination = !destination || product.allowedBases.some((base) => base.id === destination);

    if (movementType.value === "ENTRY") {
      return isAllowedAtDestination;
    }

    if (movementType.value === "EXIT") {
      return isAllowedAtSource;
    }

    return isAllowedAtSource && isAllowedAtDestination;
  });
});
const availableProductIds = computed(() => new Set(availableProductsForMovement.value.map((product) => product.id)));
const stockPreviewContextLabel = computed(() => {
  if (movementType.value === "ENTRY") {
    return "Entradas nao precisam validar saldo atual, mas continuam respeitando o estoque por base no destino.";
  }

  if (movementType.value === "EXIT") {
    return selectedSourceBaseName.value
      ? `Saldo consultado em tempo real na base de origem ${selectedSourceBaseName.value}.`
      : "Selecione a base de origem para consultar o saldo atual por base.";
  }

  if (selectedSourceBaseName.value && selectedDestinationBaseName.value) {
    return `Saldo consultado nas bases ${selectedSourceBaseName.value} e ${selectedDestinationBaseName.value}.`;
  }

  if (selectedSourceBaseName.value) {
    return `Saldo consultado na base de origem ${selectedSourceBaseName.value}.`;
  }

  return "Selecione a base de origem e, se desejar, a base de destino para consultar o saldo por base.";
});
const filteredRecentMovements = computed(() => {
  const normalizedSearch = normalizeSearchValue(movementSearch.value);

  if (!normalizedSearch) {
    return recentMovements.value;
  }

  return recentMovements.value.filter((movement) => {
    const searchableFields = [
      movement.id,
      formatMovementType(movement.type),
      formatMovementStatus(movement.status),
      movement.sourceBase,
      movement.destinationBase,
      movement.createdBy,
      movement.approvedBy,
      movement.items,
      movement.reason,
      movement.rejectionReason,
      movement.statusNote ?? "",
      movement.createdAt,
      movement.approvedAt,
      movement.completedAt,
      formatDateTime(movement.createdAt),
      formatNumber(movement.itemsCount),
      formatNumber(movement.totalQuantity),
      String(movement.itemsCount),
      String(movement.totalQuantity)
    ];

    return searchableFields.some((field) => normalizeSearchValue(field).includes(normalizedSearch));
  });
});

let stockPreviewRequestId = 0;

function shortId(value: string): string {
  if (value.length <= 10) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function normalizeSearchValue(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeQueryBaseId(value: unknown): string {
  return typeof value === "string" ? value : "";
}

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

function addItem() {
  movementItems.value.push({ productId: "", quantity: 1, productSearch: "" });
}

function removeItem(index: number) {
  if (movementItems.value.length === 1) {
    return;
  }

  movementItems.value.splice(index, 1);
  openProductDropdownIndex.value = null;
}

function resetMovementForm() {
  reason.value = "";
  movementItems.value = [{ productId: "", quantity: 1, productSearch: "" }];
  stockPreviewByProductId.value = {};
  stockPreviewError.value = "";
  openProductDropdownIndex.value = null;

  if (movementType.value === "ENTRY") {
    sourceBaseId.value = "";
    return;
  }

  if (movementType.value === "EXIT") {
    destinationBaseId.value = "";
  }
}

function getProductName(productId: string): string {
  return knownProductMap.value.get(productId)?.name ?? productId;
}

function getProductOptionLabel(product: ProductEntity): string {
  return `${product.name} - SKU ${product.sku}`;
}

function getSelectedProduct(item: MovementFormItem): ProductEntity | null {
  return knownProductMap.value.get(item.productId) ?? null;
}

function syncProductSearchWithSelection(item: MovementFormItem) {
  const selectedProduct = getSelectedProduct(item);

  if (!selectedProduct) {
    return;
  }

  item.productSearch = getProductOptionLabel(selectedProduct);
}

function getFilteredProductsForItem(item: MovementFormItem): ProductEntity[] {
  const normalizedSearch = item.productSearch.trim().toLowerCase();
  const availableProducts = availableProductsForMovement.value;

  if (!normalizedSearch) {
    return availableProducts;
  }

  const filteredProducts = availableProducts.filter((product) => {
    const searchableFields = [product.name, product.sku, product.id];

    return searchableFields.some((field) => field.toLowerCase().includes(normalizedSearch));
  });

  if (
    item.productId &&
    availableProducts.some((product) => product.id === item.productId) &&
    filteredProducts.every((product) => product.id !== item.productId)
  ) {
    const selectedProduct = availableProducts.find((product) => product.id === item.productId);

    if (selectedProduct) {
      return [selectedProduct, ...filteredProducts];
    }
  }

  return filteredProducts;
}

function openProductDropdown(index: number) {
  openProductDropdownIndex.value = index;
}

function closeProductDropdown(index: number) {
  if (openProductDropdownIndex.value === index) {
    openProductDropdownIndex.value = null;
  }

  const item = movementItems.value[index];

  if (!item) {
    return;
  }

  if (item.productId) {
    syncProductSearchWithSelection(item);
  } else {
    item.productSearch = item.productSearch.trim();
  }
}

function handleProductSearchFocus(item: MovementFormItem, index: number) {
  if (item.productId && !item.productSearch.trim()) {
    syncProductSearchWithSelection(item);
  }

  openProductDropdown(index);
}

function handleProductSearchInput(item: MovementFormItem, index: number) {
  const selectedProduct = getSelectedProduct(item);

  if (selectedProduct && item.productSearch !== getProductOptionLabel(selectedProduct)) {
    item.productId = "";
  }

  openProductDropdown(index);
}

function handleProductComboboxFocusOut(index: number, event: FocusEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null;
  const nextTarget = event.relatedTarget as Node | null;

  if (currentTarget && nextTarget && currentTarget.contains(nextTarget)) {
    return;
  }

  closeProductDropdown(index);
}

function selectProductForItem(item: MovementFormItem, product: ProductEntity) {
  item.productId = product.id;
  item.productSearch = getProductOptionLabel(product);
  openProductDropdownIndex.value = null;
}

function selectFirstFilteredProduct(item: MovementFormItem, index: number) {
  const [firstProduct] = getFilteredProductsForItem(item);

  if (!firstProduct) {
    closeProductDropdown(index);
    return;
  }

  selectProductForItem(item, firstProduct);
}

function getUniqueSelectedProductIds(): string[] {
  return Array.from(
    new Set(
      movementItems.value
        .map((item) => item.productId.trim())
        .filter((productId) => productId.length > 0 && knownProductMap.value.has(productId))
    )
  );
}

function getSourceStockQuantity(productId: string): number | null {
  return stockPreviewByProductId.value[productId]?.source ?? null;
}

function getDestinationStockQuantity(productId: string): number | null {
  return stockPreviewByProductId.value[productId]?.destination ?? null;
}

function clearStockPreview() {
  stockPreviewByProductId.value = {};
  stockPreviewError.value = "";
}

async function loadStockPreviewByBase() {
  const requestId = ++stockPreviewRequestId;

  if (!auth.state.token || movementType.value === "ENTRY") {
    clearStockPreview();
    stockPreviewLoading.value = false;
    return;
  }

  const source = sourceBaseId.value.trim();
  const destination = destinationBaseId.value.trim();

  if (!source) {
    clearStockPreview();
    stockPreviewLoading.value = false;
    return;
  }

  const productIds = getUniqueSelectedProductIds();

  if (productIds.length === 0) {
    clearStockPreview();
    stockPreviewLoading.value = false;
    return;
  }

  stockPreviewLoading.value = true;
  stockPreviewError.value = "";

  try {
    const requests = productIds.flatMap((productId) => {
      const sourceRequest = api.getStockByBase(auth.state.token as string, productId, source).then((response) => ({
        productId,
        target: "source" as const,
        quantity: response.quantity
      }));

      if (movementType.value !== "TRANSFER" || !destination) {
        return [sourceRequest];
      }

      const destinationRequest = api
        .getStockByBase(auth.state.token as string, productId, destination)
        .then((response) => ({
          productId,
          target: "destination" as const,
          quantity: response.quantity
        }));

      return [sourceRequest, destinationRequest];
    });

    const responses = await Promise.all(requests);

    if (requestId !== stockPreviewRequestId) {
      return;
    }

    const nextPreview: Record<string, { source?: number; destination?: number }> = {};

    for (const productId of productIds) {
      nextPreview[productId] = {};
    }

    for (const response of responses) {
      nextPreview[response.productId] = {
        ...nextPreview[response.productId],
        [response.target]: response.quantity
      };
    }

    stockPreviewByProductId.value = nextPreview;
  } catch (error) {
    if (requestId !== stockPreviewRequestId) {
      return;
    }

    stockPreviewByProductId.value = {};
    stockPreviewError.value = resolveErrorMessage(error);
  } finally {
    if (requestId === stockPreviewRequestId) {
      stockPreviewLoading.value = false;
    }
  }
}

function buildPayload(): CreateStockMovementPayload | null {
  const normalizedItems = movementItems.value
    .map((item) => ({
      productId: item.productId.trim(),
      quantity: Number(item.quantity)
    }))
    .filter((item) => item.productId.length > 0);

  if (normalizedItems.length === 0) {
    notifier.error("Itens invalidos", "Informe ao menos um item com ID de produto valido.");
    return null;
  }

  if (normalizedItems.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0)) {
    notifier.error("Quantidade invalida", "Todas as quantidades devem ser inteiras e maiores que zero.");
    return null;
  }

  if (normalizedItems.some((item) => !knownProductMap.value.has(item.productId))) {
    notifier.error("Produto invalido", "Selecione produtos validos entre os itens carregados.");
    return null;
  }

  const normalizedReason = reason.value.trim();

  const payload: CreateStockMovementPayload = {
    type: movementType.value,
    items: normalizedItems,
    ...(normalizedReason ? { reason: normalizedReason } : {})
  };

  const source = sourceBaseId.value.trim();
  const destination = destinationBaseId.value.trim();

  if (movementType.value === "ENTRY") {
    if (!destination) {
      notifier.error("Destino obrigatorio", "Movimentacao de entrada exige ID da base de destino.");
      return null;
    }

    if (normalizedItems.some((item) => !availableProductIds.value.has(item.productId))) {
      notifier.error("Produto indisponivel", "Um ou mais produtos nao podem ser movimentados para a base de destino.");
      return null;
    }

    payload.destinationBaseId = destination;
    return payload;
  }

  if (movementType.value === "EXIT") {
    if (!source) {
      notifier.error("Origem obrigatoria", "Movimentacao de saida exige ID da base de origem.");
      return null;
    }

    if (normalizedItems.some((item) => !availableProductIds.value.has(item.productId))) {
      notifier.error("Produto indisponivel", "Um ou mais produtos nao estao vinculados a base de origem selecionada.");
      return null;
    }

    const aggregatedByProduct = new Map<string, number>();

    for (const item of normalizedItems) {
      aggregatedByProduct.set(item.productId, (aggregatedByProduct.get(item.productId) ?? 0) + item.quantity);
    }

    for (const [productId, totalQuantity] of aggregatedByProduct.entries()) {
      const currentStock = getSourceStockQuantity(productId);

      if (currentStock !== null && totalQuantity > currentStock) {
        notifier.error(
          "Estoque insuficiente",
          `${getProductName(productId)} possui saldo ${formatNumber(currentStock)} na base de origem, menor que a quantidade solicitada ${formatNumber(totalQuantity)}.`
        );
        return null;
      }
    }

    payload.sourceBaseId = source;
    return payload;
  }

  if (!source || !destination) {
    notifier.error("Bases obrigatorias", "Transferencia exige base de origem e base de destino.");
    return null;
  }

  if (source === destination) {
    notifier.error("Bases invalidas", "Origem e destino devem ser diferentes para transferencia.");
    return null;
  }

  if (normalizedItems.some((item) => !availableProductIds.value.has(item.productId))) {
    notifier.error("Produto indisponivel", "Um ou mais produtos nao estao vinculados simultaneamente as bases de origem e destino.");
    return null;
  }

  const aggregatedByProduct = new Map<string, number>();

  for (const item of normalizedItems) {
    aggregatedByProduct.set(item.productId, (aggregatedByProduct.get(item.productId) ?? 0) + item.quantity);
  }

  for (const [productId, totalQuantity] of aggregatedByProduct.entries()) {
    const currentStock = getSourceStockQuantity(productId);

    if (currentStock !== null && totalQuantity > currentStock) {
      notifier.error(
        "Estoque insuficiente",
        `${getProductName(productId)} possui saldo ${formatNumber(currentStock)} na base de origem, menor que a quantidade solicitada ${formatNumber(totalQuantity)}.`
      );
      return null;
    }
  }

  payload.sourceBaseId = source;
  payload.destinationBaseId = destination;
  return payload;
}

async function replaceBaseQuery(baseId: string) {
  await router.replace({
    name: "movements",
    query: baseId ? { baseId } : {}
  });
}

async function syncSelectedBaseWithRoute() {
  const queryBaseId = normalizeQueryBaseId(route.query.baseId);
  const baseExists = knownBases.value.some((base) => base.id === queryBaseId);

  if (isAdmin.value) {
    const nextBaseId = baseExists ? queryBaseId : "";
    selectedListBaseId.value = nextBaseId;

    if (queryBaseId !== nextBaseId) {
      await replaceBaseQuery(nextBaseId);
    }

    return;
  }

  const defaultBaseId = knownBases.value[0]?.id ?? "";
  const nextBaseId = baseExists ? queryBaseId : defaultBaseId;
  selectedListBaseId.value = nextBaseId;

  if (queryBaseId !== nextBaseId) {
    await replaceBaseQuery(nextBaseId);
  }
}

async function loadReferences() {
  if (!auth.state.token) {
    return;
  }

  referencesLoading.value = true;

  try {
    const [basesResponse, productsResponse] = await Promise.all([
      api.listBases(auth.state.token),
      api.listProducts(auth.state.token)
    ]);

    knownBases.value = basesResponse.bases;
    knownProducts.value = productsResponse.products;
    movementItems.value.forEach((item) => {
      if (item.productId) {
        syncProductSearchWithSelection(item);
      }
    });
  } catch (error) {
    notifier.error("Falha ao montar referencias", resolveErrorMessage(error));
  } finally {
    referencesLoading.value = false;
  }
}

async function loadRecentMovements() {
  if (!auth.state.token) {
    return;
  }

  movementsLoading.value = true;

  try {
    const report = await api.getMovementsReport(auth.state.token, {
      baseId: selectedListBaseId.value || undefined
    });

    recentMovements.value = report.rows;
  } catch (error) {
    notifier.error("Falha ao carregar movimentacoes", resolveErrorMessage(error));
  } finally {
    movementsLoading.value = false;
  }
}

async function submitMovement() {
  if (!auth.state.token) {
    return;
  }

  const payload = buildPayload();

  if (!payload) {
    return;
  }

  createLoading.value = true;

  try {
    const response = await api.createStockMovement(auth.state.token, payload);
    if (response.movement.type === "TRANSFER") {
      notifier.success(
        "Transferencia registrada",
        "Transferencia criada como pendente. A base de destino deve conferir os itens e confirmar o recebimento."
      );
    } else {
      notifier.success(
        "Movimentacao registrada",
        `${formatMovementType(response.movement.type)} criada com status ${formatMovementStatus(response.movement.status)}.`
      );
    }
    resetMovementForm();
    await Promise.all([loadRecentMovements(), loadReferences()]);
  } catch (error) {
    notifier.error("Falha ao criar movimentacao", resolveErrorMessage(error));
  } finally {
    createLoading.value = false;
  }
}

async function handleListBaseChange() {
  await replaceBaseQuery(selectedListBaseId.value);
  await loadRecentMovements();
}

function openMovementDetails(movementId: string) {
  router.push({
    name: "movement-detail",
    params: {
      id: movementId
    },
    query: selectedListBaseId.value ? { baseId: selectedListBaseId.value } : {}
  });
}

async function refreshData() {
  await loadReferences();
  await syncSelectedBaseWithRoute();
  await loadRecentMovements();
}

onMounted(async () => {
  if (!auth.state.initialized) {
    await auth.bootstrap();
  }

  await refreshData();
});

watch(
  [
    movementType,
    sourceBaseId,
    destinationBaseId,
    () => movementItems.value.map((item) => item.productId.trim()).join("|"),
    () => knownProducts.value.map((product) => product.id).join("|"),
    () => auth.state.token
  ],
  () => {
    void loadStockPreviewByBase();
  },
  { immediate: true }
);
</script>

<template>
  <section class="space-y-6">
    <article class="erp-surface p-6 reveal-up">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Fluxo operacional</p>
          <h1 class="font-heading mt-2 text-3xl text-slate-900">Movimentacoes de estoque</h1>
          <p class="mt-2 text-sm text-slate-600">
            Crie novas movimentacoes e acompanhe o historico separado por base para trabalhar com mais clareza.
          </p>
        </div>

        <button
          type="button"
          class="erp-button-muted w-full sm:w-auto"
          :disabled="referencesLoading || movementsLoading"
          @click="refreshData"
        >
          {{ referencesLoading || movementsLoading ? "Atualizando..." : "Atualizar dados" }}
        </button>
      </div>
    </article>

    <section>
      <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.05s">
        <h2 class="font-heading text-2xl text-slate-900">Criar movimentacao</h2>

        <form class="mt-5 space-y-5" @submit.prevent="submitMovement">
          <div class="grid gap-4 xl:grid-cols-3">
            <div>
              <label class="erp-label">Tipo</label>
              <select v-model="movementType" class="erp-select" @change="resetMovementForm">
                <option value="ENTRY">Entrada</option>
                <option value="EXIT">Saida</option>
                <option value="TRANSFER">Transferencia</option>
              </select>
            </div>

            <template v-if="movementType === 'ENTRY'">
              <div class="xl:col-span-2">
                <label class="erp-label">Base de destino</label>
                <select v-model="destinationBaseId" class="erp-select" :disabled="referencesLoading || knownBases.length === 0">
                  <option value="">Selecione uma base</option>
                  <option v-for="base in knownBases" :key="`entry-destination-${base.id}`" :value="base.id">{{ base.name }}</option>
                </select>
              </div>
            </template>

            <template v-else-if="movementType === 'EXIT'">
              <div class="xl:col-span-2">
                <label class="erp-label">Base de origem</label>
                <select v-model="sourceBaseId" class="erp-select" :disabled="referencesLoading || knownBases.length === 0">
                  <option value="">Selecione uma base</option>
                  <option v-for="base in knownBases" :key="`source-${base.id}`" :value="base.id">{{ base.name }}</option>
                </select>
              </div>
            </template>

            <template v-else>
              <div>
                <label class="erp-label">Base de origem</label>
                <select v-model="sourceBaseId" class="erp-select" :disabled="referencesLoading || knownBases.length === 0">
                  <option value="">Selecione uma base</option>
                  <option v-for="base in knownBases" :key="`transfer-source-${base.id}`" :value="base.id">{{ base.name }}</option>
                </select>
              </div>

              <div>
                <label class="erp-label">Base de destino</label>
                <select v-model="destinationBaseId" class="erp-select" :disabled="referencesLoading || knownBases.length === 0">
                  <option value="">Selecione uma base</option>
                  <option v-for="base in knownBases" :key="`destination-${base.id}`" :value="base.id">{{ base.name }}</option>
                </select>
              </div>
            </template>

            <div class="xl:col-span-3">
              <label class="erp-label">Motivo (opcional)</label>
              <input
                v-model="reason"
                class="erp-field"
                type="text"
                maxlength="255"
                placeholder="Ex: abastecimento da filial"
              />
            </div>
          </div>

          <div class="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-slate-700">Itens</p>
                <p class="mt-1 text-xs text-slate-500">{{ stockPreviewContextLabel }}</p>
              </div>
              <button type="button" class="erp-button-muted text-xs" @click="addItem">Adicionar item</button>
            </div>

            <p v-if="stockPreviewLoading" class="text-xs text-sky-700">Consultando saldo atual por base...</p>
            <p v-else-if="stockPreviewError" class="text-xs text-amber-700">
              Nao foi possivel consultar o saldo por base agora: {{ stockPreviewError }}
            </p>

            <div
              v-for="(item, index) in movementItems"
              :key="index"
              class="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[1fr_140px_auto]"
            >
              <div
                class="relative"
                @focusout="handleProductComboboxFocusOut(index, $event)"
              >
                <input
                  v-model="item.productSearch"
                  class="erp-field pr-11"
                  type="text"
                  :disabled="referencesLoading || availableProductsForMovement.length === 0"
                  :placeholder="
                    availableProductsForMovement.length === 0
                      ? 'Nenhum produto disponivel para as bases selecionadas'
                      : 'Selecione ou pesquise um produto'
                  "
                  @focus="handleProductSearchFocus(item, index)"
                  @input="handleProductSearchInput(item, index)"
                  @keydown.down.prevent="openProductDropdown(index)"
                  @keydown.enter.prevent="selectFirstFilteredProduct(item, index)"
                  @keydown.esc.prevent="closeProductDropdown(index)"
                />
                <button
                  type="button"
                  class="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500"
                  :disabled="referencesLoading || availableProductsForMovement.length === 0"
                  @click="openProductDropdownIndex === index ? closeProductDropdown(index) : openProductDropdown(index)"
                >
                  <span class="text-xs transition-transform" :class="openProductDropdownIndex === index ? 'rotate-180' : ''">
                    ▼
                  </span>
                </button>

                <div
                  v-if="openProductDropdownIndex === index"
                  class="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.4)]"
                >
                  <div class="max-h-64 overflow-y-auto py-2">
                    <button
                      v-for="product in getFilteredProductsForItem(item)"
                      :key="product.id"
                      type="button"
                      class="block w-full px-3 py-2 text-left transition hover:bg-slate-50"
                      :class="item.productId === product.id ? 'bg-slate-100' : ''"
                      @click="selectProductForItem(item, product)"
                    >
                      <span class="block text-sm font-medium text-slate-800">{{ product.name }}</span>
                      <span class="block text-xs text-slate-500">SKU {{ product.sku }} • {{ product.id }}</span>
                    </button>

                    <div
                      v-if="getFilteredProductsForItem(item).length === 0"
                      class="px-3 py-3 text-sm text-slate-500"
                    >
                      Nenhum produto encontrado para essa pesquisa.
                    </div>
                  </div>
                </div>
              </div>
              <input v-model.number="item.quantity" class="erp-field" type="number" min="1" step="1" placeholder="Quantidade" />
              <button
                type="button"
                class="erp-button-danger px-3 py-0 text-xs"
                :disabled="movementItems.length === 1"
                @click="removeItem(index)"
              >
                Remover
              </button>

              <div class="md:col-span-3 flex flex-wrap gap-2 text-xs">
                <span
                  class="inline-flex rounded-full border px-2.5 py-1"
                  :class="
                    availableProductIds.has(item.productId.trim())
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  "
                >
                  {{
                    item.productId.trim().length === 0
                      ? getFilteredProductsForItem(item).length === 0 && item.productSearch.trim().length > 0
                        ? 'Nenhum produto encontrado para esse filtro.'
                        : 'Selecione um produto para consultar a disponibilidade.'
                      : availableProductIds.has(item.productId.trim())
                        ? 'Produto compativel com as bases selecionadas.'
                        : 'Produto fora das bases selecionadas.'
                  }}
                </span>

                <span
                  v-if="item.productId.trim().length > 0"
                  class="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600"
                >
                  ID: {{ item.productId.trim() }}
                </span>

                <span
                  v-if="movementType !== 'ENTRY' && getSourceStockQuantity(item.productId.trim()) !== null"
                  class="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700"
                >
                  Origem: {{ formatNumber(getSourceStockQuantity(item.productId.trim()) ?? 0) }}
                </span>

                <span
                  v-if="movementType === 'TRANSFER' && getDestinationStockQuantity(item.productId.trim()) !== null"
                  class="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-700"
                >
                  Destino: {{ formatNumber(getDestinationStockQuantity(item.productId.trim()) ?? 0) }}
                </span>
              </div>
            </div>
          </div>

          <p class="text-xs text-slate-500">
            Saidas e transferencias usam o saldo atual por base antes do envio e o backend faz a validacao transacional final.
          </p>

          <p v-if="movementType === 'TRANSFER'" class="text-xs text-amber-700">
            Transferencias ficam pendentes ate que um gestor da base de destino confira os itens e valide o recebimento.
          </p>

          <button type="submit" class="erp-button-primary h-11 w-full" :disabled="createLoading">
            {{ createLoading ? "Salvando..." : "Criar movimentacao" }}
          </button>
        </form>
      </article>
    </section>

    <article class="erp-surface p-5 reveal-up" style="animation-delay: 0.14s">
      <div class="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 class="font-heading text-xl text-slate-900">Movimentacoes recentes</h2>
          <p class="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
            {{
              movementSearch.trim()
                ? `${filteredRecentMovements.length} de ${recentMovements.length} registros`
                : `${recentMovements.length} registros`
            }}
          </p>
        </div>

        <div class="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[560px]">
          <div class="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
            <select
              v-model="selectedListBaseId"
              class="erp-select"
              :disabled="referencesLoading || knownBases.length === 0"
              @change="handleListBaseChange"
            >
              <option v-if="isAdmin" value="">Todas as bases</option>
              <option v-for="base in knownBases" :key="base.id" :value="base.id">{{ base.name }}</option>
            </select>

            <div class="relative">
              <input v-model="movementSearch" class="erp-field pr-20" type="search" placeholder="Pesquisar" />
              <button
                v-if="movementSearch.trim()"
                type="button"
                class="absolute inset-y-0 right-3 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                @click="movementSearch = ''"
              >
                Limpar
              </button>
            </div>
          </div>

          <p class="text-xs text-slate-500">
            {{ selectedListBaseName ? `Base filtrada: ${selectedListBaseName}` : "Sem filtro de base aplicado" }}
          </p>
        </div>
      </div>

      <div class="erp-table-wrap">
        <table class="erp-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Origem</th>
              <th>Destino</th>
              <th>Itens</th>
              <th>Qtd total</th>
              <th>Criado em</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="movementsLoading">
              <td colspan="9" class="text-center text-slate-500">Carregando movimentacoes...</td>
            </tr>
            <tr v-else-if="filteredRecentMovements.length === 0">
              <td colspan="9" class="text-center text-slate-500">
                {{
                  movementSearch.trim()
                    ? "Nenhuma movimentacao encontrada para essa pesquisa."
                    : selectedListBaseName
                      ? "Nenhuma movimentacao encontrada para esta base."
                      : "Nenhuma movimentacao encontrada."
                }}
              </td>
            </tr>
            <tr v-for="movement in filteredRecentMovements" :key="movement.id">
              <td data-label="ID" class="font-mono text-xs text-slate-600" :title="movement.id">{{ shortId(movement.id) }}</td>
              <td data-label="Tipo" class="font-medium text-slate-900">{{ formatMovementType(movement.type) }}</td>
              <td data-label="Status">
                <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="movementStatusTone(movement.status)">
                  {{ formatMovementStatus(movement.status) }}
                </span>
              </td>
              <td data-label="Origem">{{ movement.sourceBase }}</td>
              <td data-label="Destino">{{ movement.destinationBase }}</td>
              <td data-label="Itens">{{ formatNumber(movement.itemsCount) }}</td>
              <td data-label="Qtd total">{{ formatNumber(movement.totalQuantity) }}</td>
              <td data-label="Criado em">{{ formatDateTime(movement.createdAt) }}</td>
              <td data-label="Acoes">
                <button type="button" class="erp-button-muted px-3 py-1.5 text-xs" @click="openMovementDetails(movement.id)">
                  Abrir detalhes
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>
