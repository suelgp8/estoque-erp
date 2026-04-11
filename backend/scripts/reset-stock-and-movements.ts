import { Client } from "pg";
import { env } from "../src/config/env";

type ResetStats = {
  legacyMovementItems: number;
  legacyMovements: number;
  newMovements: number;
  legacyStocksRows: number;
  legacyStocksTotalQuantity: number;
  newStocksRows: number;
  newStocksTotalQuantity: number;
};

const knownTargets = [
  '"StockMovementItem"',
  '"StockMovement"',
  '"movements"',
  '"Stock"',
  '"productStocks"',
] as const;

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

async function readStats(client: Client): Promise<ResetStats> {
  const legacyMovementItems = await readTableCount(client, '"StockMovementItem"');
  const legacyMovements = await readTableCount(client, '"StockMovement"');
  const newMovements = await readTableCount(client, '"movements"');
  const legacyStocks = await readTableCountAndTotal(client, '"Stock"');
  const newStocks = await readTableCountAndTotal(client, '"productStocks"');

  return {
    legacyMovementItems: legacyMovementItems.count,
    legacyMovements: legacyMovements.count,
    newMovements: newMovements.count,
    legacyStocksRows: legacyStocks.count,
    legacyStocksTotalQuantity: legacyStocks.total,
    newStocksRows: newStocks.count,
    newStocksTotalQuantity: newStocks.total,
  };
}

async function tableExists(client: Client, relationName: string): Promise<boolean> {
  const result = await client.query<{ relation: string | null }>("SELECT to_regclass($1) AS relation", [relationName]);
  return result.rows[0]?.relation !== null;
}

async function readTableCount(client: Client, relationName: string): Promise<{ count: number }> {
  if (!(await tableExists(client, relationName))) {
    return { count: 0 };
  }

  const result = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${relationName}`);

  return {
    count: Number(result.rows[0]?.count ?? 0),
  };
}

async function readTableCountAndTotal(client: Client, relationName: string): Promise<{ count: number; total: number }> {
  if (!(await tableExists(client, relationName))) {
    return { count: 0, total: 0 };
  }

  const result = await client.query<{ count: string; total: string | null }>(
    `SELECT COUNT(*)::text AS count, COALESCE(SUM("quantity"), 0)::text AS total FROM ${relationName}`
  );

  return {
    count: Number(result.rows[0]?.count ?? 0),
    total: Number(result.rows[0]?.total ?? 0),
  };
}

function printStats(title: string, stats: ResetStats): void {
  console.log(`\n${title}`);
  console.log(`- StockMovementItem: ${stats.legacyMovementItems}`);
  console.log(`- StockMovement: ${stats.legacyMovements}`);
  console.log(`- movements: ${stats.newMovements}`);
  console.log(`- Stock: ${stats.legacyStocksRows} linhas / saldo total ${stats.legacyStocksTotalQuantity}`);
  console.log(`- productStocks: ${stats.newStocksRows} linhas / saldo total ${stats.newStocksTotalQuantity}`);
}

async function main() {
  if (process.env.RESET_INVENTORY_CONFIRM !== "YES") {
    throw new Error("Operacao bloqueada. Defina RESET_INVENTORY_CONFIRM=YES para executar o reset.");
  }

  if (env.NODE_ENV !== "development" && process.env.FORCE_RESET_INVENTORY !== "true") {
    throw new Error("Operacao bloqueada fora de development. Use FORCE_RESET_INVENTORY=true apenas se souber o impacto.");
  }

  const client = new Client({
    connectionString: env.DATABASE_URL,
  });

  const backupLabel = createTimestampLabel();

  await client.connect();

  try {
    const before = await readStats(client);
    printStats("Estado antes do reset", before);

    const existingTargets: string[] = [];

    for (const target of knownTargets) {
      if (await tableExists(client, target)) {
        existingTargets.push(target);
      }
    }

    if (existingTargets.length === 0) {
      throw new Error("Nenhuma tabela alvo foi encontrada no banco. Nada para resetar.");
    }

    const backupNames = existingTargets.map((target) => {
      const normalized = target.replaceAll('"', "").replaceAll(/[^A-Za-z0-9_]/g, "_");
      return {
        source: target,
        backup: `dev_backup_${backupLabel}__${normalized}`,
      };
    });

    await client.query("BEGIN");
    await client.query(`LOCK TABLE ${existingTargets.join(", ")} IN ACCESS EXCLUSIVE MODE`);

    if (existingTargets.includes('"productStocks"')) {
      await client.query(`SELECT set_config('app.stock_service_write', 'on', true)`);
    }

    for (const backup of backupNames) {
      await client.query(`CREATE TABLE ${quoteIdentifier(backup.backup)} AS TABLE ${backup.source} WITH DATA`);
      console.log(`Backup criado: ${backup.backup}`);
    }

    const deletedLegacyItems = existingTargets.includes('"StockMovementItem"')
      ? await client.query('DELETE FROM "StockMovementItem"')
      : { rowCount: 0 };
    const deletedLegacyMovements = existingTargets.includes('"StockMovement"')
      ? await client.query('DELETE FROM "StockMovement"')
      : { rowCount: 0 };
    const deletedNewMovements = existingTargets.includes('"movements"')
      ? await client.query('DELETE FROM "movements"')
      : { rowCount: 0 };
    const resetLegacyStocks = existingTargets.includes('"Stock"')
      ? await client.query(`
          UPDATE "Stock"
          SET "quantity" = 0,
              "updatedAt" = CURRENT_TIMESTAMP
        `)
      : { rowCount: 0 };
    const resetNewStocks = existingTargets.includes('"productStocks"')
      ? await client.query(`
          UPDATE "productStocks"
          SET "quantity" = 0,
              "updatedAt" = CURRENT_TIMESTAMP
        `)
      : { rowCount: 0 };

    await client.query("COMMIT");

    console.log("\nReset concluido com sucesso.");
    console.log(`- StockMovementItem removidos: ${deletedLegacyItems.rowCount ?? 0}`);
    console.log(`- StockMovement removidos: ${deletedLegacyMovements.rowCount ?? 0}`);
    console.log(`- movements removidos: ${deletedNewMovements.rowCount ?? 0}`);
    console.log(`- Stock zerados: ${resetLegacyStocks.rowCount ?? 0}`);
    console.log(`- productStocks zerados: ${resetNewStocks.rowCount ?? 0}`);

    const after = await readStats(client);
    printStats("Estado apos o reset", after);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback failures; original error below is the important one.
    }

    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Falha ao resetar estoque e movimentacoes.", error);
  process.exit(1);
});
