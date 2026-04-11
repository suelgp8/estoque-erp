import { Category, Prisma, Product, User } from "@prisma/client";
import { prisma } from "../lib/prisma";

const userWithBaseAccessInclude = Prisma.validator<Prisma.UserInclude>()({
  company: {
    select: {
      name: true,
      logoDataUrl: true
    }
  },
  baseAccesses: {
    select: {
      baseId: true
    }
  }
});

export type UserWithBaseAccess = Prisma.UserGetPayload<{
  include: typeof userWithBaseAccessInclude;
}>;

const categoryWithBaseAccessInclude = Prisma.validator<Prisma.CategoryInclude>()({
  baseAccesses: {
    include: {
      base: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  }
});

export type CategoryWithBaseAccess = Prisma.CategoryGetPayload<{
  include: typeof categoryWithBaseAccessInclude;
}>;

const productInclude = Prisma.validator<Prisma.ProductInclude>()({
  category: {
    select: {
      id: true,
      name: true
    }
  },
  baseAccesses: {
    include: {
      base: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  },
  stocks: {
    select: {
      baseId: true,
      quantity: true
    }
  },
  _count: {
    select: {
      stocks: true,
      movementItems: true
    }
  }
});

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

export class ProductRepository {
  async findUserById(userId: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: {
        id: userId
      }
    });
  }

  async findUserWithBaseAccessById(userId: string): Promise<UserWithBaseAccess | null> {
    return prisma.user.findUnique({
      where: {
        id: userId
      },
      include: userWithBaseAccessInclude
    });
  }

  async findBaseByIdAndCompany(baseId: string, companyId: string): Promise<{ id: string; name: string } | null> {
    return prisma.base.findFirst({
      where: {
        id: baseId,
        companyId
      },
      select: {
        id: true,
        name: true
      }
    });
  }

  async countBasesByIds(companyId: string, baseIds: string[]): Promise<number> {
    if (baseIds.length === 0) {
      return 0;
    }

    return prisma.base.count({
      where: {
        companyId,
        id: {
          in: baseIds
        }
      }
    });
  }

  async listByCompany(companyId: string): Promise<ProductWithRelations[]> {
    return prisma.product.findMany({
      where: {
        companyId
      },
      include: productInclude,
      orderBy: [
        {
          name: "asc"
        }
      ]
    });
  }

  async listByCompanyAndAllowedBaseIds(companyId: string, allowedBaseIds: string[]): Promise<ProductWithRelations[]> {
    if (allowedBaseIds.length === 0) {
      return [];
    }

    return prisma.product.findMany({
      where: {
        companyId,
        baseAccesses: {
          some: {
            baseId: {
              in: allowedBaseIds
            }
          }
        }
      },
      include: productInclude,
      orderBy: [
        {
          name: "asc"
        }
      ]
    });
  }

  async findByIdAndCompany(productId: string, companyId: string): Promise<ProductWithRelations | null> {
    return prisma.product.findFirst({
      where: {
        id: productId,
        companyId
      },
      include: productInclude
    });
  }

  async findBySku(companyId: string, sku: string): Promise<Product | null> {
    return prisma.product.findFirst({
      where: {
        companyId,
        sku: {
          equals: sku,
          mode: "insensitive"
        }
      }
    });
  }

  async getNextNumericSku(): Promise<string> {
    const rows = await prisma.$queryRaw<Array<{ sku: string }>>`
      SELECT LPAD(nextval('app_sku_seq')::text, 8, '0') AS sku
    `;

    const sku = rows[0]?.sku;

    if (!sku) {
      throw new Error("Nao foi possivel gerar o proximo SKU numerico");
    }

    return sku;
  }

  async findCategoryByIdAndCompany(categoryId: string, companyId: string): Promise<Category | null> {
    return prisma.category.findFirst({
      where: {
        id: categoryId,
        companyId
      }
    });
  }

  async findCategoryByIdAndCompanyWithBaseAccess(categoryId: string, companyId: string): Promise<CategoryWithBaseAccess | null> {
    return prisma.category.findFirst({
      where: {
        id: categoryId,
        companyId
      },
      include: categoryWithBaseAccessInclude
    });
  }

  async create(data: Prisma.ProductCreateInput): Promise<ProductWithRelations> {
    return prisma.product.create({
      data,
      include: productInclude
    });
  }

  async updateById(productId: string, data: Prisma.ProductUpdateInput): Promise<ProductWithRelations> {
    return prisma.product.update({
      where: {
        id: productId
      },
      data,
      include: productInclude
    });
  }

  async countStockWithPositiveQuantity(productId: string): Promise<number> {
    return prisma.stock.count({
      where: {
        productId,
        quantity: {
          gt: 0
        }
      }
    });
  }

  async countStockWithPositiveQuantityOutsideAllowedBases(productId: string, allowedBaseIds: string[]): Promise<number> {
    return prisma.stock.count({
      where: {
        productId,
        quantity: {
          gt: 0
        },
        baseId: {
          notIn: allowedBaseIds
        }
      }
    });
  }

  async countMovementItems(productId: string): Promise<number> {
    return prisma.stockMovementItem.count({
      where: {
        productId
      }
    });
  }

  async deleteById(productId: string): Promise<Product> {
    return prisma.product.delete({
      where: {
        id: productId
      }
    });
  }
}
