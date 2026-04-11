<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useNotifier } from "../../composables/useNotifier";
import { ApiError, api } from "../../services/api";
import { useAuthStore } from "../../stores/auth";
import type {
  BaseEntity,
  MovementReportResponse,
  ProductEntity,
  StockMovementStatus,
  StockReportResponse,
  TransferReportResponse
} from "../../types/api";
import {
  formatDateTime,
  formatMovementStatus,
  formatMovementType,
  formatNumber,
  formatRole,
  movementStatusTone
} from "../../utils/format";

type PeriodPreset = "today" | "7d" | "30d" | "all";
type AlertCard = {
  label: string;
  value: string;
  helper: string;
  tone: string;
};
type TodoItem = {
  label: string;
  helper: string;
  count: number;
  to: string;
  buttonLabel: string;
  tone: string;
};
type StockStatus = "zero" | "low" | "good";
type StockRowDetailed = StockReportResponse["rows"][number] & {
  minimumStock: number;
  status: StockStatus;
  statusLabel: string;
  gap: number;
};
type BaseHealthEntry = {
  baseId: string;
  base: string;
  quantity: number;
  monitored: number;
  zeroCount: number;
  lowCount: number;
  alertCount: number;
  percent: number;
};

const auth = useAuthStore();
const notifier = useNotifier();

const loading = ref(false);
const referencesLoading = ref(false);
const loadError = ref("");

const selectedBaseId = ref("");
const selectedPeriod = ref<PeriodPreset>("7d");

const knownBases = ref<BaseEntity[]>([]);
const knownProducts = ref<ProductEntity[]>([]);

const stockReport = ref<StockReportResponse | null>(null);
const movementsReport = ref<MovementReportResponse | null>(null);
const transfersReport = ref<TransferReportResponse | null>(null);

const periodOptions: Array<{ label: string; value: PeriodPreset }> = [
  { label: "Hoje", value: "today" },
  { label: "Ultimos 7 dias", value: "7d" },
  { label: "Ultimos 30 dias", value: "30d" },
  { label: "Todo o periodo", value: "all" }
];

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Erro inesperado";
}

function getPeriodRange(preset: PeriodPreset): { dateFrom?: string; dateTo?: string } {
  if (preset === "all") {
    return {};
  }

  const now = new Date();
  const dateTo = new Date(now);
  dateTo.setHours(23, 59, 59, 999);

  const dateFrom = new Date(now);

  if (preset === "today") {
    dateFrom.setHours(0, 0, 0, 0);
  } else if (preset === "7d") {
    dateFrom.setDate(dateFrom.getDate() - 6);
    dateFrom.setHours(0, 0, 0, 0);
  } else {
    dateFrom.setDate(dateFrom.getDate() - 29);
    dateFrom.setHours(0, 0, 0, 0);
  }

  return {
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString()
  };
}

function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  }).format(date);
}

