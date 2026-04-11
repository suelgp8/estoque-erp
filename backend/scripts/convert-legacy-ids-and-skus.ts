import { Client } from "pg";
import { env } from "../src/config/env";

type TableConfig = {
  tableName: string;
  orderBy?: string;
};

type IdStats = {
  tableName: string;
  oldIds: number;
};

type SkuStats = {
  oldSkus: number;
};

type Mapping = {
  oldValue: string;
  newValue: string;
};

const idTableConfigs: TableConfig[] = [
  { tableName: '"Company"', orderBy: '"createdAt", "id"' },
  { tableName: '"User"', orderBy: '"createdAt", "id"' },
  { tableName: '"Base"', orderBy: '"createdAt", "id"' },
  { tableName: '"SystemConfig"', orderBy: '"createdAt", "id"' },
  { tableName: '"Category"', orderBy: '"createdAt", "id"' },
  { tableName: '"Product"', orderBy: '"createdAt", "id"' },
  { tableName: '"CategoryBaseAccess"', orderBy: '"createdAt", "id"' },
  { tableName: '"ProductBaseAccess"', orderBy: '"createdAt", "id"' },
  { tableName: '"Stock"', orderBy: '"createdAt", "id"' },
  { tableName: '"StockMovement"', orderBy: '"createdAt", "id"' },
  { tableName: '"StockMovementItem"', orderBy: '"createdAt", "id"' },
  { tableName: '"Log"', orderBy: '"createdAt", "id"' },
  { tableName: '"PasswordResetToken"', orderBy: '"createdAt", "id"' },
  { tableName: '"UserBaseAccess"', orderBy: '"createdAt", "id"' },
  { tableName: '"productStocks"', orderBy: '"createdAt", "id"' },
  { tableName: '"movements"', orderBy: '"createdAt", "id"' },
];

const logEntityTypesByTable = new Map<string, string>([
  ['"Company"', "Company"],
  ['"User"', "User"],
  ['"Base"', "Base"],
  ['"SystemConfig"', "SystemConfig"],
  ['"Category"', "Category"],
  ['"Product"', "Product"],
  ['"Stock"', "Stock"],
  ['"StockMovement"', "StockMovement"],
  ['"PasswordResetToken"', "PasswordResetToken"],
  ['"UserBaseAccess"', "UserBaseAccess"],
  ['"CategoryBaseAccess"', "CategoryBaseAccess"],
  ['"ProductBaseAccess"', "ProductBaseAccess"],
  ['"productStocks"', "productStocks"],
  ['"movements"', "movements"],
]);

const numericIdPattern = "^\\d{1,12}$";
const numericSkuPattern = "^\\d{8}$";

