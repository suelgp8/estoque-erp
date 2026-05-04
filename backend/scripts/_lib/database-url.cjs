function encodeDatabasePart(value) {
  return encodeURIComponent(value);
}

function buildDatabaseUrl({ host, port, user, password, database, schema }) {
  return `postgresql://${encodeDatabasePart(user)}:${encodeDatabasePart(password)}@${host}:${port}/${encodeDatabasePart(
    database
  )}?schema=${encodeDatabasePart(schema)}`;
}

function resolveDatabaseName(source = process.env) {
  const explicitUrl = source.DATABASE_URL?.trim();

  if (explicitUrl) {
    return decodeURIComponent(new URL(explicitUrl).pathname.replace(/^\//, "")) || "estoque_erp_dev";
  }

  return source.DB_NAME?.trim() || "estoque_erp_dev";
}

function resolveDatabaseUrl(source = process.env) {
  const explicitUrl = source.DATABASE_URL?.trim();

  if (explicitUrl) {
    return explicitUrl;
  }

  const host = source.DB_HOST?.trim() || "localhost";
  const port = String(source.DB_PORT ?? "5432").trim() || "5432";
  const user = source.DB_USER?.trim() || "postgres";
  const password = source.DB_PASSWORD ?? "postgres";
  const database = resolveDatabaseName(source);
  const schema = source.DB_SCHEMA?.trim() || "public";

  return buildDatabaseUrl({
    host,
    port,
    user,
    password,
    database,
    schema
  });
}

function resolveAdminDatabaseUrl(source = process.env) {
  const explicitUrl = source.DATABASE_URL?.trim();
  const adminDatabase = source.DB_ADMIN_NAME?.trim() || "postgres";

  if (explicitUrl) {
    const url = new URL(explicitUrl);
    url.pathname = `/${encodeURIComponent(adminDatabase)}`;
    return url.toString();
  }

  const host = source.DB_HOST?.trim() || "localhost";
  const port = String(source.DB_PORT ?? "5432").trim() || "5432";
  const user = source.DB_USER?.trim() || "postgres";
  const password = source.DB_PASSWORD ?? "postgres";
  const schema = source.DB_SCHEMA?.trim() || "public";

  return buildDatabaseUrl({
    host,
    port,
    user,
    password,
    database: adminDatabase,
    schema
  });
}

module.exports = {
  resolveAdminDatabaseUrl,
  resolveDatabaseName,
  resolveDatabaseUrl
};