function resolveStockTone(status: StockStatus): string {
  if (status === "zero") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (status === "low") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function summarizeMovementItems(value: string): string {
  if (!value || value === "-") {
    return "Sem itens detalhados";
  }

  return value.length > 84 ? `${value.slice(0, 81)}...` : value;
}

function resolveMovementFlow(row: MovementReportResponse["rows"][number]): string {
  if (row.type === "ENTRY") {
    return `Destino: ${row.destinationBase}`;
  }

  if (row.type === "EXIT") {
    return `Origem: ${row.sourceBase}`;
  }

  return `${row.sourceBase} -> ${row.destinationBase}`;
}

async function loadReferences() {
  if (!auth.state.token) {
    return;
  }

  referencesLoading.value = true;

  try {
    const [basesResponse, productsResponse] = await Promise.all([api.listBases(auth.state.token), api.listProducts(auth.state.token)]);

    knownBases.value = basesResponse.bases;
    knownProducts.value = productsResponse.products;
  } catch (error) {
    notifier.error("Falha ao carregar referencias", resolveErrorMessage(error));
  } finally {
    referencesLoading.value = false;
  }
}

async function loadDashboard() {
  if (!auth.state.token) {
    return;
  }

  loading.value = true;
  loadError.value = "";

  const baseId = selectedBaseId.value || undefined;
  const periodRange = getPeriodRange(selectedPeriod.value);

  try {
    const [stock, movements, transfers] = await Promise.all([
      api.getStockReport(auth.state.token, { baseId }),
      api.getMovementsReport(auth.state.token, { baseId, ...periodRange }),
      api.getTransfersReport(auth.state.token, { baseId, ...periodRange })
    ]);

    stockReport.value = stock;
    movementsReport.value = movements;
    transfersReport.value = transfers;
  } catch (error) {
    const message = resolveErrorMessage(error);
    loadError.value = message;
    notifier.error("Falha ao carregar painel", message);
  } finally {
    loading.value = false;
  }
}

async function refreshDashboard() {
  await loadReferences();
  await loadDashboard();
}

async function clearFilters() {
  selectedBaseId.value = "";
  selectedPeriod.value = "7d";
  await loadDashboard();
}

const authUser = computed(() => auth.state.user);
const selectedBaseLabel = computed(
  () => knownBases.value.find((base) => base.id === selectedBaseId.value)?.name ?? "Todas as bases"
);
const selectedPeriodLabel = computed(
  () => periodOptions.find((option) => option.value === selectedPeriod.value)?.label ?? "Ultimos 7 dias"
);
const productIndex = computed(() => new Map(knownProducts.value.map((product) => [product.id, product])));
const movementRows = computed(() => movementsReport.value?.rows ?? []);
const transferRows = computed(() => transfersReport.value?.rows ?? []);

const stockRowsDetailed = computed<StockRowDetailed[]>(() =>
  (stockReport.value?.rows ?? []).map((row) => {
    const product = productIndex.value.get(row.productId);
    const minimumStock = product?.minimumStock ?? 0;
    const status: StockStatus = row.quantity <= 0 ? "zero" : minimumStock > 0 && row.quantity <= minimumStock ? "low" : "good";

    return {
      ...row,
      minimumStock,
      status,
      statusLabel: status === "zero" ? "Estoque zerado" : status === "low" ? "Estoque baixo" : "Estoque bom",
      gap: Math.max(0, minimumStock - row.quantity)
    };
  })
);

const totalStockQuantity = computed(() => stockRowsDetailed.value.reduce((total, row) => total + row.quantity, 0));
const totalStockRows = computed(() => stockRowsDetailed.value.length);
const monitoredProductsCount = computed(() => new Set(stockRowsDetailed.value.map((row) => row.productId)).size);
const zeroStockCount = computed(() => stockRowsDetailed.value.filter((row) => row.status === "zero").length);
const lowStockCount = computed(() => stockRowsDetailed.value.filter((row) => row.status === "low").length);
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

const entriesInPeriod = computed(() =>
  movementRows.value.filter((row) => row.type === "ENTRY").reduce((total, row) => total + row.totalQuantity, 0)
);
const exitsInPeriod = computed(() =>
  movementRows.value.filter((row) => row.type === "EXIT").reduce((total, row) => total + row.totalQuantity, 0)
);
const pendingMovementCount = computed(() => movementRows.value.filter((row) => row.status === "PENDING").length);
const openTransfersCount = computed(() =>
  transferRows.value.filter((row) => row.status === "PENDING" || row.status === "APPROVED").length
);
const problemMovementCount = computed(() =>
  movementRows.value.filter((row) => row.status === "REJECTED" || row.status === "CANCELED" || row.status === "REVERSED").length
);

const alertCards = computed<AlertCard[]>(() => [
  {
    label: "Produtos zerados",
    value: formatNumber(zeroStockCount.value),
    helper: "Itens sem saldo para atendimento",
    tone: "border-rose-200 bg-rose-50 text-rose-700"
  },
  {
    label: "Abaixo do minimo",
    value: formatNumber(lowStockCount.value),
    helper: "Produtos em alerta de reposicao",
    tone: "border-amber-200 bg-amber-50 text-amber-700"
  },
  {
    label: "Pendencias de aprovacao",
    value: formatNumber(pendingMovementCount.value),
    helper: "Movimentacoes aguardando acao",
    tone: "border-amber-200 bg-amber-50 text-amber-700"
  },
  {
    label: "Transferencias abertas",
    value: formatNumber(openTransfersCount.value),
    helper: "Pendentes ou aprovadas sem conclusao",
    tone: "border-cyan-200 bg-cyan-50 text-cyan-700"
  }
]);

const kpiCards = computed<AlertCard[]>(() => [
  {
    label: "Volume em estoque",
    value: formatNumber(totalStockQuantity.value),
    helper: "Soma das unidades disponiveis",
    tone: "border-slate-200 bg-white text-slate-700"
  },
  {
    label: "Itens monitorados",
    value: formatNumber(monitoredProductsCount.value),
    helper: `${formatNumber(totalStockRows.value)} linhas de estoque cadastradas`,
    tone: "border-slate-200 bg-white text-slate-700"
  },
  {
    label: "Entradas no periodo",
    value: formatNumber(entriesInPeriod.value),
    helper: `Filtro atual: ${selectedPeriodLabel.value}`,
    tone: "border-slate-200 bg-white text-slate-700"
  },
  {
    label: "Saidas no periodo",
    value: formatNumber(exitsInPeriod.value),
    helper: `Filtro atual: ${selectedPeriodLabel.value}`,
    tone: "border-slate-200 bg-white text-slate-700"
  }
]);

const todoItems = computed<TodoItem[]>(() => [
  {
    label: "Repor produtos criticos",
    helper: "Itens zerados ou abaixo do minimo precisam de acompanhamento",
    count: criticalStockRows.value.length,
    to: "/app/products",
    buttonLabel: "Ver produtos",
    tone: "border-rose-200 bg-rose-50"
  },
  {
    label: "Tratar movimentacoes pendentes",
    helper: "Registros aguardando aprovacao ou decisao operacional",
    count: pendingMovementCount.value,
    to: "/app/movements",
    buttonLabel: "Abrir movimentacoes",
    tone: "border-amber-200 bg-amber-50"
  },
  {
    label: "Confirmar transferencias",
    helper: "Transferencias abertas precisam ser acompanhadas ate conclusao",
    count: openTransfersCount.value,
    to: "/app/movements",
    buttonLabel: "Ver transferencias",
    tone: "border-cyan-200 bg-cyan-50"
  },
  {
    label: "Revisar ocorrencias",
    helper: "Rejeicoes, cancelamentos e estornos merecem auditoria",
    count: problemMovementCount.value,
    to: "/app/reports",
    buttonLabel: "Abrir relatorios",
    tone: "border-slate-200 bg-slate-50"
  }
]);

const recentMovements = computed(() =>
  [...movementRows.value]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 8)
);

