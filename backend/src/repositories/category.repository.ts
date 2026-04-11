import { Category, Prisma, User } from "@prisma/client";
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

const categoryInclude = Prisma.validator<Prisma.CategoryInclude>()({
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
  _count: {
    select: {
      products: true
    }
  }
});

export type CategoryWithRelations = Prisma.CategoryGetPayload<{
  include: typeof categoryInclude;
}>;

export class CategoryRepository {
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

  async listByCompany(companyId: string): Promise<CategoryWithRelations[]> {
    return prisma.category.findMany({
      where: {
        companyId
      },
      include: categoryInclude,
      orderBy: [
        {
          name: "asc"
        }
      ]
    });
  }

  async listByCompanyAndAllowedBaseIds(companyId: string, allowedBaseIds: string[]): Promise<CategoryWithRelations[]> {
    if (allowedBaseIds.length === 0) {
      return [];
    }

    return prisma.category.findMany({
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
      include: categoryInclude,
      orderBy: [
        {
          name: "asc"
        }
      ]
    });
  }

  async findByIdAndCompany(categoryId: string, companyId: string): Promise<CategoryWithRelations | null> {
    return prisma.category.findFirst({
      where: {
        id: categoryId,
        companyId
      },
      include: categoryInclude
    });
  }

  async findByName(companyId: string, name: string): Promise<Category | null> {
    return prisma.category.findFirst({
      where: {
        companyId,
        name: {
          equals: name,
          mode: "insensitive"
        }
      }
    });
  }

  async countProductsOutsideAllowedBases(categoryId: string, allowedBaseIds: string[]): Promise<number> {
    return prisma.product.count({
      where: {
        categoryId,
        baseAccesses: {
          some: {
            baseId: {
              notIn: allowedBaseIds
            }
          }
        }
      }
    });
  }

  async create(data: Prisma.CategoryCreateInput): Promise<CategoryWithRelations> {
    return prisma.category.create({
      data,
      include: categoryInclude
    });
  }

  async updateById(categoryId: string, data: Prisma.CategoryUpdateInput): Promise<CategoryWithRelations> {
    return prisma.category.update({
      where: {
        id: categoryId
      },
      data,
      include: categoryInclude
    });
  }

  async deleteById(categoryId: string): Promise<Category> {
    return prisma.category.delete({
      where: {
        id: categoryId
      }
    });
  }
}
