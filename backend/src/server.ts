import { bootstrapAdminUser } from "./bootstrap/bootstrap-admin";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { app } from "./app";

async function startServer() {
  await bootstrapAdminUser();

  app.listen(env.PORT, env.HOST, () => {
    console.log(`Backend running on http://${env.HOST}:${env.PORT}`);
  });
}

startServer().catch(async (error) => {
  console.error("Failed to start backend", error);
  await prisma.$disconnect();
  process.exit(1);
});
