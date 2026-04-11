import { Prisma, Role, User } from "@prisma/client";
import { AppError } from "../errors/app-error";
import { CompanyRepository } from "../repositories/company.repository";
import { UserRepository } from "../repositories/user.repository";

type UpdateCompanyInput = {
  name?: string;
  logoDataUrl?: string | null;
};

type CompanyPayload = {
  id: string;
  name: string;
  logoDataUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export class CompanyService {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly userRepository: UserRepository
  ) {}

  async getCompany(adminUserId: string): Promise<CompanyPayload> {
    const admin = await this.requireAdmin(adminUserId);
    const company = await this.companyRepository.findById(admin.companyId);

    if (!company) {
      throw new AppError("Empresa não encontrada", 404);
    }

    return this.serializeCompany(company);
  }

  async updateCompany(adminUserId: string, input: UpdateCompanyInput): Promise<CompanyPayload> {
    const admin = await this.requireAdmin(adminUserId);
    const company = await this.companyRepository.findById(admin.companyId);

    if (!company) {
      throw new AppError("Empresa não encontrada", 404);
    }

    const updateData: Prisma.CompanyUpdateInput = {};

    if (input.name !== undefined) {
      updateData.name = input.name.trim();
    }

    if (input.logoDataUrl !== undefined) {
      updateData.logoDataUrl = input.logoDataUrl;
    }

    const updatedCompany = await this.companyRepository.updateById(admin.companyId, updateData);

    return this.serializeCompany(updatedCompany);
  }

  private async requireAdmin(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new AppError("Unauthorized", 401);
    }

    if (user.role !== Role.ADMIN) {
      throw new AppError("Apenas ADMIN pode realizar esta operação", 403);
    }

    return user;
  }

  private serializeCompany(company: {
    id: string;
    name: string;
    logoDataUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): CompanyPayload {
    return {
      id: company.id,
      name: company.name,
      logoDataUrl: company.logoDataUrl ?? null,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString()
    };
  }
}
