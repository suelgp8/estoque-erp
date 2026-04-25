import "dotenv/config";
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./src/config/database-url";

const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;
const migrationsPath = process.env.PRISMA_MIGRATIONS_PATH?.trim() || "prisma/migrations";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: migrationsPath
  },
  datasource: {
    url: resolveDatabaseUrl(),
    shadowDatabaseUrl
  }
});
