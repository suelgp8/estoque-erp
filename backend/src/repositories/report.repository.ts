import { Prisma, StockMovementStatus, StockMovementType, User } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type StockReportFilters = {
  baseId?: string;
  categoryId?: string;
  productId?: string;
  search?: string;
};

export type MovementReportFilters = {
  baseId?: string;
  type?: StockMovementType;
  status?: StockMovementStatus;
  sourceBaseId?: string;
  destinationBaseId?: string;
  productId?: string;
  createdById?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

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

const stockReportInclude = Prisma.validator<Prisma.ProductInclude>()({
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
      quantity: true,
      minimumQuantity: true,
      idealQuantity: true,
      updatedAt: true
    }
  }
});

export type StockReportRecord = Prisma.ProductGetPayload<{
  include: typeof stockReportInclude;
}>;

const movementReportInclude = Prisma.validator<Prisma.StockMovementInclude>()({
  sourceBase: {
    select: {
      id: true,
      name: true
    }
  },
  destinationBase: {
    select: {
      id: true,
      name: true
    }
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  },
  approvedBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  },
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true
        }
      }
    }
  }
});

export type MovementReportRecord = Prisma.StockMovementGetPayload<{
  include: typeof movementReportInclude;
}>;

export class ReportRepository {
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

  async findCategoryByIdAndCompany(categoryId: string, companyId: string): Promise<{ id: string; name: string } | null> {
    return prisma.category.findFirst({
      where: {
        id: categoryId,
        companyId
      },
      select: {
        id: true,
        name: true
      }
    });
  }

  async getStockRecords(
    companyId: string,
    filters: StockReportFilters,
    allowedBaseIds?: string[]
  ): Promise<StockReportRecord[]> {
    if (allowedBaseIds !== undefined && allowedBaseIds.length === 0) {
      return [];
    }

    if (allowedBaseIds !== undefined && filters.baseId && !allowedBaseIds.includes(filters.baseId)) {
      return [];
    }

    const where: Prisma.ProductWhereInput = {
      companyId,
      id: filters.productId,
      categoryId: filters.categoryId,
      ...(filters.search
        ? {
            OR: [
              {
                name: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                sku: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              }
            ]
          }
        : {})
    };

    const baseIdsToMatch = filters.baseId ? [filters.baseId] : allowedBaseIds;

    if (baseIdsToMatch !== undefined) {
      where.baseAccesses = {
        some: {
          baseId: {
            in: baseIdsToMatch
          }
        }
      };
    }

    return prisma.product.findMany({
      where,
      include: stockReportInclude,
      orderBy: [
        {
          name: "asc"
        }
      ]
    });
  }

  async getMovementRecords(
    companyId: string,
    filters: MovementReportFilters,
    allowedBaseIds?: string[]
  ): Promise<MovementReportRecord[]> {
    const andWhere: Prisma.StockMovementWhereInput[] = [
      {
        companyId,
        type: filters.type,
        status: filters.status,
        createdById: filters.createdById,
        createdAt: {
          gte: filters.dateFrom,
          lte: filters.dateTo
        },
        items: filters.productId
          ? {
              some: {
                productId: filters.productId
              }
            }
          : undefined
      }
    ];

    if (filters.sourceBaseId) {
      andWhere.push({
        sourceBaseId: filters.sourceBaseId
      });
    }

    if (filters.destinationBaseId) {
      andWhere.push({
        destinationBaseId: filters.destinationBaseId
      });
    }

    if (filters.baseId) {
      andWhere.push({
        OR: [
          {
            sourceBaseId: filters.baseId
          },
          {
            destinationBaseId: filters.baseId
          }
        ]
      });
    }

    if (allowedBaseIds !== undefined) {
      if (allowedBaseIds.length === 0) {
        return [];
      }

      andWhere.push({
        OR: [
          {
            sourceBaseId: {
              in: allowedBaseIds
            }
          },
          {
            destinationBaseId: {
              in: allowedBaseIds
            }
          }
        ]
      });
    }

    return prisma.stockMovement.findMany({
      where: {
        AND: andWhere
      },
      include: movementReportInclude,
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async getTransferRecords(
    companyId: string,
    filters: Omit<MovementReportFilters, "type">,
    allowedBaseIds?: string[]
  ): Promise<MovementReportRecord[]> {
    return this.getMovementRecords(companyId, {
      ...filters,
      type: StockMovementType.TRANSFER
    }, allowedBaseIds);
  }
}
