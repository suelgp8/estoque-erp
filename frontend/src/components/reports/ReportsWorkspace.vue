<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useNotifier } from "../../composables/useNotifier";
import { ApiError, api } from "../../services/api";
import { useAuthStore } from "../../stores/auth";
import type {
  BaseEntity,
  CategoryEntity,
  MovementReportFilters,
  MovementReportResponse,
  ProductEntity,
  ReportFormat,
  StockMovementStatus,
  StockMovementType,
  StockReportFilters,
  StockReportResponse,
  TransferReportFilters,
  TransferReportResponse
} from "../../types/api";
import { formatDateTime, formatMovementStatus, formatMovementType, formatNumber, movementStatusTone } from "../../utils/format";

type ReportTab = "general" | "stock" | "movements" | "transfers" | "alerts";
type InsightTone = "slate" | "sky" | "emerald" | "amber" | "rose" | "cyan";
type SummaryCard = { label: string; value: string; helper: string; tone: string };
type InsightItem = { label: string; value: number; displayValue: string; helper?: string; tone?: InsightTone };
type StockViewRow = StockReportResponse["rows"][number] & {
  minimumStock: number;
  status: "zero" | "low" | "good";
  statusLabel: string;
  gap: number;
};

const auth = useAuthStore();
const notifier = useNotifier();

const activeTab = ref<ReportTab>("general");
const loading = ref(false);
const referencesLoading = ref(false);
const exporting = ref<ReportFormat | null>(null);

const stockReport = ref<StockReportResponse | null>(null);
const movementsReport = ref<MovementReportResponse | null>(null);
const transfersReport = ref<TransferReportResponse | null>(null);

const knownBases = ref<BaseEntity[]>([]);
const knownCategories = ref<CategoryEntity[]>([]);
const knownProducts = ref<ProductEntity[]>([]);

const filters = ref({
  search: "",
  baseId: "",
  categoryId: "",
  productId: "",
  dateFrom: "",
  dateTo: "",
  movementType: "" as "" | StockMovementType,
  movementStatus: "" as "" | StockMovementStatus,
  transferStatus: "" as "" | StockMovementStatus,
  sourceBaseId: "",
  destinationBaseId: ""
});

const typeOptions: Array<{ label: string; value: "" | StockMovementType }> = [
  { label: "Todos", value: "" },
  { label: "Entrada", value: "ENTRY" },
  { label: "Saida", value: "EXIT" },
  { label: "Transferencia", value: "TRANSFER" }
];

const statusOptions: Array<{ label: string; value: "" | StockMovementStatus }> = [
  { label: "Todos", value: "" },
  { label: "Pendente", value: "PENDING" },
  { label: "Aprovado", value: "APPROVED" },
  { label: "Concluido", value: "COMPLETED" },
  { label: "Rejeitado", value: "REJECTED" },
  { label: "Cancelado", value: "CANCELED" },
  { label: "Estornado", value: "REVERSED" }
];

const canExportActiveTab = computed(
  () => activeTab.value === "stock" || activeTab.value === "movements" || activeTab.value === "transfers"
);
const productIndex = computed(() => new Map(knownProducts.value.map((product) => [product.id, product])));

const stockRows = computed(() => stockReport.value?.rows ?? []);
const movementRows = computed(() => movementsReport.value?.rows ?? []);
const transferRows = computed(() => transfersReport.value?.rows ?? []);

const stockRowsDetailed = computed<StockViewRow[]>(() =>
  stockRows.value.map((row) => {
    const product = productIndex.value.get(row.productId);
    const minimumStock = product?.minimumStock ?? 0;
    const status = row.quantity <= 0 ? "zero" : minimumStock > 0 && row.quantity <= minimumStock ? "low" : "good";

    return {
      ...row,
      minimumStock,
      status,
      statusLabel: status === "zero" ? "Estoque zerado" : status === "low" ? "Estoque baixo" : "Estoque bom",
      gap: Math.max(0, minimumStock - row.quantity)
    };
  })
);

const criticalStockRows = computed(() =>
  [...stockRowsDetailed.value]
    .filter((row) => row.status !== "good")
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "zero" ? -1 : 1;
      }

      if (left.gap !== right.gap) {
        return right.gap - left.gap;
      }

      return left.quantity - right.quantity;
    })
);

const agedPendingTransfers = computed(() =>
  transferRows.value
    .filter((row) => row.status === "PENDING" || row.status === "APPROVED")
    .map((row) => ({
      ...row,
      ageInDays: getAgeInDays(row.createdAt)
    }))
    .filter((row) => row.ageInDays >= 2)
    .sort((left, right) => right.ageInDays - left.ageInDays)
);

const stockSummary = computed(() => ({
  rows: stockRowsDetailed.value.length,
  totalQuantity: stockRowsDetailed.value.reduce((total, row) => total + row.quantity, 0),
  zeroCount: stockRowsDetailed.value.filter((row) => row.status === "zero").length,
  lowCount: stockRowsDetailed.value.filter((row) => row.status === "low").length,
  goodCount: stockRowsDetailed.value.filter((row) => row.status === "good").length,
  productCount: new Set(stockRowsDetailed.value.map((row) => row.productId)).size
}));

