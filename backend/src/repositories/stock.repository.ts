import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const stockWithRelationsInclude = Prisma.validator<Prisma.StockInclude>()({
  base: {
    select: {
      id: true,
      name: true
    }
  },
  product: {
    select: {
      id: true,
      name: true,
      sku: true,
      companyId: true
    }
  }
});

export type StockWithRelations = Prisma.StockGetPayload<{
  include: typeof stockWithRelationsInclude;
}>;

export class StockRepository {
  async findByProductAndBase(productId: string, baseId: string): Promise<StockWithRelations | null> {
    return prisma.stock.findUnique({
      where: {
        productId_baseId: {
          productId,
          baseId
        }
      },
      include: stockWithRelationsInclude
    });
  }

  async upsertConfiguration(input: {
    companyId: string;
    productId: string;
    baseId: string;
    minimumQuantity: number;
    idealQuantity: number;
  }): Promise<StockWithRelations> {
    return prisma.stock.upsert({
      where: {
        productId_baseId: {
          productId: input.productId,
          baseId: input.baseId
        }
      },
      create: {
        companyId: input.companyId,
        productId: input.productId,
        baseId: input.baseId,
        quantity: 0,
        minimumQuantity: input.minimumQuantity,
        idealQuantity: input.idealQuantity
      },
      update: {
        minimumQuantity: input.minimumQuantity,
        idealQuantity: input.idealQuantity
      },
      include: stockWithRelationsInclude
    });
  }
}
