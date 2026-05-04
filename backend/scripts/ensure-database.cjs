const { Client } = require("pg");
const { resolveAdminDatabaseUrl, resolveDatabaseName } = require("./_lib/database-url.cjs");

function quoteIdentifier(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function main() {
  const targetDatabase = resolveDatabaseName();
  const client = new Client({ connectionString: resolveAdminDatabaseUrl() });

  await client.connect();

  try {
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [targetDatabase]);

    if (result.rowCount && result.rowCount > 0) {
      console.log(`Banco ${targetDatabase} ja existe.`);
      return;
    }

    await client.query(`CREATE DATABASE ${quoteIdentifier(targetDatabase)}`);
    console.log(`Banco ${targetDatabase} criado com sucesso.`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
