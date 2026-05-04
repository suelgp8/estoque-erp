const { Client } = require("pg");
const { resolveAdminDatabaseUrl } = require("./_lib/database-url.cjs");

const maxAttempts = Number.parseInt(process.env.DB_WAIT_MAX_ATTEMPTS ?? "30", 10);
const retryDelayMs = Number.parseInt(process.env.DB_WAIT_RETRY_DELAY_MS ?? "2000", 10);
const connectionString = resolveAdminDatabaseUrl();

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function canConnect() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (await canConnect()) {
        console.log(`Banco pronto na tentativa ${attempt}/${maxAttempts}.`);
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Aguardando banco (${attempt}/${maxAttempts}): ${message}`);
    }

    if (attempt < maxAttempts) {
      await wait(retryDelayMs);
    }
  }

  throw new Error("Banco nao respondeu dentro do tempo esperado.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
