<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useNotifier } from "../composables/useNotifier";
import { ApiError, api } from "../services/api";
import { useAuthStore } from "../stores/auth";
import type { ReportFormat, StockMovementDetail } from "../types/api";
import { formatDateTime, formatMovementStatus, formatMovementType, formatNumber, formatRole, movementStatusTone } from "../utils/format";

const auth = useAuthStore();
const notifier = useNotifier();
const route = useRoute();
const router = useRouter();

const movement = ref<StockMovementDetail | null>(null);
const loading = ref(false);
const exporting = ref<ReportFormat | null>(null);
const actionLoading = ref<"approve" | "reject" | "confirm" | "cancel" | "reverse" | null>(null);
const rejectReason = ref("");
const cancelReason = ref("");
const reverseReason = ref("");

const movementId = computed(() => String(route.params.id ?? ""));
const selectedBaseId = computed(() => (typeof route.query.baseId === "string" ? route.query.baseId : ""));
const isTransferMovement = computed(() => movement.value?.type === "TRANSFER");

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

async function loadMovement() {
  if (!auth.state.token || !movementId.value) {
    return;
  }

  loading.value = true;

  try {
    const response = await api.getStockMovement(auth.state.token, movementId.value);
    movement.value = response.movement;
  } catch (error) {
    notifier.error("Falha ao carregar movimentacao", resolveErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

async function exportMovement(format: ReportFormat) {
  if (!auth.state.token || !movementId.value) {
    return;
  }

  exporting.value = format;

  try {
    const exported = await api.exportStockMovement(auth.state.token, movementId.value, format);
    downloadExport(exported.blob, exported.fileName);
    notifier.success("Exportacao concluida", `Arquivo ${exported.fileName} pronto para uso.`);
  } catch (error) {
    notifier.error("Falha na exportacao", resolveErrorMessage(error));
  } finally {
    exporting.value = null;
  }
}

async function handleApprove() {
  if (!auth.state.token || !movement.value?.permissions.canApprove) {
    return;
  }

  actionLoading.value = "approve";

  try {
    const response = await api.approveStockMovement(auth.state.token, movement.value.id);
    notifier.success("Movimentacao aprovada", `Novo status: ${formatMovementStatus(response.movement.status)}.`);
    await loadMovement();
  } catch (error) {
    notifier.error("Falha ao aprovar", resolveErrorMessage(error));
  } finally {
    actionLoading.value = null;
  }
}

async function handleReject() {
  if (!auth.state.token || !movement.value?.permissions.canReject) {
    return;
  }

  const normalizedReason = rejectReason.value.trim();

  if (normalizedReason.length < 3) {
    notifier.error("Motivo obrigatorio", "Informe um motivo de rejeicao com ao menos 3 caracteres.");
    return;
  }

  actionLoading.value = "reject";

  try {
    const response = await api.rejectStockMovement(auth.state.token, movement.value.id, normalizedReason);
    notifier.success("Movimentacao rejeitada", `Novo status: ${formatMovementStatus(response.movement.status)}.`);
    rejectReason.value = "";
    await loadMovement();
  } catch (error) {
    notifier.error("Falha ao rejeitar", resolveErrorMessage(error));
  } finally {
    actionLoading.value = null;
  }
}

async function handleConfirmTransfer() {
  if (!auth.state.token || !movement.value?.permissions.canConfirmTransfer) {
    return;
  }

  actionLoading.value = "confirm";

  try {
    const response = await api.confirmTransfer(auth.state.token, movement.value.id);
    notifier.success("Transferencia confirmada", `Novo status: ${formatMovementStatus(response.movement.status)}.`);
    await loadMovement();
  } catch (error) {
    notifier.error("Falha ao confirmar transferencia", resolveErrorMessage(error));
  } finally {
    actionLoading.value = null;
  }
}

async function handleCancel() {
  if (!auth.state.token || !movement.value?.permissions.canCancel) {
    return;
  }

  const normalizedReason = cancelReason.value.trim();

  if (normalizedReason.length < 3) {
    notifier.error("Motivo obrigatorio", "Informe um motivo de cancelamento com ao menos 3 caracteres.");
    return;
  }

  if (!window.confirm("Deseja realmente cancelar esta movimentacao? Nenhum ajuste sera aplicado ao estoque.")) {
    return;
  }

  actionLoading.value = "cancel";

  try {
    const response = await api.cancelStockMovement(auth.state.token, movement.value.id, normalizedReason);
    notifier.success("Movimentacao cancelada", `Novo status: ${formatMovementStatus(response.movement.status)}.`);
    cancelReason.value = "";
    await loadMovement();
  } catch (error) {
    notifier.error("Falha ao cancelar", resolveErrorMessage(error));
  } finally {
    actionLoading.value = null;
  }
}

async function handleReverse() {
  if (!auth.state.token || !movement.value?.permissions.canReverse) {
    return;
  }

  const normalizedReason = reverseReason.value.trim();

  if (normalizedReason.length < 3) {
    notifier.error("Motivo obrigatorio", "Informe um motivo de estorno com ao menos 3 caracteres.");
    return;
  }

  if (!window.confirm("Deseja realmente estornar esta movimentacao? O sistema fara o rollback transacional do estoque.")) {
    return;
  }

  actionLoading.value = "reverse";

  try {
    const response = await api.reverseStockMovement(auth.state.token, movement.value.id, normalizedReason);
    notifier.success("Movimentacao estornada", `Novo status: ${formatMovementStatus(response.movement.status)}.`);
    reverseReason.value = "";
    await loadMovement();
  } catch (error) {
    notifier.error("Falha ao estornar", resolveErrorMessage(error));
  } finally {
    actionLoading.value = null;
  }
}

function goBack() {
  router.push({
    name: "movements",
    query: selectedBaseId.value ? { baseId: selectedBaseId.value } : {}
  });
}

function openLinkedMovement(targetMovementId: string) {
  router.push({
    name: "movement-detail",
    params: {
      id: targetMovementId
    },
    query: selectedBaseId.value ? { baseId: selectedBaseId.value } : {}
  });
}

onMounted(async () => {
  if (!auth.state.initialized) {
    await auth.bootstrap();
  }

  await loadMovement();
});
</script>

<template>
  <section class="space-y-6">
    <article class="erp-surface p-6 reveal-up">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Movimentacao</p>
          <h1 class="font-heading mt-2 text-3xl text-slate-900">Detalhes da movimentacao</h1>
          <p class="mt-2 text-sm text-slate-600">
            Visualize os itens, acompanhe o status e execute as acoes permitidas para este registro.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button type="button" class="erp-button-muted" @click="goBack">Voltar para a lista</button>
          <button type="button" class="erp-button-muted" :disabled="exporting !== null || !movement" @click="exportMovement('excel')">
            {{ exporting === "excel" ? "Exportando..." : "Exportar Excel" }}
          </button>
          <button type="button" class="erp-button-primary" :disabled="exporting !== null || !movement" @click="exportMovement('pdf')">
            {{ exporting === "pdf" ? "Exportando..." : "Exportar PDF" }}
          </button>
        </div>
      </div>
    </article>

    <article v-if="loading" class="erp-surface p-6">
      <p class="text-sm text-slate-500">Carregando movimentacao...</p>
    </article>

    <template v-else-if="movement">
      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article class="erp-kpi reveal-up" style="animation-delay: 0.04s">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tipo</p>
          <p class="font-heading mt-3 text-2xl text-slate-900">{{ formatMovementType(movement.type) }}</p>
        </article>
        <article class="erp-kpi reveal-up" style="animation-delay: 0.06s">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</p>
          <div class="mt-3">
            <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" :class="movementStatusTone(movement.status)">
              {{ formatMovementStatus(movement.status) }}
            </span>
          </div>
        </article>
        <article class="erp-kpi reveal-up" style="animation-delay: 0.08s">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Itens</p>
          <p class="font-heading mt-3 text-2xl text-slate-900">{{ formatNumber(movement.items.length) }}</p>
        </article>
        <article class="erp-kpi reveal-up" style="animation-delay: 0.1s">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Quantidade total</p>
          <p class="font-heading mt-3 text-2xl text-slate-900">{{ formatNumber(movement.totalQuantity) }}</p>
        </article>
      </section>

      <section class="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
        <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.12s">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-heading text-2xl text-slate-900">Resumo operacional</h2>
              <p class="mt-1 text-sm text-slate-600">ID: <span class="font-mono text-xs">{{ movement.id }}</span></p>
            </div>
            <button type="button" class="erp-button-muted" @click="loadMovement">Atualizar</button>
          </div>

          <div class="mt-5 grid gap-4 md:grid-cols-2">
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Base de origem</p>
              <p class="mt-2 text-sm font-semibold text-slate-900">{{ movement.sourceBase?.name ?? "-" }}</p>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Base de destino</p>
              <p class="mt-2 text-sm font-semibold text-slate-900">{{ movement.destinationBase?.name ?? "-" }}</p>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Criado por</p>
              <p class="mt-2 text-sm font-semibold text-slate-900">{{ movement.createdBy.name }}</p>
              <p class="mt-1 text-xs text-slate-500">{{ movement.createdBy.email }} - {{ formatRole(movement.createdBy.role) }}</p>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {{ isTransferMovement ? "Analisado por" : "Aprovado por" }}
              </p>
              <p class="mt-2 text-sm font-semibold text-slate-900">{{ movement.approvedBy?.name ?? "-" }}</p>
              <p v-if="movement.approvedBy" class="mt-1 text-xs text-slate-500">
                {{ movement.approvedBy.email }} - {{ formatRole(movement.approvedBy.role) }}
              </p>
            </div>
          </div>

          <div class="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Criado em</p>
              <p class="mt-2 text-sm text-slate-700">{{ formatDateTime(movement.createdAt) }}</p>
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Atualizado em</p>
              <p class="mt-2 text-sm text-slate-700">{{ formatDateTime(movement.updatedAt) }}</p>
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {{ isTransferMovement ? "Analisado em" : "Aprovado em" }}
              </p>
              <p class="mt-2 text-sm text-slate-700">{{ formatDateTime(movement.approvedAt ?? "-") }}</p>
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Concluido em</p>
              <p class="mt-2 text-sm text-slate-700">{{ formatDateTime(movement.completedAt ?? "-") }}</p>
            </div>
          </div>

          <div class="mt-5 space-y-4">
            <div v-if="movement.type === 'TRANSFER'" class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Fluxo da transferencia</p>
              <p class="mt-2 text-sm text-amber-900">
                A base de origem abriu esta transferencia. A base de destino deve conferir os itens e confirmar o recebimento
                para validar a operacao.
              </p>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-white p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Motivo</p>
              <p class="mt-2 text-sm text-slate-700">{{ movement.reason ?? "-" }}</p>
            </div>

            <div v-if="movement.rejectionReason" class="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">Motivo da rejeicao</p>
              <p class="mt-2 text-sm text-rose-800">{{ movement.rejectionReason }}</p>
            </div>

            <div v-if="movement.cancellationReason" class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Motivo do cancelamento</p>
              <p class="mt-2 text-sm text-slate-700">{{ movement.cancellationReason }}</p>
            </div>

            <div v-if="movement.reversalReason" class="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">Motivo do estorno</p>
              <p class="mt-2 text-sm text-cyan-800">{{ movement.reversalReason }}</p>
            </div>

            <div
              v-if="movement.originalMovementId || movement.reversalMovementId"
              class="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2"
            >
              <div v-if="movement.originalMovementId" class="rounded-xl border border-slate-200 bg-white p-4">
                <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Origem do estorno</p>
                <p class="mt-2 font-mono text-xs text-slate-700">{{ movement.originalMovementId }}</p>
                <button type="button" class="erp-button-muted mt-3 px-3 py-1.5 text-xs" @click="openLinkedMovement(movement.originalMovementId)">
                  Abrir movimentacao original
                </button>
              </div>

              <div v-if="movement.reversalMovementId" class="rounded-xl border border-slate-200 bg-white p-4">
                <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Movimentacao de estorno</p>
                <p class="mt-2 font-mono text-xs text-slate-700">{{ movement.reversalMovementId }}</p>
                <button type="button" class="erp-button-muted mt-3 px-3 py-1.5 text-xs" @click="openLinkedMovement(movement.reversalMovementId)">
                  Abrir movimentacao de estorno
                </button>
              </div>
            </div>
          </div>
        </article>

        <article class="erp-surface p-6 reveal-up" style="animation-delay: 0.16s">
          <h2 class="font-heading text-2xl text-slate-900">Acoes disponiveis</h2>
          <p class="mt-2 text-sm text-slate-600">
            As opcoes abaixo respeitam o status atual da movimentacao e as permissoes da sua conta.
          </p>

          <div class="mt-5 space-y-4">
            <button
              v-if="movement.permissions.canApprove"
              type="button"
              class="erp-button-primary w-full"
              :disabled="actionLoading !== null"
              @click="handleApprove"
            >
              {{ actionLoading === "approve" ? "Aprovando..." : "Aprovar movimentacao" }}
            </button>

            <div v-if="movement.permissions.canReject" class="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <label class="erp-label">{{ movement.type === "TRANSFER" ? "Motivo da recusa" : "Motivo da rejeicao" }}</label>
              <textarea
                v-model="rejectReason"
                class="min-h-[96px] w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
                maxlength="255"
                :placeholder="
                  movement.type === 'TRANSFER'
                    ? 'Descreva por que a base de destino recusou esta transferencia'
                    : 'Descreva o motivo da rejeicao'
                "
              />
              <button
                type="button"
                class="erp-button-muted w-full border-rose-200 text-rose-700 hover:bg-rose-100"
                :disabled="actionLoading !== null"
                @click="handleReject"
              >
                {{
                  actionLoading === "reject"
                    ? movement.type === "TRANSFER"
                      ? "Recusando..."
                      : "Rejeitando..."
                    : movement.type === "TRANSFER"
                      ? "Recusar transferencia"
                      : "Rejeitar movimentacao"
                }}
              </button>
            </div>

            <button
              v-if="movement.permissions.canConfirmTransfer"
              type="button"
              class="erp-button-muted w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              :disabled="actionLoading !== null"
              @click="handleConfirmTransfer"
            >
              {{ actionLoading === "confirm" ? "Validando..." : "Validar e confirmar transferencia" }}
            </button>

            <div v-if="movement.permissions.canCancel" class="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label class="erp-label">Motivo do cancelamento</label>
              <textarea
                v-model="cancelReason"
                class="min-h-[96px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                maxlength="255"
                placeholder="Explique por que esta movimentacao deve ser cancelada"
              />
              <button type="button" class="erp-button-muted w-full" :disabled="actionLoading !== null" @click="handleCancel">
                {{ actionLoading === "cancel" ? "Cancelando..." : "Cancelar movimentacao" }}
              </button>
            </div>

            <div v-if="movement.permissions.canReverse" class="space-y-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
              <label class="erp-label">Motivo do estorno</label>
              <textarea
                v-model="reverseReason"
                class="min-h-[96px] w-full rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                maxlength="255"
                placeholder="Explique por que esta movimentacao deve ser estornada"
              />
              <button
                type="button"
                class="erp-button-muted w-full border-cyan-200 text-cyan-700 hover:bg-cyan-100"
                :disabled="actionLoading !== null"
                @click="handleReverse"
              >
                {{ actionLoading === "reverse" ? "Estornando..." : "Estornar movimentacao" }}
              </button>
            </div>

            <p
              v-if="
                !movement.permissions.canApprove &&
                !movement.permissions.canReject &&
                !movement.permissions.canConfirmTransfer &&
                !movement.permissions.canCancel &&
                !movement.permissions.canReverse
              "
              class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
            >
              Nenhuma acao operacional esta disponivel para esta movimentacao no momento.
            </p>
          </div>
        </article>
      </section>

      <article class="erp-surface p-5 reveal-up" style="animation-delay: 0.18s">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-heading text-xl text-slate-900">Itens da movimentacao</h2>
          <p class="text-xs uppercase tracking-[0.14em] text-slate-500">{{ movement.items.length }} itens</p>
        </div>

        <div class="erp-table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th>ID do produto</th>
                <th>Quantidade</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in movement.items" :key="`${movement.id}-${item.productId}`">
                <td data-label="Produto" class="font-medium text-slate-900">{{ item.productName }}</td>
                <td data-label="SKU" class="font-mono text-xs">{{ item.sku }}</td>
                <td data-label="ID do produto" class="font-mono text-xs text-slate-600">{{ item.productId }}</td>
                <td data-label="Quantidade">{{ formatNumber(item.quantity) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </template>

    <article v-else class="erp-surface p-6">
      <p class="text-sm text-slate-500">Nao foi possivel encontrar esta movimentacao.</p>
    </article>
  </section>
</template>
