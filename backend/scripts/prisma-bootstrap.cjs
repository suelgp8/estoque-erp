const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { Client } = require("pg");
const { resolveAdminDatabaseUrl, resolveDatabaseName, resolveDatabaseUrl } = require("./_lib/database-url.cjs");

const backendRoot = path.resolve(__dirname, "..");
const prismaSchemaPath = path.join("prisma", "schema.prisma");

function quoteArg(value) {
  return value.includes(" ") ? `"${value}"` : value;
}

function quoteIdentifier(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

function runPrisma(args) {
  const command = `npx prisma ${[...args, "--schema", prismaSchemaPath].map(quoteArg).join(" ")}`;
  const result = spawnSync(command, {
    cwd: backendRoot,
    stdio: "inherit",
    env: process.env,
    shell: true
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveBootstrapMode() {
  const explicitMode = process.env.PRISMA_BOOTSTRAP_MODE?.trim().toLowerCase();

  if (explicitMode) {
    return explicitMode;
  }

  return "migrate";
}

function getBaselineMigrationName() {
  const migrationsDir = path.resolve(backendRoot, "prisma", "migrations");
  const entries = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return entries[0];
}

async function inspectDatabase() {
  const client = new Client({ connectionString: resolveDatabaseUrl() });
  const schema = process.env.DB_SCHEMA?.trim() || "public";

  await client.connect();

  try {
    const migrationsTableResult = await client.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = $1
            AND table_name = '_prisma_migrations'
        ) AS "exists"
      `,
      [schema]
    );

    const userTablesResult = await client.query(
      `
        SELECT COUNT(*)::int AS "count"
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
          AND table_name <> '_prisma_migrations'
      `,
      [schema]
    );

    let failedMigrationNames = [];

    if (Boolean(migrationsTableResult.rows[0]?.exists)) {
      const failedMigrationsResult = await client.query(
        `
          SELECT migration_name
          FROM "_prisma_migrations"
          WHERE finished_at IS NULL
            AND rolled_back_at IS NULL
        `
      );

      failedMigrationNames = failedMigrationsResult.rows.map((row) => row.migration_name);
    }

    return {
      hasMigrationsTable: Boolean(migrationsTableResult.rows[0]?.exists),
      userTableCount: Number(userTablesResult.rows[0]?.count ?? 0),
      failedMigrationNames
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function recreateDatabase() {
  const targetDatabase = resolveDatabaseName();
  const client = new Client({ connectionString: resolveAdminDatabaseUrl() });

  await client.connect();

  try {
    await client.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
      `,
      [targetDatabase]
    );
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(targetDatabase)}`);
    await client.query(`CREATE DATABASE ${quoteIdentifier(targetDatabase)}`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function bootstrapWithMigrations() {
  const databaseState = await inspectDatabase();

  if (databaseState.failedMigrationNames.length > 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Existem migrations com falha no banco alvo: ${databaseState.failedMigrationNames.join(", ")}. Corrija antes de subir em producao.`
      );
    }

    console.log(
      `Migration com falha detectada (${databaseState.failedMigrationNames.join(
        ", "
      )}). Recriando o banco local para reaplicar a baseline.`
    );
    await recreateDatabase();
  }

  if (!databaseState.hasMigrationsTable && databaseState.userTableCount > 0) {
    const baselineMigration = getBaselineMigrationName();

    if (!baselineMigration) {
      throw new Error("Nenhuma migration encontrada em prisma/migrations.");
    }

    console.log(`Schema existente sem _prisma_migrations. Marcando baseline ${baselineMigration} como aplicada.`);
    runPrisma(["migrate", "resolve", "--applied", baselineMigration]);
  }

  runPrisma(["migrate", "deploy"]);
}

async function main() {
  const mode = resolveBootstrapMode();

  console.log(`Prisma bootstrap mode: ${mode}`);
  runPrisma(["generate"]);

  if (mode === "skip") {
    return;
  }

  if (mode === "push") {
    runPrisma(["db", "push"]);
    return;
  }

  if (mode === "migrate") {
    await bootstrapWithMigrations();
    return;
  }

  throw new Error(`PRISMA_BOOTSTRAP_MODE invalido: ${mode}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
