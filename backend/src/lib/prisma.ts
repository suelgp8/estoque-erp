import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    adapter
  });

if (env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

export { prisma };
