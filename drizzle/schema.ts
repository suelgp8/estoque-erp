import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Minimal table slices so the new stock-by-base table keeps FK definitions
// aligned with the tables that already exist in PostgreSQL.
export const products = pgTable("Product", {
  id: text("id").primaryKey(),
});

export const bases = pgTable("Base", {
  id: text("id").primaryKey(),
});

export const users = pgTable("User", {
  id: text("id").primaryKey(),
});

export const productStocks = pgTable(
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
  (table) => ({
    productIdIdx: index("productStocks_productId_idx").on(table.productId),
    baseIdIdx: index("productStocks_baseId_idx").on(table.baseId),
    productBaseUnique: uniqueIndex("productStocks_productId_baseId_unique").on(table.productId, table.baseId),
    quantityNonNegative: check("productStocks_quantity_non_negative", sql`${table.quantity} >= 0`),
  }),
);

export const movements = pgTable(
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
  (table) => ({
    productIdIdx: index("movements_productId_idx").on(table.productId),
    fromBaseIdIdx: index("movements_fromBaseId_idx").on(table.fromBaseId),
    toBaseIdIdx: index("movements_toBaseId_idx").on(table.toBaseId),
    technicianIdIdx: index("movements_technicianId_idx").on(table.technicianId),
    typeIdx: index("movements_type_idx").on(table.type),
  }),
);

export const productsRelations = relations(products, ({ many }) => ({
  productStocks: many(productStocks),
  movements: many(movements),
}));

export const usersRelations = relations(users, ({ many }) => ({
  movements: many(movements),
}));

export const basesRelations = relations(bases, ({ many }) => ({
  productStocks: many(productStocks),
  sourceMovements: many(movements, {
    relationName: "movementFromBase",
  }),
  destinationMovements: many(movements, {
    relationName: "movementToBase",
  }),
}));

export const productStocksRelations = relations(productStocks, ({ one }) => ({
  product: one(products, {
    fields: [productStocks.productId],
    references: [products.id],
  }),
  base: one(bases, {
    fields: [productStocks.baseId],
    references: [bases.id],
  }),
}));

export const movementsRelations = relations(movements, ({ one }) => ({
  product: one(products, {
    fields: [movements.productId],
    references: [products.id],
  }),
  fromBase: one(bases, {
    relationName: "movementFromBase",
    fields: [movements.fromBaseId],
    references: [bases.id],
  }),
  toBase: one(bases, {
    relationName: "movementToBase",
    fields: [movements.toBaseId],
    references: [bases.id],
  }),
  technician: one(users, {
    fields: [movements.technicianId],
    references: [users.id],
  }),
}));

export type ProductStock = typeof productStocks.$inferSelect;
export type NewProductStock = typeof productStocks.$inferInsert;
export type Movement = typeof movements.$inferSelect;
export type NewMovement = typeof movements.$inferInsert;
