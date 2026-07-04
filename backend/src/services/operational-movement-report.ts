import { StockMovementStatus, StockMovementType } from "@prisma/client";
import { OperationalPdfReport } from "./report-export.service";

export type OperationalMovementReportRecord = {
  id: string;
  type: StockMovementType;
  status: StockMovementStatus;
  reason?: string | null;
  rejectionReason?: string | null;
  cancellationReason?: string | null;
  reversalReason?: string | null;
  sourceBaseName?: string | null;
  destinationBaseName?: string | null;
  createdByName: string;
  approvedByName?: string | null;
  createdAt: Date | string;
  approvedAt?: Date | string | null;
  completedAt?: Date | string | null;
  items: Array<{
    productName: string;
    quantity: number;
  }>;
};

export function buildOperationalMovementPdfReport(input: {
  title: string;
  companyName: string;
  companyLogoDataUrl: string | null;
  contextLines?: string[];
  contextItems?: Array<{
    label: string;
    value: string;
  }>;
  records: OperationalMovementReportRecord[];
}): OperationalPdfReport {
  return {
    title: input.title,
    generatedAt: new Date(),
    pdfHeader: {
      companyName: input.companyName,
      companyLogoDataUrl: input.companyLogoDataUrl,
      contextLines: input.contextLines,
      contextItems: input.contextItems
    },
    operations: input.records.map((record) => mapOperationalMovement(record))
  };
}

function mapOperationalMovement(record: OperationalMovementReportRecord): OperationalPdfReport["operations"][number] {
  const totalQuantity = record.items.reduce((accumulator, item) => accumulator + item.quantity, 0);
  const operationLabel = record.type === "TRANSFER" ? "Transferencia" : "Movimentacao";

  return {
    id: record.id,
    title: `${operationLabel} #${record.id}`,
    badge: formatMovementStatus(record.status),
    badgeTone: resolveOperationalBadgeTone(record.status),
    meta: [
      { label: "Tipo", value: formatMovementType(record.type) },
      { label: "Status", value: formatMovementStatus(record.status) },
      { label: "Base origem", value: record.sourceBaseName ?? "-" },
      { label: "Base destino", value: record.destinationBaseName ?? "-" },
      { label: "Criado por", value: record.createdByName },
      { label: record.type === "TRANSFER" ? "Analisado por" : "Aprovado por", value: record.approvedByName ?? "-" },
      { label: "Criado em", value: formatDateTimeDisplay(record.createdAt) },
      {
        label: record.type === "TRANSFER" ? "Analisado em" : "Aprovado em",
        value: record.approvedAt ? formatDateTimeDisplay(record.approvedAt) : "-"
      },
      { label: "Concluido em", value: record.completedAt ? formatDateTimeDisplay(record.completedAt) : "-" }
    ],
    notes: [
      { label: "Motivo", value: record.reason ?? "-" },
      { label: "Observacoes", value: record.reversalReason ?? record.cancellationReason ?? record.rejectionReason ?? "-" }
    ],
    items: record.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity
    })),
    summary: [
      { label: "Quantidade de produtos", value: record.items.length.toLocaleString("pt-BR") },
      { label: "Quantidade total de itens", value: totalQuantity.toLocaleString("pt-BR") }
    ]
  };
}

function resolveOperationalBadgeTone(
  status: StockMovementStatus
): OperationalPdfReport["operations"][number]["badgeTone"] {
  if (status === StockMovementStatus.COMPLETED) {
    return "success";
  }

  if (status === StockMovementStatus.PENDING || status === StockMovementStatus.APPROVED) {
    return "warning";
  }

  if (
    status === StockMovementStatus.REJECTED ||
    status === StockMovementStatus.CANCELED ||
    status === StockMovementStatus.REVERSED
  ) {
    return "danger";
  }

  return "neutral";
}

function formatMovementType(type: StockMovementType): string {
  if (type === StockMovementType.ENTRY) {
    return "Entrada";
  }

  if (type === StockMovementType.EXIT) {
    return "Saida";
  }

  return "Transferencia";
}

function formatMovementStatus(status: StockMovementStatus): string {
  if (status === StockMovementStatus.PENDING) {
    return "Pendente";
  }

  if (status === StockMovementStatus.APPROVED) {
    return "Aprovada";
  }

  if (status === StockMovementStatus.REJECTED) {
    return "Rejeitada";
  }

  if (status === StockMovementStatus.CANCELED) {
    return "Cancelada";
  }

  if (status === StockMovementStatus.REVERSED) {
    return "Estornada";
  }

  return "Concluida";
}

function formatDateTimeDisplay(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(parsed);
}
