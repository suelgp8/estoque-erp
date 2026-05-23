export type StockStatus = "CRITICAL" | "WARNING" | "HEALTHY";

export type StockStatusInput = {
  quantity: number;
  minimumQuantity: number;
  idealQuantity: number;
};

export type StockThresholdInput = {
  stock?: {
    minimumQuantity: number;
    idealQuantity: number;
  } | null;
  legacyMinimumStock?: number;
};

export type StockThresholds = {
  minimumQuantity: number;
  idealQuantity: number;
};

export function resolveStockThresholds(input: StockThresholdInput): StockThresholds {
  const legacyMinimumStock = Math.max(0, input.legacyMinimumStock ?? 0);
  const stockMinimumQuantity = input.stock?.minimumQuantity ?? 0;
  const stockIdealQuantity = input.stock?.idealQuantity ?? 0;
  const shouldFallbackToLegacy =
    legacyMinimumStock > 0 &&
    (!input.stock || (stockMinimumQuantity === 0 && stockIdealQuantity === 0));

  if (shouldFallbackToLegacy) {
    return {
      minimumQuantity: legacyMinimumStock,
      idealQuantity: legacyMinimumStock
    };
  }

  return {
    minimumQuantity: stockMinimumQuantity,
    idealQuantity: Math.max(stockIdealQuantity, stockMinimumQuantity)
  };
}

export function resolveStockStatus(input: StockStatusInput): StockStatus {
  if (input.quantity < input.minimumQuantity) {
    return "CRITICAL";
  }

  if (input.quantity < input.idealQuantity) {
    return "WARNING";
  }

  return "HEALTHY";
}