const movementSummary = computed(() => ({
  rows: movementRows.value.length,
  totalQuantity: movementRows.value.reduce((total, row) => total + row.totalQuantity, 0),
  entriesQuantity: movementRows.value.filter((row) => row.type === "ENTRY").reduce((total, row) => total + row.totalQuantity, 0),
  exitsQuantity: movementRows.value.filter((row) => row.type === "EXIT").reduce((total, row) => total + row.totalQuantity, 0),
  transferQuantity: movementRows.value.filter((row) => row.type === "TRANSFER").reduce((total, row) => total + row.totalQuantity, 0),
  pendingCount: movementRows.value.filter((row) => row.status === "PENDING").length
}));

const transferSummary = computed(() => ({
  rows: transferRows.value.length,
  totalQuantity: transferRows.value.reduce((total, row) => total + row.totalQuantity, 0),
  openCount: transferRows.value.filter((row) => row.status === "PENDING" || row.status === "APPROVED").length,
  completedCount: transferRows.value.filter((row) => row.status === "COMPLETED").length,
  problemCount: transferRows.value.filter((row) => ["REJECTED", "CANCELED", "REVERSED"].includes(row.status)).length
}));

const generalCards = computed<SummaryCard[]>(() => [
  { label: "Estoque total", value: formatNumber(stockSummary.value.totalQuantity), helper: "Saldo agregado nas bases filtradas", tone: "border-sky-200 bg-sky-50 text-sky-700" },
  { label: "Produtos zerados", value: formatNumber(stockSummary.value.zeroCount), helper: "Itens sem saldo disponivel", tone: "border-rose-200 bg-rose-50 text-rose-700" },
  { label: "Abaixo do minimo", value: formatNumber(stockSummary.value.lowCount), helper: "Itens em estado de alerta", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  { label: "Movimentacoes", value: formatNumber(movementSummary.value.rows), helper: "Registros no periodo filtrado", tone: "border-slate-200 bg-slate-50 text-slate-700" },
  { label: "Transferencias abertas", value: formatNumber(transferSummary.value.openCount), helper: "Pendentes ou aprovadas", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  { label: "Produtos analisados", value: formatNumber(stockSummary.value.productCount), helper: "Itens unicos no estoque filtrado", tone: "border-slate-200 bg-slate-50 text-slate-700" }
]);

const stockCards = computed<SummaryCard[]>(() => [
  { label: "Linhas retornadas", value: formatNumber(stockSummary.value.rows), helper: "Produtos por base no resultado", tone: "border-slate-200 bg-slate-50 text-slate-700" },
  { label: "Quantidade total", value: formatNumber(stockSummary.value.totalQuantity), helper: "Saldo acumulado do filtro", tone: "border-sky-200 bg-sky-50 text-sky-700" },
  { label: "Zerados", value: formatNumber(stockSummary.value.zeroCount), helper: "Precisam de reposicao", tone: "border-rose-200 bg-rose-50 text-rose-700" },
  { label: "Abaixo do minimo", value: formatNumber(stockSummary.value.lowCount), helper: "Produtos em alerta", tone: "border-amber-200 bg-amber-50 text-amber-700" }
]);

const movementCards = computed<SummaryCard[]>(() => [
  { label: "Movimentacoes", value: formatNumber(movementSummary.value.rows), helper: "Registros retornados", tone: "border-slate-200 bg-slate-50 text-slate-700" },
  { label: "Quantidade total", value: formatNumber(movementSummary.value.totalQuantity), helper: "Volume movimentado", tone: "border-sky-200 bg-sky-50 text-sky-700" },
  { label: "Entradas", value: formatNumber(movementSummary.value.entriesQuantity), helper: "Quantidade de entrada", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { label: "Saidas", value: formatNumber(movementSummary.value.exitsQuantity), helper: "Quantidade de saida", tone: "border-cyan-200 bg-cyan-50 text-cyan-700" }
]);

const transferCards = computed<SummaryCard[]>(() => [
  { label: "Transferencias", value: formatNumber(transferSummary.value.rows), helper: "Registros retornados", tone: "border-slate-200 bg-slate-50 text-slate-700" },
  { label: "Quantidade total", value: formatNumber(transferSummary.value.totalQuantity), helper: "Volume transferido", tone: "border-sky-200 bg-sky-50 text-sky-700" },
  { label: "Concluidas", value: formatNumber(transferSummary.value.completedCount), helper: "Transferencias finalizadas", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { label: "Com problema", value: formatNumber(transferSummary.value.problemCount), helper: "Rejeitadas, canceladas ou estornadas", tone: "border-rose-200 bg-rose-50 text-rose-700" }
]);

const alertCards = computed<SummaryCard[]>(() => [
  { label: "Alertas de estoque", value: formatNumber(criticalStockRows.value.length), helper: "Zerados ou abaixo do minimo", tone: "border-rose-200 bg-rose-50 text-rose-700" },
  { label: "Produtos zerados", value: formatNumber(stockSummary.value.zeroCount), helper: "Itens sem saldo", tone: "border-rose-200 bg-rose-50 text-rose-700" },
  { label: "Abaixo do minimo", value: formatNumber(stockSummary.value.lowCount), helper: "Itens abaixo da referencia", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  { label: "Transferencias envelhecidas", value: formatNumber(agedPendingTransfers.value.length), helper: "Pendentes ha 2 dias ou mais", tone: "border-amber-200 bg-amber-50 text-amber-700" }
]);

const activeCards = computed(() => {
  if (activeTab.value === "general") return generalCards.value;
  if (activeTab.value === "stock") return stockCards.value;
  if (activeTab.value === "movements") return movementCards.value;
  if (activeTab.value === "transfers") return transferCards.value;
  return alertCards.value;
});

const stockByBaseInsights = computed(() => buildGroupedInsights(stockRowsDetailed.value, (row) => row.base, (row) => row.quantity, "sky"));
const criticalStockInsights = computed(() =>
  criticalStockRows.value.slice(0, 6).map((row) => ({
    label: row.productName,
    value: row.status === "zero" ? Math.max(row.minimumStock, 1) : Math.max(row.gap, 1),
    displayValue: `${formatNumber(row.quantity)} un.`,
    helper: `${row.base} | min ${formatNumber(row.minimumStock)}`,
    tone: row.status === "zero" ? "rose" : "amber"
  }))
);
const movementStatusInsights = computed(() =>
  statusOptions
    .filter((option) => option.value)
    .map((option) => ({
      label: option.label,
      value: movementRows.value.filter((row) => row.status === option.value).length,
      displayValue: formatNumber(movementRows.value.filter((row) => row.status === option.value).length),
      helper: "Registros no filtro",
      tone: option.value === "PENDING" ? "amber" : option.value === "COMPLETED" ? "emerald" : "slate"
    }))
    .filter((item) => item.value > 0)
);
const transferRouteInsights = computed(() =>
  buildGroupedInsights(transferRows.value, (row) => `${row.sourceBase} -> ${row.destinationBase}`, (row) => row.totalQuantity, "cyan")
);
const transferStatusInsights = computed(() =>
  statusOptions
    .filter((option) => option.value)
    .map((option) => ({
      label: option.label,
      value: transferRows.value.filter((row) => row.status === option.value).length,
      displayValue: formatNumber(transferRows.value.filter((row) => row.status === option.value).length),
      helper: "Transferencias",
      tone: option.value === "PENDING" || option.value === "APPROVED" ? "amber" : option.value === "COMPLETED" ? "emerald" : "slate"
    }))
    .filter((item) => item.value > 0)
);
const alertBaseInsights = computed(() => buildGroupedInsights(criticalStockRows.value, (row) => row.base, () => 1, "rose"));
const agedTransferInsights = computed(() =>
  agedPendingTransfers.value.slice(0, 6).map((row) => ({
    label: `${row.sourceBase} -> ${row.destinationBase}`,
    value: row.ageInDays,
    displayValue: `${formatNumber(row.ageInDays)}d`,
    helper: `${formatMovementStatus(row.status)} | ${formatDateTime(row.createdAt)}`,
    tone: "amber"
  }))
);
const latestMovements = computed(() => movementRows.value.slice(0, 8));

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

function sanitizeText(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function getStockFilterPayload(): StockReportFilters {
  return {
    search: sanitizeText(filters.value.search),
    baseId: sanitizeText(filters.value.baseId),
    categoryId: sanitizeText(filters.value.categoryId),
    productId: sanitizeText(filters.value.productId)
  };
}

function getMovementFilterPayload(includeAdvanced = activeTab.value === "movements"): MovementReportFilters {
  const payload: MovementReportFilters = {
    baseId: sanitizeText(filters.value.baseId),
    productId: sanitizeText(filters.value.productId),
    dateFrom: sanitizeText(filters.value.dateFrom),
    dateTo: sanitizeText(filters.value.dateTo)
  };

  if (includeAdvanced) {
    payload.sourceBaseId = sanitizeText(filters.value.sourceBaseId);
    payload.destinationBaseId = sanitizeText(filters.value.destinationBaseId);
    if (filters.value.movementType) payload.type = filters.value.movementType;
    if (filters.value.movementStatus) payload.status = filters.value.movementStatus;
  }

  return payload;
}

function getTransferFilterPayload(includeAdvanced = activeTab.value === "transfers"): TransferReportFilters {
  const payload: TransferReportFilters = {
    baseId: sanitizeText(filters.value.baseId),
    productId: sanitizeText(filters.value.productId),
    dateFrom: sanitizeText(filters.value.dateFrom),
    dateTo: sanitizeText(filters.value.dateTo)
  };

  if (includeAdvanced) {
    payload.sourceBaseId = sanitizeText(filters.value.sourceBaseId);
    payload.destinationBaseId = sanitizeText(filters.value.destinationBaseId);
    if (filters.value.transferStatus) payload.status = filters.value.transferStatus;
  }

  return payload;
}

async function loadReferences() {
  if (!auth.state.token) return;

  referencesLoading.value = true;

  try {
    const [basesResponse, categoriesResponse, productsResponse] = await Promise.all([
      api.listBases(auth.state.token),
      api.listCategories(auth.state.token),
      api.listProducts(auth.state.token)
    ]);

    knownBases.value = basesResponse.bases;
    knownCategories.value = categoriesResponse.categories;
    knownProducts.value = productsResponse.products;
  } catch (error) {
    notifier.error("Falha ao carregar referencias", resolveErrorMessage(error));
  } finally {
    referencesLoading.value = false;
  }
}

async function loadActiveReport() {
  if (!auth.state.token) return;

  loading.value = true;

  try {
    if (activeTab.value === "general" || activeTab.value === "alerts") {
      const [nextStock, nextMovements, nextTransfers] = await Promise.all([
        api.getStockReport(auth.state.token, getStockFilterPayload()),
        api.getMovementsReport(auth.state.token, getMovementFilterPayload(false)),
        api.getTransfersReport(auth.state.token, getTransferFilterPayload(false))
      ]);

      stockReport.value = nextStock;
      movementsReport.value = nextMovements;
      transfersReport.value = nextTransfers;
      return;
    }

    if (activeTab.value === "stock") {
      stockReport.value = await api.getStockReport(auth.state.token, getStockFilterPayload());
      return;
    }

    if (activeTab.value === "movements") {
      movementsReport.value = await api.getMovementsReport(auth.state.token, getMovementFilterPayload(true));
      return;
    }

    transfersReport.value = await api.getTransfersReport(auth.state.token, getTransferFilterPayload(true));
  } catch (error) {
    notifier.error("Falha ao carregar relatorio", resolveErrorMessage(error));
  } finally {
    loading.value = false;
  }
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

async function exportCurrentReport(format: ReportFormat) {
  if (!auth.state.token || !canExportActiveTab.value) return;

  exporting.value = format;

  try {
    if (activeTab.value === "stock") {
      const exported = await api.exportStockReport(auth.state.token, format, getStockFilterPayload());
      downloadExport(exported.blob, exported.fileName);
      notifier.success("Exportacao concluida", `Arquivo ${exported.fileName} pronto para uso.`);
      return;
    }

    if (activeTab.value === "movements") {
      const exported = await api.exportMovementsReport(auth.state.token, format, getMovementFilterPayload(true));
      downloadExport(exported.blob, exported.fileName);
      notifier.success("Exportacao concluida", `Arquivo ${exported.fileName} pronto para uso.`);
      return;
    }

    const exported = await api.exportTransfersReport(auth.state.token, format, getTransferFilterPayload(true));
    downloadExport(exported.blob, exported.fileName);
    notifier.success("Exportacao concluida", `Arquivo ${exported.fileName} pronto para uso.`);
  } catch (error) {
    notifier.error("Falha na exportacao", resolveErrorMessage(error));
  } finally {
    exporting.value = null;
  }
}

async function refreshPanel() {
  await loadReferences();
  await loadActiveReport();
}

function resetFilters() {
  filters.value = {
    search: "",
    baseId: "",
    categoryId: "",
    productId: "",
    dateFrom: "",
    dateTo: "",
    movementType: "",
    movementStatus: "",
    transferStatus: "",
    sourceBaseId: "",
    destinationBaseId: ""
  };
}

async function clearAndReload() {
  resetFilters();
  await loadActiveReport();
}

function buildGroupedInsights<T>(
  rows: T[],
  labelResolver: (row: T) => string,
  valueResolver: (row: T) => number,
  tone: InsightTone
): InsightItem[] {
  const grouped = new Map<string, number>();

  for (const row of rows) {
    const label = labelResolver(row);
    if (!label || label === "-") continue;
    grouped.set(label, (grouped.get(label) ?? 0) + valueResolver(row));
  }

  return Array.from(grouped.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value, displayValue: formatNumber(value), tone }));
}

function getAgeInDays(value: string): number {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24)));
}

function resolveStockTone(status: StockViewRow["status"]): string {
  if (status === "zero") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "low") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function resolveInsightBadgeTone(tone: InsightTone | string = "slate"): string {
  const toneMap: Record<InsightTone, string> = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700"
  };

  return toneMap[(tone as InsightTone) ?? "slate"] ?? toneMap.slate;
}

watch(activeTab, async () => {
  await loadActiveReport();
});

onMounted(async () => {
  if (!auth.state.initialized) {
    await auth.bootstrap();
  }

  await refreshPanel();
});
</script>

<template>
  <section class="space-y-6">
    <article class="erp-surface p-6 reveal-up">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Analise</p>
          <h1 class="font-heading mt-2 text-3xl text-slate-900">Relatorios e analises</h1>
          <p class="mt-2 text-sm text-slate-600">
            Painel unificado para acompanhar estoque, movimentacoes, transferencias e alertas operacionais.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="erp-button-muted" :disabled="loading || referencesLoading" @click="refreshPanel">
            <ion-icon name="refresh-outline"></ion-icon>
            {{ loading || referencesLoading ? "Atualizando..." : "Atualizar" }}
          </button>
          <button type="button" class="erp-button-muted" :disabled="loading || referencesLoading" @click="clearAndReload">
            <ion-icon name="close-outline"></ion-icon>
            Limpar filtros
          </button>
          <button
            v-if="canExportActiveTab"
            type="button"
            class="erp-button-muted"
            :disabled="exporting !== null"
            @click="exportCurrentReport('excel')"
          >
            <ion-icon name="download-outline"></ion-icon>
            {{ exporting === "excel" ? "Exportando..." : "Exportar Excel" }}
          </button>
          <button
            v-if="canExportActiveTab"
            type="button"
            class="erp-button-primary"
            :disabled="exporting !== null"
            @click="exportCurrentReport('pdf')"
          >
            <ion-icon name="document-text-outline"></ion-icon>
            {{ exporting === "pdf" ? "Exportando..." : "Exportar PDF" }}
          </button>
        </div>
      </div>

      <div class="mt-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1">
        <button
          type="button"
          class="rounded-xl px-4 py-2 text-sm font-semibold transition"
          :class="activeTab === 'general' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
          @click="activeTab = 'general'"
        >
          Geral
        </button>
        <button
          type="button"
          class="rounded-xl px-4 py-2 text-sm font-semibold transition"
          :class="activeTab === 'stock' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
          @click="activeTab = 'stock'"
        >
          Estoque
        </button>
        <button
          type="button"
          class="rounded-xl px-4 py-2 text-sm font-semibold transition"
          :class="activeTab === 'movements' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
          @click="activeTab = 'movements'"
        >
          Movimentacoes
        </button>
        <button
          type="button"
          class="rounded-xl px-4 py-2 text-sm font-semibold transition"
          :class="activeTab === 'transfers' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
          @click="activeTab = 'transfers'"
        >
          Transferencias
        </button>
        <button
          type="button"
          class="rounded-xl px-4 py-2 text-sm font-semibold transition"
          :class="activeTab === 'alerts' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
          @click="activeTab = 'alerts'"
        >
          Alertas
        </button>
      </div>
    </article>

    <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.05s">
      <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 class="font-heading text-xl text-slate-900">Filtros do painel</h2>
          <p class="mt-1 text-sm text-slate-500">
            Use filtros amigaveis para cruzar estoque atual com movimentacoes e transferencias.
          </p>
        </div>

        <p v-if="!canExportActiveTab" class="text-xs text-slate-500">
          Exportacao disponivel nas abas Estoque, Movimentacoes e Transferencias.
        </p>
      </div>

      <div class="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div v-if="activeTab === 'general' || activeTab === 'stock' || activeTab === 'alerts'" class="xl:col-span-2">
          <label class="erp-label">Busca</label>
          <input v-model="filters.search" class="erp-field" type="text" placeholder="Produto, SKU ou termo do estoque" />
        </div>

        <div>
          <label class="erp-label">Base</label>
          <select v-model="filters.baseId" class="erp-select" :disabled="referencesLoading">
            <option value="">Todas as bases</option>
            <option v-for="base in knownBases" :key="base.id" :value="base.id">{{ base.name }}</option>
          </select>
        </div>

        <div>
          <label class="erp-label">Categoria</label>
          <select v-model="filters.categoryId" class="erp-select" :disabled="referencesLoading">
            <option value="">Todas as categorias</option>
            <option v-for="category in knownCategories" :key="category.id" :value="category.id">{{ category.name }}</option>
          </select>
        </div>

        <div>
          <label class="erp-label">Produto</label>
          <select v-model="filters.productId" class="erp-select" :disabled="referencesLoading">
            <option value="">Todos os produtos</option>
            <option v-for="product in knownProducts" :key="product.id" :value="product.id">
              {{ product.name }} - SKU {{ product.sku }}
            </option>
          </select>
        </div>

        <div v-if="activeTab !== 'stock'">
          <label class="erp-label">Data inicial</label>
          <input v-model="filters.dateFrom" class="erp-field" type="date" />
        </div>

        <div v-if="activeTab !== 'stock'">
          <label class="erp-label">Data final</label>
          <input v-model="filters.dateTo" class="erp-field" type="date" />
        </div>

        <template v-if="activeTab === 'movements'">
          <div>
            <label class="erp-label">Tipo</label>
            <select v-model="filters.movementType" class="erp-select">
              <option v-for="option in typeOptions" :key="option.label" :value="option.value">{{ option.label }}</option>
            </select>
          </div>

          <div>
            <label class="erp-label">Status</label>
            <select v-model="filters.movementStatus" class="erp-select">
              <option v-for="option in statusOptions" :key="option.label" :value="option.value">{{ option.label }}</option>
            </select>
          </div>

          <div>
            <label class="erp-label">Base de origem</label>
            <select v-model="filters.sourceBaseId" class="erp-select" :disabled="referencesLoading">
              <option value="">Todas</option>
              <option v-for="base in knownBases" :key="`movement-source-${base.id}`" :value="base.id">{{ base.name }}</option>
            </select>
          </div>

          <div>
            <label class="erp-label">Base de destino</label>
            <select v-model="filters.destinationBaseId" class="erp-select" :disabled="referencesLoading">
              <option value="">Todas</option>
              <option v-for="base in knownBases" :key="`movement-destination-${base.id}`" :value="base.id">{{ base.name }}</option>
            </select>
          </div>
        </template>

        <template v-else-if="activeTab === 'transfers'">
          <div>
            <label class="erp-label">Status</label>
            <select v-model="filters.transferStatus" class="erp-select">
              <option v-for="option in statusOptions" :key="option.label" :value="option.value">{{ option.label }}</option>
            </select>
          </div>

          <div>
            <label class="erp-label">Base de origem</label>
            <select v-model="filters.sourceBaseId" class="erp-select" :disabled="referencesLoading">
              <option value="">Todas</option>
              <option v-for="base in knownBases" :key="`transfer-source-${base.id}`" :value="base.id">{{ base.name }}</option>
            </select>
          </div>

          <div>
            <label class="erp-label">Base de destino</label>
            <select v-model="filters.destinationBaseId" class="erp-select" :disabled="referencesLoading">
              <option value="">Todas</option>
              <option v-for="base in knownBases" :key="`transfer-destination-${base.id}`" :value="base.id">{{ base.name }}</option>
            </select>
          </div>
        </template>
      </div>

      <div class="mt-5 flex flex-wrap gap-2">
        <button type="button" class="erp-button-primary" :disabled="loading" @click="loadActiveReport">
          <ion-icon name="search-outline"></ion-icon>
          {{ loading ? "Filtrando..." : "Aplicar filtros" }}
        </button>
      </div>
    </article>

    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article
        v-for="card in activeCards"
        :key="card.label"
        class="rounded-[28px] border p-5 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)]"
        :class="card.tone"
      >
        <p class="text-xs font-semibold uppercase tracking-[0.16em]">{{ card.label }}</p>
        <p class="font-heading mt-3 text-3xl text-slate-900">{{ card.value }}</p>
        <p class="mt-2 text-sm text-slate-600">{{ card.helper }}</p>
      </article>
    </section>

    <template v-if="activeTab === 'general'">
      <section class="grid gap-6 xl:grid-cols-2">
        <article class="erp-surface p-5">
          <h3 class="font-heading text-lg text-slate-900">Estoque por base</h3>
          <p class="mt-1 text-sm text-slate-500">Bases com maior saldo no filtro atual.</p>

          <div v-if="stockByBaseInsights.length > 0" class="mt-4 space-y-3">
            <div v-for="item in stockByBaseInsights" :key="item.label" class="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p class="text-sm font-semibold text-slate-800">{{ item.label }}</p>
              </div>
              <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="resolveInsightBadgeTone(item.tone)">
                {{ item.displayValue }}
              </span>
            </div>
          </div>

          <p v-else class="mt-4 text-sm text-slate-500">Sem dados para esse recorte.</p>
        </article>

        <article class="erp-surface p-5">
          <h3 class="font-heading text-lg text-slate-900">Itens criticos</h3>
          <p class="mt-1 text-sm text-slate-500">Produtos que pedem reposicao com mais urgencia.</p>

          <div v-if="criticalStockInsights.length > 0" class="mt-4 space-y-3">
            <div
              v-for="item in criticalStockInsights"
              :key="`${item.label}-${item.helper}`"
              class="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div>
                <p class="text-sm font-semibold text-slate-800">{{ item.label }}</p>
                <p v-if="item.helper" class="mt-1 text-xs text-slate-500">{{ item.helper }}</p>
              </div>
              <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="resolveInsightBadgeTone(item.tone)">
                {{ item.displayValue }}
              </span>
            </div>
          </div>

          <p v-else class="mt-4 text-sm text-slate-500">Nenhum item critico no filtro atual.</p>
        </article>
      </section>

      <article class="erp-surface p-5">
        <h2 class="font-heading text-xl text-slate-900">Ultimas movimentacoes</h2>

        <div class="mt-4 erp-table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Origem</th>
                <th>Destino</th>
                <th>Qtd total</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="7" class="text-center text-slate-500">Carregando...</td>
              </tr>
              <tr v-else-if="latestMovements.length === 0">
                <td colspan="7" class="text-center text-slate-500">Nenhuma movimentacao encontrada.</td>
              </tr>
              <tr v-for="row in latestMovements" :key="row.id">
                <td data-label="ID" class="font-mono text-xs text-slate-600">{{ row.id }}</td>
                <td data-label="Tipo" class="font-medium text-slate-900">{{ formatMovementType(row.type) }}</td>
                <td data-label="Status">
                  <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="movementStatusTone(row.status)">
                    {{ formatMovementStatus(row.status) }}
                  </span>
                </td>
                <td data-label="Origem">{{ row.sourceBase }}</td>
                <td data-label="Destino">{{ row.destinationBase }}</td>
                <td data-label="Qtd total">{{ formatNumber(row.totalQuantity) }}</td>
                <td data-label="Criado em">{{ formatDateTime(row.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </template>

    <template v-else-if="activeTab === 'stock'">
      <section class="grid gap-6 xl:grid-cols-2">
        <article class="erp-surface p-5">
          <h3 class="font-heading text-lg text-slate-900">Estoque por base</h3>
          <p class="mt-1 text-sm text-slate-500">Bases com maior saldo para o filtro atual.</p>

          <div v-if="stockByBaseInsights.length > 0" class="mt-4 space-y-3">
            <div v-for="item in stockByBaseInsights" :key="item.label" class="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-sm font-semibold text-slate-800">{{ item.label }}</p>
              <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="resolveInsightBadgeTone(item.tone)">
                {{ item.displayValue }}
              </span>
            </div>
          </div>

          <p v-else class="mt-4 text-sm text-slate-500">Sem dados para esse filtro.</p>
        </article>

        <article class="erp-surface p-5">
          <h3 class="font-heading text-lg text-slate-900">Produtos em alerta</h3>
          <p class="mt-1 text-sm text-slate-500">Itens zerados ou abaixo do minimo.</p>

          <div v-if="criticalStockInsights.length > 0" class="mt-4 space-y-3">
            <div
              v-for="item in criticalStockInsights"
              :key="`${item.label}-${item.helper}`"
              class="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div>
                <p class="text-sm font-semibold text-slate-800">{{ item.label }}</p>
                <p v-if="item.helper" class="mt-1 text-xs text-slate-500">{{ item.helper }}</p>
              </div>
              <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="resolveInsightBadgeTone(item.tone)">
                {{ item.displayValue }}
              </span>
            </div>
          </div>

          <p v-else class="mt-4 text-sm text-slate-500">Nenhum alerta de estoque encontrado.</p>
        </article>
      </section>

      <article class="erp-surface p-5">
        <h2 class="font-heading text-xl text-slate-900">Detalhe do estoque</h2>

        <div class="mt-4 erp-table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th>Categoria</th>
                <th>Base</th>
                <th>Estoque atual</th>
                <th>Minimo</th>
                <th>Status</th>
                <th>Atualizado em</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="8" class="text-center text-slate-500">Carregando...</td>
              </tr>
              <tr v-else-if="stockRowsDetailed.length === 0">
                <td colspan="8" class="text-center text-slate-500">Nenhum registro encontrado.</td>
              </tr>
              <tr v-for="row in stockRowsDetailed" :key="`${row.productId}-${row.baseId}`">
                <td data-label="Produto" class="font-medium text-slate-900">{{ row.productName }}</td>
                <td data-label="SKU">{{ row.sku }}</td>
                <td data-label="Categoria">{{ row.category }}</td>
                <td data-label="Base">{{ row.base }}</td>
                <td data-label="Estoque atual">{{ formatNumber(row.quantity) }}</td>
                <td data-label="Minimo">{{ formatNumber(row.minimumStock) }}</td>
                <td data-label="Status">
                  <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="resolveStockTone(row.status)">
                    {{ row.statusLabel }}
                  </span>
                </td>
                <td data-label="Atualizado em">{{ formatDateTime(row.updatedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </template>

    <template v-else-if="activeTab === 'movements'">
      <section class="grid gap-6 xl:grid-cols-2">
        <article class="erp-surface p-5">
          <h3 class="font-heading text-lg text-slate-900">Status das movimentacoes</h3>
          <p class="mt-1 text-sm text-slate-500">Distribuicao dos registros por status.</p>

          <div v-if="movementStatusInsights.length > 0" class="mt-4 space-y-3">
            <div v-for="item in movementStatusInsights" :key="item.label" class="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p class="text-sm font-semibold text-slate-800">{{ item.label }}</p>
                <p v-if="item.helper" class="mt-1 text-xs text-slate-500">{{ item.helper }}</p>
              </div>
              <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="resolveInsightBadgeTone(item.tone)">
                {{ item.displayValue }}
              </span>
            </div>
          </div>

          <p v-else class="mt-4 text-sm text-slate-500">Sem dados de status para o filtro atual.</p>
        </article>

        <article class="erp-surface p-5">
          <h3 class="font-heading text-lg text-slate-900">Rotas mais movimentadas</h3>
          <p class="mt-1 text-sm text-slate-500">Fluxos mais ativos entre bases.</p>

          <div v-if="transferRouteInsights.length > 0" class="mt-4 space-y-3">
            <div v-for="item in transferRouteInsights" :key="item.label" class="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-sm font-semibold text-slate-800">{{ item.label }}</p>
              <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="resolveInsightBadgeTone(item.tone)">
                {{ item.displayValue }}
              </span>
            </div>
          </div>

          <p v-else class="mt-4 text-sm text-slate-500">Sem rotas para o recorte atual.</p>
        </article>
      </section>

      <article class="erp-surface p-5">
        <h2 class="font-heading text-xl text-slate-900">Detalhe das movimentacoes</h2>

        <div class="mt-4 erp-table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Origem</th>
                <th>Destino</th>
                <th>Criado por</th>
                <th>Qtd total</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="8" class="text-center text-slate-500">Carregando...</td>
              </tr>
              <tr v-else-if="movementRows.length === 0">
                <td colspan="8" class="text-center text-slate-500">Nenhum registro encontrado.</td>
              </tr>
              <tr v-for="row in movementRows" :key="row.id">
                <td data-label="ID" class="font-mono text-xs text-slate-600">{{ row.id }}</td>
                <td data-label="Tipo" class="font-medium text-slate-900">{{ formatMovementType(row.type) }}</td>
                <td data-label="Status">
                  <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="movementStatusTone(row.status)">
                    {{ formatMovementStatus(row.status) }}
                  </span>
                </td>
                <td data-label="Origem">{{ row.sourceBase }}</td>
                <td data-label="Destino">{{ row.destinationBase }}</td>
                <td data-label="Criado por">{{ row.createdBy }}</td>
                <td data-label="Qtd total">{{ formatNumber(row.totalQuantity) }}</td>
                <td data-label="Criado em">{{ formatDateTime(row.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </template>

    <template v-else-if="activeTab === 'transfers'">
      <section class="grid gap-6 xl:grid-cols-2">
        <article class="erp-surface p-5">
          <h3 class="font-heading text-lg text-slate-900">Rotas de transferencia</h3>
          <p class="mt-1 text-sm text-slate-500">Fluxo de envio entre bases no filtro atual.</p>

          <div v-if="transferRouteInsights.length > 0" class="mt-4 space-y-3">
            <div v-for="item in transferRouteInsights" :key="item.label" class="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-sm font-semibold text-slate-800">{{ item.label }}</p>
              <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="resolveInsightBadgeTone(item.tone)">
                {{ item.displayValue }}
              </span>
            </div>
          </div>

          <p v-else class="mt-4 text-sm text-slate-500">Sem rotas para o filtro atual.</p>
        </article>

        <article class="erp-surface p-5">
          <h3 class="font-heading text-lg text-slate-900">Status das transferencias</h3>
          <p class="mt-1 text-sm text-slate-500">Situacao atual das transferencias retornadas.</p>

          <div v-if="transferStatusInsights.length > 0" class="mt-4 space-y-3">
            <div v-for="item in transferStatusInsights" :key="item.label" class="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p class="text-sm font-semibold text-slate-800">{{ item.label }}</p>
                <p v-if="item.helper" class="mt-1 text-xs text-slate-500">{{ item.helper }}</p>
              </div>
              <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="resolveInsightBadgeTone(item.tone)">
                {{ item.displayValue }}
              </span>
            </div>
          </div>

          <p v-else class="mt-4 text-sm text-slate-500">Sem status para o recorte atual.</p>
        </article>
      </section>

      <article class="erp-surface p-5">
        <h2 class="font-heading text-xl text-slate-900">Detalhe das transferencias</h2>

        <div class="mt-4 erp-table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Origem</th>
                <th>Destino</th>
                <th>Aprovado por</th>
                <th>Qtd total</th>
                <th>Criado em</th>
                <th>Concluido em</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="8" class="text-center text-slate-500">Carregando...</td>
              </tr>
              <tr v-else-if="transferRows.length === 0">
                <td colspan="8" class="text-center text-slate-500">Nenhum registro encontrado.</td>
              </tr>
              <tr v-for="row in transferRows" :key="row.id">
                <td data-label="ID" class="font-mono text-xs text-slate-600">{{ row.id }}</td>
                <td data-label="Status">
                  <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="movementStatusTone(row.status)">
                    {{ formatMovementStatus(row.status) }}
                  </span>
                </td>
                <td data-label="Origem">{{ row.sourceBase }}</td>
                <td data-label="Destino">{{ row.destinationBase }}</td>
                <td data-label="Aprovado por">{{ row.approvedBy }}</td>
                <td data-label="Qtd total">{{ formatNumber(row.totalQuantity) }}</td>
                <td data-label="Criado em">{{ formatDateTime(row.createdAt) }}</td>
                <td data-label="Concluido em">{{ formatDateTime(row.completedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </template>

    <template v-else>
      <section class="grid gap-6 xl:grid-cols-2">
        <article class="erp-surface p-5">
          <h3 class="font-heading text-lg text-slate-900">Alertas por base</h3>
          <p class="mt-1 text-sm text-slate-500">Onde os itens criticos estao mais concentrados.</p>

          <div v-if="alertBaseInsights.length > 0" class="mt-4 space-y-3">
            <div v-for="item in alertBaseInsights" :key="item.label" class="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-sm font-semibold text-slate-800">{{ item.label }}</p>
              <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="resolveInsightBadgeTone(item.tone)">
                {{ item.displayValue }}
              </span>
            </div>
          </div>

          <p v-else class="mt-4 text-sm text-slate-500">Nenhum alerta de base encontrado.</p>
        </article>

        <article class="erp-surface p-5">
          <h3 class="font-heading text-lg text-slate-900">Transferencias envelhecidas</h3>
          <p class="mt-1 text-sm text-slate-500">Pendencias com 2 dias ou mais.</p>

          <div v-if="agedTransferInsights.length > 0" class="mt-4 space-y-3">
            <div
              v-for="item in agedTransferInsights"
              :key="`${item.label}-${item.helper}`"
              class="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div>
                <p class="text-sm font-semibold text-slate-800">{{ item.label }}</p>
                <p v-if="item.helper" class="mt-1 text-xs text-slate-500">{{ item.helper }}</p>
              </div>
              <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="resolveInsightBadgeTone(item.tone)">
                {{ item.displayValue }}
              </span>
            </div>
          </div>

          <p v-else class="mt-4 text-sm text-slate-500">Nenhuma transferencia envelhecida no recorte atual.</p>
        </article>
      </section>

      <article class="erp-surface p-5">
        <h2 class="font-heading text-xl text-slate-900">Detalhe dos alertas de estoque</h2>

        <div class="mt-4 erp-table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th>Base</th>
                <th>Estoque atual</th>
                <th>Minimo</th>
                <th>Status</th>
                <th>Atualizado em</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="7" class="text-center text-slate-500">Carregando...</td>
              </tr>
              <tr v-else-if="criticalStockRows.length === 0">
                <td colspan="7" class="text-center text-slate-500">Nenhum alerta encontrado.</td>
              </tr>
              <tr v-for="row in criticalStockRows" :key="`${row.productId}-${row.baseId}`">
                <td data-label="Produto" class="font-medium text-slate-900">{{ row.productName }}</td>
                <td data-label="SKU">{{ row.sku }}</td>
                <td data-label="Base">{{ row.base }}</td>
                <td data-label="Estoque atual">{{ formatNumber(row.quantity) }}</td>
                <td data-label="Minimo">{{ formatNumber(row.minimumStock) }}</td>
                <td data-label="Status">
                  <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="resolveStockTone(row.status)">
                    {{ row.statusLabel }}
                  </span>
                </td>
                <td data-label="Atualizado em">{{ formatDateTime(row.updatedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </template>
  </section>
</template>
