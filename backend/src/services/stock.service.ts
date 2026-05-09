import { TRPCError } from "@trpc/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { env } from "../config/env";

const bases = pgTable("Base", {
  id: text("id").primaryKey(),
  companyId: text("companyId").notNull(),
});

const legacyStocks = pgTable(
  "Stock",
  {
    id: text("id").primaryKey().default(sql`nextval('app_numeric_id_seq'::regclass)::text`),
    companyId: text("companyId").notNull(),
    productId: text("productId").notNull(),
    baseId: text("baseId").notNull(),
    quantity: integer("quantity").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
  },
  (table) => ({
    productIdIdx: index("Stock_productId_idx").on(table.productId),
    baseIdIdx: index("Stock_baseId_idx").on(table.baseId),
  }),
);

declare global {
  var stockServicePool: Pool | undefined;
}

const pool =
  globalThis.stockServicePool ??
  new Pool({
    connectionString: env.DATABASE_URL,
  });

if (env.NODE_ENV !== "production") {
  globalThis.stockServicePool = pool;
}

const db = drizzle(pool);

type DbClient = typeof db;
type Tx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type DbExecutor = DbClient | Tx;

type MovementType = "ENTRY" | "EXIT" | "TRANSFER";

export type ProductStockRecord = typeof legacyStocks.$inferSelect;

export type MovementRecord = {
  id: string;
  type: MovementType;
  productId: string;
  fromBaseId: string | null;
  toBaseId: string | null;
  technicianId: string | null;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
};

export type StockSnapshot = {
  productId: string;
  baseId: string;
  quantity: number;
};

export type StockMutationResult = {
  stock: StockSnapshot;
  movement: MovementRecord;
};

export type StockTransferResult = {
  sourceStock: StockSnapshot;
  destinationStock: StockSnapshot;
  movement: MovementRecord;
};

export class StockServiceTransaction {
  constructor(private readonly executor: DbExecutor) {}

  async addStock(productId: string, baseId: string, quantity: number, technicianId?: string): Promise<StockMutationResult> {
    this.assertPositiveQuantity(quantity);
    await this.ensureStockRow(productId, baseId);
    await this.assertCurrentStockIsNonNegative(productId, baseId);

    const stock = await this.incrementStock(productId, baseId, quantity);
    const movement = this.fakeMovement("ENTRY", productId, null, baseId, technicianId, quantity);

    return { stock, movement };
  }

  async removeStock(productId: string, baseId: string, quantity: number, technicianId?: string): Promise<StockMutationResult> {
    this.assertPositiveQuantity(quantity);
    await this.ensureStockRow(productId, baseId);
    await this.validateAvailableStock(productId, baseId, quantity);

    const stock = await this.decrementStock(productId, baseId, quantity);
    const movement = this.fakeMovement("EXIT", productId, baseId, null, technicianId, quantity);

    return { stock, movement };
  }

