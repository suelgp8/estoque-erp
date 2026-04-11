import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(15).default(10),
  DEFAULT_ADMIN_NAME: z.string().default("Admin"),
  DEFAULT_ADMIN_EMAIL: z.string().email().default("admin@estoque.local"),
  DEFAULT_ADMIN_PASSWORD: z.string().min(6).default("admin123"),
  DEFAULT_COMPANY_NAME: z.string().default("Empresa Padrao"),
  DEFAULT_BASE_NAME: z.string().default("Base Principal"),
  DEFAULT_TIMEZONE: z.string().default("America/Sao_Paulo"),
  APP_BASE_URL: z.string().url().default("http://localhost:8080"),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