const movementStatusSummary = computed(() => {
  const statusCountMap = new Map<StockMovementStatus, number>();

  for (const row of movementRows.value) {
    statusCountMap.set(row.status, (statusCountMap.get(row.status) ?? 0) + 1);
  }

  return Array.from(statusCountMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((left, right) => right.count - left.count);
});

const stockByBaseHealth = computed<BaseHealthEntry[]>(() => {
  const grouped = new Map<string, BaseHealthEntry>();

  for (const row of stockRowsDetailed.value) {
    const existing = grouped.get(row.baseId);

    if (existing) {
      existing.quantity += row.quantity;
      existing.monitored += 1;
      if (row.status === "zero") {
        existing.zeroCount += 1;
      }
      if (row.status === "low") {
        existing.lowCount += 1;
      }
      existing.alertCount = existing.zeroCount + existing.lowCount;
      continue;
    }

    grouped.set(row.baseId, {
      baseId: row.baseId,
      base: row.base,
      quantity: row.quantity,
      monitored: 1,
      zeroCount: row.status === "zero" ? 1 : 0,
      lowCount: row.status === "low" ? 1 : 0,
      alertCount: row.status === "good" ? 0 : 1,
      percent: 0
    });
  }

  const ordered = Array.from(grouped.values()).sort((left, right) => right.quantity - left.quantity);
  const maxValue = ordered[0]?.quantity ?? 0;

  return ordered.map((entry) => ({
    ...entry,
    percent: maxValue === 0 ? 0 : Math.max(8, Math.round((entry.quantity / maxValue) * 100))
  }));
});

const criticalProductsPreview = computed(() => criticalStockRows.value.slice(0, 8));

const movementTrendLast7Days = computed(() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));

    return {
      key: date.toISOString().slice(0, 10),
      label: formatDayLabel(date),
      entry: 0,
      exit: 0,
      transfer: 0
    };
  });

  for (const row of movementRows.value) {
    const parsed = new Date(row.createdAt);

    if (Number.isNaN(parsed.getTime())) {
      continue;
    }

    const key = parsed.toISOString().slice(0, 10);
    const target = days.find((day) => day.key === key);

    if (!target) {
      continue;
    }

    if (row.type === "ENTRY") {
      target.entry += row.totalQuantity;
      continue;
    }

    if (row.type === "EXIT") {
      target.exit += row.totalQuantity;
      continue;
    }

    target.transfer += row.totalQuantity;
  }

  return days;
});

