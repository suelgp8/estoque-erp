import { TRPCError } from "@trpc/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { env } from "../config/env";

const products = pgTable("Product", {
  id: text("id").primaryKey(),
});

const bases = pgTable("Base", {
  id: text("id").primaryKey(),
  companyId: text("companyId").notNull(),
});

const users = pgTable("User", {
  id: text("id").primaryKey(),
});

const legacyStocks = pgTable("Stock", {
  id: text("id").primaryKey().default(sql`nextval('app_numeric_id_seq'::regclass)::text`),
  companyId: text("companyId").notNull(),
  productId: text("productId").notNull(),
  baseId: text("baseId").notNull(),
  quantity: integer("quantity").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
});

const productStocks = pgTable(
  "productStocks",
  {
    id: text("id").primaryKey().default(sql`nextval('app_numeric_id_seq'::regclass)::text`),
    productId: text("productId")
      .notNull()
      .references(() => products.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    baseId: text("baseId")
      .notNull()
      .references(() => bases.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    quantity: integer("quantity").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
  },
  (table: any) => ({
    productIdIdx: index("productStocks_productId_idx").on(table.productId),
    baseIdIdx: index("productStocks_baseId_idx").on(table.baseId),
    productBaseUnique: uniqueIndex("productStocks_productId_baseId_unique").on(table.productId, table.baseId),
    quantityNonNegative: check("productStocks_quantity_non_negative", sql`${table.quantity} >= 0`),
  }),
);

const movements = pgTable(
  "movements",
  {
    id: text("id").primaryKey().default(sql`nextval('app_numeric_id_seq'::regclass)::text`),
    productId: text("productId")
      .notNull()
      .references(() => products.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    fromBaseId: text("fromBaseId").references(() => bases.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    toBaseId: text("toBaseId").references(() => bases.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    technicianId: text("technicianId").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    quantity: integer("quantity").notNull(),
    type: text("type").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
  },
  (table: any) => ({
    productIdIdx: index("movements_productId_idx").on(table.productId),
    fromBaseIdIdx: index("movements_fromBaseId_idx").on(table.fromBaseId),
    toBaseIdIdx: index("movements_toBaseId_idx").on(table.toBaseId),
    technicianIdIdx: index("movements_technicianId_idx").on(table.technicianId),
    typeIdx: index("movements_type_idx").on(table.type),
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

export type ProductStockRecord = typeof productStocks.$inferSelect;
export type MovementRecord = typeof movements.$inferSelect;

export type StockSnapshot = {
  productId: string;
  baseId: string;
  quantity: number;
};

export type StockMutationResult = {
  stock: ProductStockRecord;
  movement: MovementRecord;
};

export type StockTransferResult = {
  sourceStock: ProductStockRecord;
  destinationStock: ProductStockRecord;
  movement: MovementRecord;
};

export class StockServiceTransaction {
  constructor(private readonly executor: DbExecutor) {}

  async addStock(productId: string, baseId: string, quantity: number, technicianId?: string): Promise<StockMutationResult> {
    this.assertPositiveQuantity(quantity);

    await this.ensureStockRow(productId, baseId);
    await this.ensureLegacyStockRow(productId, baseId);
    await this.assertCurrentStockIsNonNegative(productId, baseId);

    // 1) validate input 2) update productStocks 3) create movement
    const stock = await this.incrementStock(productId, baseId, quantity);
    await this.incrementLegacyStock(productId, baseId, quantity);
    const movement = await this.createMovement({
      productId,
      fromBaseId: null,
      toBaseId: baseId,
      technicianId,
      quantity,
      type: "ENTRY",
    });

    return { stock, movement };
  }

  async removeStock(productId: string, baseId: string, quantity: number, technicianId?: string): Promise<StockMutationResult> {
    this.assertPositiveQuantity(quantity);

    await this.ensureStockRow(productId, baseId);
    await this.ensureLegacyStockRow(productId, baseId);

    // 1) validate available stock 2) update productStocks 3) create movement
    await this.validateAvailableStock(productId, baseId, quantity);
    const stock = await this.decrementStock(productId, baseId, quantity);
    await this.decrementLegacyStock(productId, baseId, quantity);
    const movement = await this.createMovement({
      productId,
      fromBaseId: baseId,
      toBaseId: null,
      technicianId,
      quantity,
      type: "EXIT",
    });

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
    await this.ensureLegacyStockRow(productId, fromBaseId);
    await this.ensureLegacyStockRow(productId, toBaseId);
    await this.assertCurrentStockIsNonNegative(productId, toBaseId);

    // 1) validate available stock 2) update productStocks 3) create movement
    await this.validateAvailableStock(productId, fromBaseId, quantity);
    const sourceStock = await this.decrementStock(productId, fromBaseId, quantity);
    const destinationStock = await this.incrementStock(productId, toBaseId, quantity);
    await this.decrementLegacyStock(productId, fromBaseId, quantity);
    await this.incrementLegacyStock(productId, toBaseId, quantity);
    const movement = await this.createMovement({
      productId,
      fromBaseId,
      toBaseId,
      technicianId,
      quantity,
      type: "TRANSFER",
    });

    return {
      sourceStock,
      destinationStock,
      movement,
    };
  }

  async getStock(productId: string, baseId: string): Promise<StockSnapshot> {
    const [stock] = await this.executor
      .select({
        productId: productStocks.productId,
        baseId: productStocks.baseId,
        quantity: productStocks.quantity,
      })
      .from(productStocks)
      .where(and(eq(productStocks.productId, productId), eq(productStocks.baseId, baseId)))
      .limit(1);

    return (
      stock ?? {
        productId,
        baseId,
        quantity: 0,
      }
    );
  }

  private assertPositiveQuantity(quantity: number) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Quantidade deve ser maior que zero",
      });
    }
  }

  private async ensureStockRow(productId: string, baseId: string): Promise<void> {
    const now = new Date();

    await this.executor
      .insert(productStocks)
      .values({
        productId,
        baseId,
        quantity: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [productStocks.productId, productStocks.baseId],
      });
  }

  private async ensureLegacyStockRow(productId: string, baseId: string): Promise<void> {
    const now = new Date();
    const companyId = await this.resolveCompanyIdForBase(baseId);

    await this.executor
      .insert(legacyStocks)
      .values({
        companyId,
        productId,
        baseId,
        quantity: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [legacyStocks.productId, legacyStocks.baseId],
      });
  }

  private async incrementStock(productId: string, baseId: string, quantity: number) {
    const now = new Date();
    const [stock] = await this.executor
      .update(productStocks)
      .set({
        quantity: sql`${productStocks.quantity} + ${quantity}`,
        updatedAt: now,
      })
      .where(and(eq(productStocks.productId, productId), eq(productStocks.baseId, baseId)))
      .returning();

    this.assertResultingQuantityIsNonNegative(stock?.quantity);

    return stock;
  }

  private async incrementLegacyStock(productId: string, baseId: string, quantity: number): Promise<void> {
    const now = new Date();

    await this.executor
      .update(legacyStocks)
      .set({
        quantity: sql`${legacyStocks.quantity} + ${quantity}`,
        updatedAt: now,
      })
      .where(and(eq(legacyStocks.productId, productId), eq(legacyStocks.baseId, baseId)));
  }

  private async decrementStock(productId: string, baseId: string, quantity: number) {
    const now = new Date();
    const [stock] = await this.executor
      .update(productStocks)
      .set({
        quantity: sql`${productStocks.quantity} - ${quantity}`,
        updatedAt: now,
      })
      .where(and(eq(productStocks.productId, productId), eq(productStocks.baseId, baseId), gte(productStocks.quantity, quantity)))
      .returning();

    if (stock) {
      this.assertResultingQuantityIsNonNegative(stock.quantity);
      return stock;
    }

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Estoque insuficiente",
    });
  }

  private async decrementLegacyStock(productId: string, baseId: string, quantity: number): Promise<void> {
    const now = new Date();

    await this.executor
      .update(legacyStocks)
      .set({
        quantity: sql`${legacyStocks.quantity} - ${quantity}`,
        updatedAt: now,
      })
      .where(and(eq(legacyStocks.productId, productId), eq(legacyStocks.baseId, baseId)));
  }

  private async validateAvailableStock(productId: string, baseId: string, quantity: number): Promise<void> {
    const currentStock = await this.getStock(productId, baseId);
    this.assertCurrentQuantityIsNonNegative(currentStock.quantity);

    if (currentStock.quantity < quantity) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Estoque insuficiente",
      });
    }
  }

  private async assertCurrentStockIsNonNegative(productId: string, baseId: string): Promise<void> {
    const currentStock = await this.getStock(productId, baseId);
    this.assertCurrentQuantityIsNonNegative(currentStock.quantity);
  }

  private async resolveCompanyIdForBase(baseId: string): Promise<string> {
    const [base] = await this.executor
      .select({
        companyId: bases.companyId,
      })
      .from(bases)
      .where(eq(bases.id, baseId))
      .limit(1);

    if (!base) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Base informada nao encontrada",
      });
    }

    return base.companyId;
  }

  private assertCurrentQuantityIsNonNegative(quantity: number): void {
    if (quantity < 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Operacao bloqueada: estoque com saldo negativo",
      });
    }
  }

  private assertResultingQuantityIsNonNegative(quantity: number | undefined): void {
    if (quantity === undefined) {
      return;
    }

    if (quantity < 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Operacao bloqueada: saldo de estoque nao pode ficar negativo",
      });
    }
  }

  private async createMovement(input: {
    productId: string;
    fromBaseId: string | null;
    toBaseId: string | null;
    technicianId?: string | null;
    quantity: number;
    type: MovementType;
  }) {
    const now = new Date();
    const [movement] = await this.executor
      .insert(movements)
      .values({
        productId: input.productId,
        fromBaseId: input.fromBaseId,
        toBaseId: input.toBaseId,
        technicianId: input.technicianId ?? null,
        quantity: input.quantity,
        type: input.type,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return movement;
  }
}

export class StockService {
  // Any thrown error inside this callback makes Drizzle rollback the whole transaction.
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

  async transferStock(
    productId: string,
    fromBaseId: string,
    toBaseId: string,
    quantity: number,
    technicianId?: string,
  ): Promise<StockTransferResult> {
    return this.withTransaction((tx) => tx.transferStock(productId, fromBaseId, toBaseId, quantity, technicianId));
  }

  async getStock(productId: string, baseId: string): Promise<StockSnapshot> {
    return this.withTransaction((tx) => tx.getStock(productId, baseId));
  }
}

export const stockService = new StockService();
