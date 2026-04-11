import type { Role, StockMovementStatus, StockMovementType } from "../types/api";

const roleLabelMap: Record<Role, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  TECNICO: "Técnico"
};

const movementTypeLabelMap: Record<StockMovementType, string> = {
  ENTRY: "Entrada",
  EXIT: "Saída",
  TRANSFER: "Transferência"
};

const movementStatusLabelMap: Record<StockMovementStatus, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  COMPLETED: "Concluído",
  REJECTED: "Rejeitado",
  CANCELED: "Cancelado",
  REVERSED: "Estornado"
};

const movementStatusToneMap: Record<StockMovementStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-sky-100 text-sky-800 border-sky-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-200",
  CANCELED: "bg-slate-200 text-slate-800 border-slate-300",
  REVERSED: "bg-cyan-100 text-cyan-800 border-cyan-200"
};

export function formatDateTime(value: string): string {
  if (!value || value === "-") {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(parsed);
}

export function formatDateOnly(value: string): string {
  if (!value || value === "-") {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short"
  }).format(parsed);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatRole(role: Role): string {
  return roleLabelMap[role] ?? role;
}

export function formatMovementType(type: StockMovementType): string {
  return movementTypeLabelMap[type] ?? type;
}

export function formatMovementStatus(status: StockMovementStatus): string {
  return movementStatusLabelMap[status] ?? status;
}

export function movementStatusTone(status: StockMovementStatus): string {
  return movementStatusToneMap[status] ?? "bg-slate-100 text-slate-700 border-slate-200";
}
