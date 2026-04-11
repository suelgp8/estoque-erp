import { Role } from "@prisma/client";
import bcrypt from "bcrypt";
import { env } from "../config/env";
import { CompanyRepository } from "../repositories/company.repository";
import { UserRepository } from "../repositories/user.repository";

const userRepository = new UserRepository();
const companyRepository = new CompanyRepository();

export async function bootstrapAdminUser() {
  const adminUsersCount = await userRepository.countByRole(Role.ADMIN);

  if (adminUsersCount > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash(env.DEFAULT_ADMIN_PASSWORD, env.BCRYPT_SALT_ROUNDS);
  const company = await companyRepository.createDefaultCompany({
    companyName: env.DEFAULT_COMPANY_NAME,
    baseName: env.DEFAULT_BASE_NAME,
    timezone: env.DEFAULT_TIMEZONE
  });

  await userRepository.create({
    name: env.DEFAULT_ADMIN_NAME,
    email: env.DEFAULT_ADMIN_EMAIL.toLowerCase(),
    passwordHash,
    role: Role.ADMIN,
    isFirstLogin: true,
    companyId: company.id
  });

  console.log(`Bootstrap admin created: ${env.DEFAULT_ADMIN_EMAIL.toLowerCase()}`);
}
