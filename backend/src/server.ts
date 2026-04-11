import { bootstrapAdminUser } from "./bootstrap/bootstrap-admin";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { app } from "./app";

async function startServer() {
  await bootstrapAdminUser();

  app.listen(env.PORT, () => {
    console.log(`Backend running on port ${env.PORT}`);
  });
}

startServer().catch(async (error) => {
  console.error("Failed to start backend", error);
  await prisma.$disconnect();
  process.exit(1);
});
