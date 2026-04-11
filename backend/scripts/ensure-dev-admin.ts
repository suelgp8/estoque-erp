import bcrypt from "bcrypt";
import { Role } from "@prisma/client";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";

function getDevAdminConfig() {
  return {
    name: process.env.DEV_ADMIN_NAME?.trim() || env.DEFAULT_ADMIN_NAME,
    email: process.env.DEV_ADMIN_EMAIL?.trim().toLowerCase() || env.DEFAULT_ADMIN_EMAIL.toLowerCase(),
    password: process.env.DEV_ADMIN_PASSWORD?.trim() || env.DEFAULT_ADMIN_PASSWORD
  };
}

async function ensureDefaultCompany() {
  const existingCompany = await prisma.company.findFirst({
    orderBy: {
      createdAt: "asc"
    },
    include: {
      bases: {
        orderBy: {
          createdAt: "asc"
        }
      },
      systemConfig: true
    }
  });

  if (existingCompany) {
    return existingCompany;
  }

  return prisma.company.create({
    data: {
      name: env.DEFAULT_COMPANY_NAME,
      bases: {
        create: [
          {
            name: env.DEFAULT_BASE_NAME
          }
        ]
      },
      systemConfig: {
        create: {
          timezone: env.DEFAULT_TIMEZONE
        }
      }
    },
    include: {
      bases: true,
      systemConfig: true
    }
  });
}

async function ensureDevAdmin() {
  const config = getDevAdminConfig();
  const company = await ensureDefaultCompany();
  const passwordHash = await bcrypt.hash(config.password, env.BCRYPT_SALT_ROUNDS);

  const existingUser = await prisma.user.findUnique({
    where: {
      email: config.email
    }
  });

  if (existingUser) {
    const user = await prisma.user.update({
      where: {
        id: existingUser.id
      },
      data: {
        name: config.name,
        role: Role.ADMIN,
        passwordHash,
        isFirstLogin: false
      }
    });

    console.log(`Dev admin updated: ${user.email}`);
    console.log(`Login: ${config.email}`);
    console.log(`Password: ${config.password}`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      name: config.name,
      email: config.email,
      passwordHash,
      role: Role.ADMIN,
      isFirstLogin: false,
      companyId: company.id
    }
  });

  console.log(`Dev admin created: ${user.email}`);
  console.log(`Login: ${config.email}`);
  console.log(`Password: ${config.password}`);
}

ensureDevAdmin()
  .catch(async (error) => {
    console.error("Failed to ensure dev admin", error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
