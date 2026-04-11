import { Base, Prisma, User } from "@prisma/client";
import { prisma } from "../lib/prisma";

const userWithBaseAccessInclude = Prisma.validator<Prisma.UserInclude>()({
  baseAccesses: {
    select: {
      baseId: true
    }
  }
});

export type UserWithBaseAccess = Prisma.UserGetPayload<{
  include: typeof userWithBaseAccessInclude;
}>;

export class BaseRepository {
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

  async listByCompany(companyId: string): Promise<Base[]> {
    return prisma.base.findMany({
      where: {
        companyId
      },
      orderBy: [
        {
          name: "asc"
        }
      ]
    });
  }

  async listByIds(companyId: string, baseIds: string[]): Promise<Base[]> {
    if (baseIds.length === 0) {
      return [];
    }

    return prisma.base.findMany({
      where: {
        companyId,
        id: {
          in: baseIds
        }
      },
      orderBy: [
        {
          name: "asc"
        }
      ]
    });
  }

  async findByIdAndCompany(baseId: string, companyId: string): Promise<Base | null> {
    return prisma.base.findFirst({
      where: {
        id: baseId,
        companyId
      }
    });
  }

  async findByName(companyId: string, name: string): Promise<Base | null> {
    return prisma.base.findFirst({
      where: {
        companyId,
        name: {
          equals: name,
          mode: "insensitive"
        }
      }
    });
  }

  async create(data: Prisma.BaseUncheckedCreateInput): Promise<Base> {
    return prisma.base.create({
      data
    });
  }

  async updateById(baseId: string, data: Prisma.BaseUpdateInput): Promise<Base> {
    return prisma.base.update({
      where: {
        id: baseId
      },
      data
    });
  }

  async countStockWithPositiveQuantity(baseId: string): Promise<number> {
    return prisma.stock.count({
      where: {
        baseId,
        quantity: {
          gt: 0
        }
      }
    });
  }

  async countMovementsLinked(baseId: string): Promise<number> {
    return prisma.stockMovement.count({
      where: {
        OR: [
          {
            sourceBaseId: baseId
          },
          {
            destinationBaseId: baseId
          }
        ]
      }
    });
  }

  async countUsersWithAccess(baseId: string): Promise<number> {
    return prisma.userBaseAccess.count({
      where: {
        baseId
      }
    });
  }

  async countCategoriesWithAccess(baseId: string): Promise<number> {
    return prisma.categoryBaseAccess.count({
      where: {
        baseId
      }
    });
  }

  async countProductsWithAccess(baseId: string): Promise<number> {
    return prisma.productBaseAccess.count({
      where: {
        baseId
      }
    });
  }

  async deleteById(baseId: string): Promise<Base> {
    return prisma.base.delete({
      where: {
        id: baseId
      }
    });
  }
}
