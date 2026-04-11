import { Company, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type CreateCompanyInput = {
  companyName: string;
  baseName: string;
  timezone: string;
};

export class CompanyRepository {
  async findById(companyId: string): Promise<Company | null> {
    return prisma.company.findUnique({
      where: {
        id: companyId
      }
    });
  }

  async createDefaultCompany(data: CreateCompanyInput): Promise<Company> {
    return prisma.company.create({
      data: {
        name: data.companyName,
        bases: {
          create: [{
            name: data.baseName
          }]
        },
        systemConfig: {
          create: {
            timezone: data.timezone
          }
        }
      }
    });
  }

  async updateById(companyId: string, data: Prisma.CompanyUpdateInput): Promise<Company> {
    return prisma.company.update({
      where: {
        id: companyId
      },
      data
    });
  }
}