  async transferStock(
    productId: string,
    fromBaseId: string,
    toBaseId: string,
    quantity: number,
    technicianId?: string,
  ): Promise<StockTransferResult> {
    this.assertPositiveQuantity(quantity);

    if (fromBaseId === toBaseId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Base de origem e destino devem ser diferentes",
      });
    }

    await this.ensureStockRow(productId, fromBaseId);
    await this.ensureStockRow(productId, toBaseId);
    await this.assertCurrentStockIsNonNegative(productId, toBaseId);
    await this.validateAvailableStock(productId, fromBaseId, quantity);

    const sourceStock = await this.decrementStock(productId, fromBaseId, quantity);
    const destinationStock = await this.incrementStock(productId, toBaseId, quantity);
    const movement = this.fakeMovement("TRANSFER", productId, fromBaseId, toBaseId, technicianId, quantity);

    return { sourceStock, destinationStock, movement };
  }

  async getStock(productId: string, baseId: string): Promise<StockSnapshot> {
    const [stock] = await this.executor
      .select({
        productId: legacyStocks.productId,
        baseId: legacyStocks.baseId,
        quantity: legacyStocks.quantity,
      })
      .from(legacyStocks)
      .where(and(eq(legacyStocks.productId, productId), eq(legacyStocks.baseId, baseId)))
      .limit(1);

    return stock ?? { productId, baseId, quantity: 0 };
  }

  private assertPositiveQuantity(quantity: number) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Quantidade deve ser maior que zero" });
    }
  }

  private async ensureStockRow(productId: string, baseId: string): Promise<void> {
    const now = new Date();
    const companyId = await this.resolveCompanyIdForBase(baseId);

    await this.executor
      .insert(legacyStocks)
      .values({ companyId, productId, baseId, quantity: 0, createdAt: now, updatedAt: now })
      .onConflictDoNothing({ target: [legacyStocks.productId, legacyStocks.baseId] });
  }

  private async incrementStock(productId: string, baseId: string, quantity: number): Promise<StockSnapshot> {
    const [stock] = await this.executor
      .update(legacyStocks)
      .set({ quantity: sql`${legacyStocks.quantity} + ${quantity}`, updatedAt: new Date() })
      .where(and(eq(legacyStocks.productId, productId), eq(legacyStocks.baseId, baseId)))
      .returning({
        productId: legacyStocks.productId,
        baseId: legacyStocks.baseId,
        quantity: legacyStocks.quantity,
      });

    if (!stock) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao atualizar estoque" });
    }

    this.assertResultingQuantityIsNonNegative(stock.quantity);
    return stock;
  }

  private async decrementStock(productId: string, baseId: string, quantity: number): Promise<StockSnapshot> {
    const [stock] = await this.executor
      .update(legacyStocks)
      .set({ quantity: sql`${legacyStocks.quantity} - ${quantity}`, updatedAt: new Date() })
      .where(and(eq(legacyStocks.productId, productId), eq(legacyStocks.baseId, baseId), gte(legacyStocks.quantity, quantity)))
      .returning({
        productId: legacyStocks.productId,
        baseId: legacyStocks.baseId,
        quantity: legacyStocks.quantity,
      });

    if (!stock) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Estoque insuficiente" });
    }

    this.assertResultingQuantityIsNonNegative(stock.quantity);
    return stock;
  }

  private async validateAvailableStock(productId: string, baseId: string, quantity: number): Promise<void> {
    const currentStock = await this.getStock(productId, baseId);
    this.assertCurrentQuantityIsNonNegative(currentStock.quantity);

    if (currentStock.quantity < quantity) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Estoque insuficiente" });
    }
  }

  private async assertCurrentStockIsNonNegative(productId: string, baseId: string): Promise<void> {
    const currentStock = await this.getStock(productId, baseId);
    this.assertCurrentQuantityIsNonNegative(currentStock.quantity);
  }

  private async resolveCompanyIdForBase(baseId: string): Promise<string> {
    const [base] = await this.executor
      .select({ companyId: bases.companyId })
      .from(bases)
      .where(eq(bases.id, baseId))
      .limit(1);

    if (!base) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Base informada nao encontrada" });
    }

    return base.companyId;
  }

  private assertCurrentQuantityIsNonNegative(quantity: number): void {
    if (quantity < 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Operacao bloqueada: estoque com saldo negativo" });
    }
  }

  private assertResultingQuantityIsNonNegative(quantity: number | undefined): void {
    if (quantity !== undefined && quantity < 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Operacao bloqueada: saldo de estoque nao pode ficar negativo" });
    }
  }

  private fakeMovement(
    type: MovementType,
    productId: string,
    fromBaseId: string | null,
    toBaseId: string | null,
    technicianId: string | undefined,
    quantity: number,
  ): MovementRecord {
    const now = new Date();

    return {
      id: `temp-${Date.now()}`,
      type,
      productId,
      fromBaseId,
      toBaseId,
      technicianId: technicianId ?? null,
      quantity,
      createdAt: now,
      updatedAt: now,
    };
  }
}

export class StockService {
  async withTransaction<T>(operation: (tx: StockServiceTransaction) => Promise<T>): Promise<T> {
    return db.transaction(async (tx: Tx) => {
      await tx.execute(sql`select set_config('app.stock_service_write', 'on', true)`);
      return operation(new StockServiceTransaction(tx));
    });
  }

  async addStock(productId: string, baseId: string, quantity: number, technicianId?: string): Promise<StockMutationResult> {
    return this.withTransaction((tx) => tx.addStock(productId, baseId, quantity, technicianId));
  }

  async removeStock(productId: string, baseId: string, quantity: number, technicianId?: string): Promise<StockMutationResult> {
    return this.withTransaction((tx) => tx.removeStock(productId, baseId, quantity, technicianId));
  }

  async transferStock(productId: string, fromBaseId: string, toBaseId: string, quantity: number, technicianId?: string): Promise<StockTransferResult> {
    return this.withTransaction((tx) => tx.transferStock(productId, fromBaseId, toBaseId, quantity, technicianId));
  }

  async getStock(productId: string, baseId: string): Promise<StockSnapshot> {
    return this.withTransaction((tx) => tx.getStock(productId, baseId));
  }
}

export const stockService = new StockService();