function createTimestampLabel(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function normalizeTableName(tableName: string): string {
  return tableName.replaceAll('"', "");
}

async function tableExists(client: Client, relationName: string): Promise<boolean> {
  const result = await client.query<{ relation: string | null }>("SELECT to_regclass($1) AS relation", [relationName]);
  return result.rows[0]?.relation !== null;
}

async function getExistingTableConfigs(client: Client): Promise<TableConfig[]> {
  const existing: TableConfig[] = [];

  for (const config of idTableConfigs) {
    if (await tableExists(client, config.tableName)) {
      existing.push(config);
    }
  }

  return existing;
}

async function readIdStats(client: Client, tables: TableConfig[]): Promise<IdStats[]> {
  const stats: IdStats[] = [];

  for (const table of tables) {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${table.tableName} WHERE "id" !~ $1`,
      [numericIdPattern]
    );

    stats.push({
      tableName: normalizeTableName(table.tableName),
      oldIds: Number(result.rows[0]?.count ?? 0),
    });
  }

  return stats;
}

async function readSkuStats(client: Client): Promise<SkuStats> {
  if (!(await tableExists(client, '"Product"'))) {
    return { oldSkus: 0 };
  }

  const result = await client.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM "Product" WHERE "sku" !~ $1',
    [numericSkuPattern]
  );

  return {
    oldSkus: Number(result.rows[0]?.count ?? 0),
  };
}

function printStats(title: string, idStats: IdStats[], skuStats: SkuStats): void {
  console.log(`\n${title}`);

  for (const stat of idStats) {
    console.log(`- ${stat.tableName}: ${stat.oldIds} id(s) legado(s)`);
  }

  console.log(`- Product.sku: ${skuStats.oldSkus} sku(s) legado(s)`);
}

async function nextNumericId(client: Client): Promise<string> {
  const result = await client.query<{ value: string }>(
    `SELECT nextval('app_numeric_id_seq'::regclass)::text AS value`
  );

  const value = result.rows[0]?.value;

  if (!value) {
    throw new Error("Nao foi possivel gerar o proximo ID numerico");
  }

  return value;
}

async function nextNumericSku(client: Client): Promise<string> {
  const result = await client.query<{ value: string }>(
    `SELECT lpad(nextval('app_sku_seq'::regclass)::text, 8, '0') AS value`
  );

  const value = result.rows[0]?.value;

  if (!value) {
    throw new Error("Nao foi possivel gerar o proximo SKU numerico");
  }

  return value;
}

async function buildIdMappings(client: Client, table: TableConfig): Promise<Mapping[]> {
  const orderByClause = table.orderBy ? ` ORDER BY ${table.orderBy}` : "";
  const rows = await client.query<{ id: string }>(
    `SELECT "id" FROM ${table.tableName} WHERE "id" !~ $1${orderByClause}`,
    [numericIdPattern]
  );

  const mappings: Mapping[] = [];

  for (const row of rows.rows) {
    mappings.push({
      oldValue: row.id,
      newValue: await nextNumericId(client),
    });
  }

  return mappings;
}

async function applyIdMappings(client: Client, table: TableConfig, mappings: Mapping[]): Promise<number> {
  for (const mapping of mappings) {
    await client.query(
      `UPDATE ${table.tableName} SET "id" = $1 WHERE "id" = $2`,
      [mapping.newValue, mapping.oldValue]
    );
  }

  return mappings.length;
}

async function updateLogEntityIds(client: Client, entityType: string, mappings: Mapping[]): Promise<number> {
  let updated = 0;

  for (const mapping of mappings) {
    const result = await client.query(
      `UPDATE "Log" SET "entityId" = $1 WHERE "entityType" = $2 AND "entityId" = $3`,
      [mapping.newValue, entityType, mapping.oldValue]
    );
    updated += result.rowCount ?? 0;
  }

  return updated;
}

async function convertLegacySkus(client: Client): Promise<number> {
  if (!(await tableExists(client, '"Product"'))) {
    return 0;
  }

  const rows = await client.query<{ id: string; sku: string }>(
    'SELECT "id", "sku" FROM "Product" WHERE "sku" !~ $1 ORDER BY "createdAt", "id"',
    [numericSkuPattern]
  );

  let updated = 0;

  for (const row of rows.rows) {
    const newSku = await nextNumericSku(client);
    const result = await client.query(
      'UPDATE "Product" SET "sku" = $1 WHERE "id" = $2',
      [newSku, row.id]
    );
    updated += result.rowCount ?? 0;
  }

  return updated;
}

async function syncSequencesToMax(client: Client): Promise<void> {
  await client.query(`
    DO $$
    DECLARE
      max_numeric_id BIGINT := 100000;
      max_numeric_sku BIGINT := 10000000;
      current_max BIGINT;
    BEGIN
      IF to_regclass('"Company"') IS NOT NULL THEN
        SELECT GREATEST(max_numeric_id, COALESCE(MAX("id"::bigint), 100000))
          INTO max_numeric_id
        FROM "Company"
        WHERE "id" ~ '^\\d+$';
      END IF;

      IF to_regclass('"User"') IS NOT NULL THEN
        SELECT GREATEST(max_numeric_id, COALESCE(MAX("id"::bigint), 100000))
          INTO max_numeric_id
        FROM "User"
        WHERE "id" ~ '^\\d+$';
      END IF;

      IF to_regclass('"Base"') IS NOT NULL THEN
        SELECT GREATEST(max_numeric_id, COALESCE(MAX("id"::bigint), 100000))
          INTO max_numeric_id
        FROM "Base"
        WHERE "id" ~ '^\\d+$';
      END IF;

      IF to_regclass('"SystemConfig"') IS NOT NULL THEN
        SELECT GREATEST(max_numeric_id, COALESCE(MAX("id"::bigint), 100000))
          INTO max_numeric_id
        FROM "SystemConfig"
        WHERE "id" ~ '^\\d+$';
      END IF;

      IF to_regclass('"Category"') IS NOT NULL THEN
        SELECT GREATEST(max_numeric_id, COALESCE(MAX("id"::bigint), 100000))
          INTO max_numeric_id
        FROM "Category"
        WHERE "id" ~ '^\\d+$';
      END IF;

      IF to_regclass('"Product"') IS NOT NULL THEN
        SELECT GREATEST(max_numeric_id, COALESCE(MAX("id"::bigint), 100000))
          INTO max_numeric_id
        FROM "Product"
        WHERE "id" ~ '^\\d+$';

        SELECT GREATEST(max_numeric_sku, COALESCE(MAX("sku"::bigint), 10000000))
          INTO max_numeric_sku
        FROM "Product"
        WHERE "sku" ~ '^\\d+$';
      END IF;

      IF to_regclass('"CategoryBaseAccess"') IS NOT NULL THEN
        SELECT GREATEST(max_numeric_id, COALESCE(MAX("id"::bigint), 100000))
          INTO max_numeric_id
        FROM "CategoryBaseAccess"
        WHERE "id" ~ '^\\d+$';
      END IF;

      IF to_regclass('"ProductBaseAccess"') IS NOT NULL THEN
        SELECT GREATEST(max_numeric_id, COALESCE(MAX("id"::bigint), 100000))
          INTO max_numeric_id
        FROM "ProductBaseAccess"
        WHERE "id" ~ '^\\d+$';
      END IF;

      IF to_regclass('"Stock"') IS NOT NULL THEN
        SELECT GREATEST(max_numeric_id, COALESCE(MAX("id"::bigint), 100000))
          INTO max_numeric_id
        FROM "Stock"
        WHERE "id" ~ '^\\d+$';
      END IF;

      IF to_regclass('"StockMovement"') IS NOT NULL THEN
        SELECT GREATEST(max_numeric_id, COALESCE(MAX("id"::bigint), 100000))
          INTO max_numeric_id
        FROM "StockMovement"
        WHERE "id" ~ '^\\d+$';
      END IF;

      IF to_regclass('"StockMovementItem"') IS NOT NULL THEN
        SELECT GREATEST(max_numeric_id, COALESCE(MAX("id"::bigint), 100000))
          INTO max_numeric_id
        FROM "StockMovementItem"
        WHERE "id" ~ '^\\d+$';
      END IF;

      IF to_regclass('"Log"') IS NOT NULL THEN
        SELECT GREATEST(max_numeric_id, COALESCE(MAX("id"::bigint), 100000))
          INTO max_numeric_id
        FROM "Log"
        WHERE "id" ~ '^\\d+$';
      END IF;

      IF to_regclass('"PasswordResetToken"') IS NOT NULL THEN
        SELECT GREATEST(max_numeric_id, COALESCE(MAX("id"::bigint), 100000))
          INTO max_numeric_id
        FROM "PasswordResetToken"
        WHERE "id" ~ '^\\d+$';
      END IF;

      IF to_regclass('"UserBaseAccess"') IS NOT NULL THEN
        SELECT GREATEST(max_numeric_id, COALESCE(MAX("id"::bigint), 100000))
          INTO max_numeric_id
        FROM "UserBaseAccess"
        WHERE "id" ~ '^\\d+$';
      END IF;

      IF to_regclass('"productStocks"') IS NOT NULL THEN
        EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "productStocks" WHERE "id" ~ ''^\\d+$'''
          INTO current_max
          USING max_numeric_id;
        max_numeric_id := current_max;
      END IF;

      IF to_regclass('"movements"') IS NOT NULL THEN
        EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "movements" WHERE "id" ~ ''^\\d+$'''
          INTO current_max
          USING max_numeric_id;
        max_numeric_id := current_max;
      END IF;

      PERFORM setval('app_numeric_id_seq', max_numeric_id, true);
      PERFORM setval('app_sku_seq', max_numeric_sku, true);
    END $$;
  `);
}

async function main() {
  if (process.env.CONVERT_LEGACY_IDS_CONFIRM !== "YES") {
    throw new Error("Operacao bloqueada. Defina CONVERT_LEGACY_IDS_CONFIRM=YES para executar a conversao.");
  }

  if (env.NODE_ENV !== "development" && process.env.FORCE_CONVERT_LEGACY_IDS !== "true") {
    throw new Error("Operacao bloqueada fora de development. Use FORCE_CONVERT_LEGACY_IDS=true apenas se souber o impacto.");
  }

  const client = new Client({
    connectionString: env.DATABASE_URL,
  });

  await client.connect();

  const backupLabel = createTimestampLabel();

  try {
    const existingTables = await getExistingTableConfigs(client);

    if (existingTables.length === 0) {
      throw new Error("Nenhuma tabela encontrada para conversao.");
    }

    const idStatsBefore = await readIdStats(client, existingTables);
    const skuStatsBefore = await readSkuStats(client);
    printStats("Estado antes da conversao", idStatsBefore, skuStatsBefore);

    await client.query("BEGIN");
    await client.query(`LOCK TABLE ${existingTables.map((table) => table.tableName).join(", ")} IN ACCESS EXCLUSIVE MODE`);
    await client.query(`SELECT set_config('app.stock_service_write', 'on', true)`);

    for (const table of existingTables) {
      const backupTableName = `dev_backup_${backupLabel}__${normalizeTableName(table.tableName)}`;
      await client.query(`CREATE TABLE ${quoteIdentifier(backupTableName)} AS TABLE ${table.tableName} WITH DATA`);
      console.log(`Backup criado: ${backupTableName}`);
    }

    let convertedIds = 0;
    let updatedLogEntityIds = 0;

    for (const table of existingTables) {
      const mappings = await buildIdMappings(client, table);

      if (mappings.length === 0) {
        continue;
      }

      convertedIds += await applyIdMappings(client, table, mappings);

      const entityType = logEntityTypesByTable.get(table.tableName);

      if (entityType && (await tableExists(client, '"Log"'))) {
        updatedLogEntityIds += await updateLogEntityIds(client, entityType, mappings);
      }
    }

    const convertedSkus = await convertLegacySkus(client);
    await syncSequencesToMax(client);
    await client.query("COMMIT");

    console.log("\nConversao concluida com sucesso.");
    console.log(`- IDs convertidos: ${convertedIds}`);
    console.log(`- Log.entityId atualizados: ${updatedLogEntityIds}`);
    console.log(`- SKUs convertidos: ${convertedSkus}`);

    const idStatsAfter = await readIdStats(client, existingTables);
    const skuStatsAfter = await readSkuStats(client);
    printStats("Estado apos a conversao", idStatsAfter, skuStatsAfter);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback failure and surface original error instead.
    }

    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Falha ao converter IDs e SKUs legados.", error);
  process.exit(1);
});