onMounted(async () => {
  if (!auth.state.initialized) {
    await auth.bootstrap();
  }

  await refreshDashboard();
});
</script>

<template>
  <section class="space-y-6">
    <article class="erp-surface overflow-hidden p-6 sm:p-7 reveal-up">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Resumo executivo</p>
          <h1 class="font-heading mt-2 text-3xl text-slate-900">Painel operacional</h1>
          <p class="mt-2 text-sm text-slate-600">
            {{ authUser?.name ?? "Usuario" }}
            <span v-if="authUser">({{ formatRole(authUser.role) }})</span>
            acompanhando indicadores de estoque, pendencias e movimentacoes.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <RouterLink to="/app/reports" class="erp-button-muted">Abrir relatorios</RouterLink>
          <button type="button" class="erp-button-primary" :disabled="loading" @click="loadDashboard">
            {{ loading ? "Atualizando..." : "Atualizar dados" }}
          </button>
        </div>
      </div>

      <div v-if="loadError" class="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {{ loadError }}
      </div>
    </article>

    <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.04s">
      <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 class="font-heading text-xl text-slate-900">Filtros do painel</h2>
          <p class="mt-1 text-sm text-slate-500">Refine a operacao por base e por janela de acompanhamento.</p>
        </div>

        <button type="button" class="erp-button-muted" :disabled="loading" @click="clearFilters">Limpar filtros</button>
      </div>

      <div class="mt-5 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)_auto]">
        <div>
          <label class="erp-label">Periodo</label>
          <select v-model="selectedPeriod" class="erp-select" :disabled="loading">
            <option v-for="option in periodOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </div>

        <div>
          <label class="erp-label">Base</label>
          <select v-model="selectedBaseId" class="erp-select" :disabled="referencesLoading || loading">
            <option value="">Todas as bases</option>
            <option v-for="base in knownBases" :key="base.id" :value="base.id">{{ base.name }}</option>
          </select>
        </div>

        <button type="button" class="erp-button-primary md:self-end" :disabled="loading" @click="loadDashboard">
          {{ loading ? "Filtrando..." : "Aplicar" }}
        </button>
      </div>
    </article>

    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="card in alertCards" :key="card.label" class="rounded-[28px] border p-5 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)]" :class="card.tone">
        <p class="text-xs font-semibold uppercase tracking-[0.16em]">{{ card.label }}</p>
        <p class="font-heading mt-3 text-3xl text-slate-900">{{ card.value }}</p>
        <p class="mt-2 text-sm text-slate-600">{{ card.helper }}</p>
      </article>
    </section>

    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="card in kpiCards" :key="card.label" class="erp-kpi reveal-up">
        <p class="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{{ card.label }}</p>
        <p class="font-heading mt-3 text-3xl text-slate-900">{{ card.value }}</p>
        <p class="mt-1 text-xs text-slate-500">{{ card.helper }}</p>
      </article>
    </section>

    <section class="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
      <article class="erp-surface p-5 reveal-up" style="animation-delay: 0.08s">
        <div class="mb-4">
          <h2 class="font-heading text-xl text-slate-900">A fazer agora</h2>
          <p class="mt-1 text-sm text-slate-500">Fila operacional baseada no filtro atual.</p>
        </div>

        <div class="space-y-3">
          <article
            v-for="item in todoItems"
            :key="item.label"
            class="rounded-2xl border p-4"
            :class="item.tone"
          >
            <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div class="flex items-center gap-3">
                  <p class="text-sm font-semibold text-slate-900">{{ item.label }}</p>
                  <span class="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {{ formatNumber(item.count) }}
                  </span>
                </div>
                <p class="mt-1 text-sm text-slate-600">{{ item.helper }}</p>
              </div>

              <RouterLink :to="item.to" class="erp-button-muted w-full text-center sm:w-auto">
                {{ item.buttonLabel }}
              </RouterLink>
            </div>
          </article>
        </div>
      </article>

      <article class="erp-surface p-5 reveal-up" style="animation-delay: 0.12s">
        <div class="mb-4">
          <h2 class="font-heading text-xl text-slate-900">Saude por base</h2>
          <p class="mt-1 text-sm text-slate-500">Saldo, cobertura e alertas por base operacional.</p>
        </div>

        <div v-if="stockByBaseHealth.length === 0" class="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          Sem dados de estoque para exibir.
        </div>

        <div v-else class="space-y-4">
          <article v-for="entry in stockByBaseHealth" :key="entry.baseId" class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold text-slate-900">{{ entry.base }}</p>
                <p class="mt-1 text-xs text-slate-500">
                  {{ entry.monitored }} itens monitorados | {{ entry.alertCount }} alertas
                </p>
              </div>
              <span class="text-sm font-semibold text-slate-800">{{ formatNumber(entry.quantity) }}</span>
            </div>

            <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                class="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 transition-all duration-500"
                :style="{ width: `${entry.percent}%` }"
              />
            </div>

            <div class="mt-3 flex flex-wrap gap-2 text-xs">
              <span class="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                Zerados {{ formatNumber(entry.zeroCount) }}
              </span>
              <span class="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
                Baixo {{ formatNumber(entry.lowCount) }}
              </span>
            </div>
          </article>
        </div>
      </article>
    </section>

    <section class="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
      <article class="erp-surface p-5 reveal-up" style="animation-delay: 0.16s">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 class="font-heading text-xl text-slate-900">Produtos criticos</h2>
            <p class="mt-1 text-sm text-slate-500">Produtos zerados ou abaixo do minimo por base.</p>
          </div>
          <RouterLink to="/app/products" class="erp-button-muted text-sm">Abrir produtos</RouterLink>
        </div>

        <div class="erp-table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Base</th>
                <th>Atual</th>
                <th>Minimo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="criticalProductsPreview.length === 0">
                <td colspan="5" class="text-center text-slate-500">Nenhum item critico encontrado.</td>
              </tr>
              <tr v-for="row in criticalProductsPreview" :key="`${row.productId}-${row.baseId}`">
                <td data-label="Produto" class="font-medium text-slate-900">
                  {{ row.productName }}
                  <span class="mt-1 block text-xs text-slate-500">SKU {{ row.sku }}</span>
                </td>
                <td data-label="Base">{{ row.base }}</td>
                <td data-label="Atual">{{ formatNumber(row.quantity) }}</td>
                <td data-label="Minimo">{{ formatNumber(row.minimumStock) }}</td>
                <td data-label="Status">
                  <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="resolveStockTone(row.status)">
                    {{ row.statusLabel }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="erp-surface p-5 reveal-up" style="animation-delay: 0.2s">
        <div class="mb-4">
          <h2 class="font-heading text-xl text-slate-900">Tendencia 7 dias</h2>
          <p class="mt-1 text-sm text-slate-500">Entradas, saidas e transferencias por dia.</p>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <article v-for="day in movementTrendLast7Days" :key="day.key" class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p class="text-sm font-semibold text-slate-900">{{ day.label }}</p>
            <div class="mt-3 flex flex-wrap gap-2 text-xs">
              <span class="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
                E {{ formatNumber(day.entry) }}
              </span>
              <span class="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-700">
                S {{ formatNumber(day.exit) }}
              </span>
              <span class="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-indigo-700">
                T {{ formatNumber(day.transfer) }}
              </span>
            </div>
          </article>
        </div>
      </article>
    </section>

    <article class="erp-surface p-5 reveal-up" style="animation-delay: 0.24s">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 class="font-heading text-xl text-slate-900">Atividade recente</h2>
          <p class="mt-1 text-sm text-slate-500">Leitura rapida das ultimas ocorrencias registradas.</p>
        </div>
        <p class="text-xs uppercase tracking-[0.15em] text-slate-500">Ultimas 8</p>
      </div>

      <div class="erp-table-wrap">
        <table class="erp-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Resumo</th>
              <th>Fluxo</th>
              <th>Responsavel</th>
              <th>Status</th>
              <th>Criado em</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="recentMovements.length === 0">
              <td colspan="6" class="text-center text-slate-500">Nenhuma movimentacao encontrada.</td>
            </tr>
            <tr v-for="movement in recentMovements" :key="movement.id">
              <td data-label="Tipo" class="font-medium text-slate-900">{{ formatMovementType(movement.type) }}</td>
              <td data-label="Resumo">
                <span class="block text-slate-800">{{ summarizeMovementItems(movement.items) }}</span>
                <span class="mt-1 block text-xs text-slate-500">Qtd {{ formatNumber(movement.totalQuantity) }}</span>
              </td>
              <td data-label="Fluxo">{{ resolveMovementFlow(movement) }}</td>
              <td data-label="Responsavel">{{ movement.createdBy }}</td>
              <td data-label="Status">
                <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="movementStatusTone(movement.status)">
                  {{ formatMovementStatus(movement.status) }}
                </span>
              </td>
              <td data-label="Criado em">{{ formatDateTime(movement.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <section class="grid gap-6 xl:grid-cols-[1fr_320px]">
      <article class="erp-surface p-5 reveal-up" style="animation-delay: 0.28s">
        <h2 class="font-heading text-xl text-slate-900">Status das movimentacoes</h2>
        <p class="mt-1 text-sm text-slate-500">Distribuicao por etapa do fluxo operacional.</p>

        <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="entry in movementStatusSummary"
            :key="entry.status"
            class="rounded-xl border px-4 py-4"
            :class="movementStatusTone(entry.status)"
          >
            <p class="text-xs font-semibold uppercase tracking-[0.12em]">{{ formatMovementStatus(entry.status) }}</p>
            <p class="font-heading mt-2 text-2xl">{{ formatNumber(entry.count) }}</p>
          </div>
          <div
            v-if="movementStatusSummary.length === 0"
            class="col-span-full rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500"
          >
            Nenhum registro encontrado para montar o painel de status.
          </div>
        </div>
      </article>

      <article class="erp-surface p-5 reveal-up" style="animation-delay: 0.32s">
        <h2 class="font-heading text-xl text-slate-900">Atalhos rapidos</h2>
        <p class="mt-1 text-sm text-slate-500">Acoes mais comuns para seguir a operacao.</p>

        <div class="mt-4 grid gap-3">
          <RouterLink to="/app/movements" class="erp-button-primary text-center">Criar movimentacao</RouterLink>
          <RouterLink to="/app/products" class="erp-button-muted text-center">Ver produtos criticos</RouterLink>
          <RouterLink to="/app/movements" class="erp-button-muted text-center">Ver transferencias</RouterLink>
          <RouterLink to="/app/reports" class="erp-button-muted text-center">Abrir relatorios</RouterLink>
        </div>

        <div class="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Contexto atual</p>
          <div class="mt-3 space-y-2 text-sm text-slate-600">
            <p><span class="font-semibold text-slate-800">Base:</span> {{ selectedBaseLabel }}</p>
            <p><span class="font-semibold text-slate-800">Periodo:</span> {{ selectedPeriodLabel }}</p>
            <p><span class="font-semibold text-slate-800">Ocorrencias com problema:</span> {{ formatNumber(problemMovementCount) }}</p>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>
