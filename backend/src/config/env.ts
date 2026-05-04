import dotenv from "dotenv";
import { z } from "zod";
import { resolveDatabaseUrl } from "./database-url";

dotenv.config();

function emptyStringToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

function parseCsvList(value: string | undefined, fallback: string[]): string[] {
  const items = (value ?? fallback.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return [...new Set(items)];
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

const optionalString = z.preprocess(emptyStringToUndefined, z.string().optional());
const optionalEmail = z.preprocess(emptyStringToUndefined, z.string().email().optional());
const optionalPositiveInt = z.preprocess(emptyStringToUndefined, z.coerce.number().int().positive().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: optionalString,
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().default("postgres"),
  DB_PASSWORD: z.string().default("postgres"),
  DB_NAME: z.string().default("estoque_erp"),
  DB_SCHEMA: z.string().default("public"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(15).default(10),
  DEFAULT_ADMIN_NAME: z.string().default("Admin"),
  DEFAULT_ADMIN_EMAIL: z.string().email().default("admin@estoque.local"),
  DEFAULT_ADMIN_PASSWORD: z.string().min(6).default("admin123"),
  DEFAULT_COMPANY_NAME: z.string().default("Empresa Padrao"),
  DEFAULT_BASE_NAME: z.string().default("Base Principal"),
  DEFAULT_TIMEZONE: z.string().default("America/Sao_Paulo"),
  APP_BASE_URL: z.string().url().default("http://localhost:5173"),
  CORS_ALLOWED_ORIGINS: optionalString,
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  PASSWORD_RECOVERY_DEBUG: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalPositiveInt,
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM: optionalEmail
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

const rawEnv = parsed.data;

export const env = {
  ...rawEnv,
  DATABASE_URL: resolveDatabaseUrl(rawEnv),
  CORS_ALLOWED_ORIGINS: parseCsvList(rawEnv.CORS_ALLOWED_ORIGINS, [
    "http://localhost",
    "http://127.0.0.1",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    rawEnv.APP_BASE_URL
  ]),
  PASSWORD_RECOVERY_DEBUG: parseBoolean(rawEnv.PASSWORD_RECOVERY_DEBUG, false)
};
