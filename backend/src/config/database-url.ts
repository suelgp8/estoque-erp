type DatabaseUrlEnv = {
  DATABASE_URL?: string;
  DB_HOST?: string;
  DB_PORT?: string | number;
  DB_USER?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
  DB_SCHEMA?: string;
};

function encodeDatabasePart(value: string): string {
  return encodeURIComponent(value);
}

export function resolveDatabaseUrl(source: DatabaseUrlEnv = process.env): string {
  const explicitUrl = source.DATABASE_URL?.trim();

  if (explicitUrl) {
    return explicitUrl;
  }

  const host = source.DB_HOST?.trim() || "localhost";
  const port = String(source.DB_PORT ?? "5432").trim() || "5432";
  const user = source.DB_USER?.trim() || "postgres";
  const password = source.DB_PASSWORD ?? "postgres";
  const database = source.DB_NAME?.trim() || "estoque_erp";
  const schema = source.DB_SCHEMA?.trim() || "public";

  return `postgresql://${encodeDatabasePart(user)}:${encodeDatabasePart(password)}@${host}:${port}/${encodeDatabasePart(
    database
  )}?schema=${encodeDatabasePart(schema)}`;
}
