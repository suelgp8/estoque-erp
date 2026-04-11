import { Prisma, Role, User } from "@prisma/client";
import { prisma } from "../lib/prisma";

type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  isFirstLogin: boolean;
  companyId: string;
};

type UpdateUserInput = Prisma.UserUpdateInput;

const userWithBaseAccessArgs = Prisma.validator<Prisma.UserDefaultArgs>()({
  select: {
    id: true,
    name: true,
    email: true,
    profilePhotoDataUrl: true,
    passwordHash: true,
    role: true,
    isFirstLogin: true,
    companyId: true,
    createdAt: true,
    updatedAt: true,
    company: {
      select: {
        logoDataUrl: true
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
    }
  }
});

export type UserWithBaseAccess = Prisma.UserGetPayload<typeof userWithBaseAccessArgs>;

type BaseSummary = {
  id: string;
  name: string;
};

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: {
        email
      }
    });
  }

  async findByEmailWithBaseAccess(email: string): Promise<UserWithBaseAccess | null> {
    return prisma.user.findUnique({
      where: {
        email
      },
      ...userWithBaseAccessArgs
    });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: {
        id
      }
    });
  }

  async findByIdWithBaseAccess(id: string): Promise<UserWithBaseAccess | null> {
    return prisma.user.findUnique({
      where: {
        id
      },
      ...userWithBaseAccessArgs
    });
  }

  async findByIdAndCompany(id: string, companyId: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        id,
        companyId
      }
    });
  }

  async findByIdAndCompanyWithBaseAccess(id: string, companyId: string): Promise<UserWithBaseAccess | null> {
    return prisma.user.findFirst({
      where: {
        id,
        companyId
      },
      ...userWithBaseAccessArgs
    });
  }

  async countByRole(role: Role): Promise<number> {
    return prisma.user.count({
      where: {
        role
      }
    });
  }

  async countByCompanyAndRole(companyId: string, role: Role): Promise<number> {
    return prisma.user.count({
      where: {
        companyId,
        role
      }
    });
  }

  async listByCompany(companyId: string): Promise<User[]> {
    return prisma.user.findMany({
      where: {
        companyId
      },
      orderBy: [
        {
          createdAt: "desc"
        }
      ]
    });
  }

  async listByCompanyWithBaseAccess(companyId: string): Promise<UserWithBaseAccess[]> {
    return prisma.user.findMany({
      where: {
        companyId
      },
      ...userWithBaseAccessArgs,
      orderBy: [
        {
          createdAt: "desc"
        }
      ]
    });
  }

  async create(data: CreateUserInput): Promise<User> {
    return prisma.user.create({
      data
    });
  }

  async createWithBaseAccess(data: CreateUserInput, baseIds: string[]): Promise<UserWithBaseAccess> {
    return prisma.user.create({
      data: {
        ...data,
        ...(baseIds.length > 0
          ? {
              baseAccesses: {
                create: baseIds.map((baseId) => ({
                  baseId
                }))
              }
            }
          : {})
      },
      ...userWithBaseAccessArgs
    });
  }

  async updateById(userId: string, data: UpdateUserInput): Promise<User> {
    return prisma.user.update({
      where: {
        id: userId
      },
      data
    });
  }

  async updateByIdWithBaseAccess(userId: string, data: UpdateUserInput): Promise<UserWithBaseAccess> {
    return prisma.user.update({
      where: {
        id: userId
      },
      data,
      ...userWithBaseAccessArgs
    });
  }

  async replaceBaseAccesses(userId: string, baseIds: string[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.userBaseAccess.deleteMany({
        where: {
          userId
        }
      });

      if (baseIds.length > 0) {
        await tx.userBaseAccess.createMany({
          data: baseIds.map((baseId) => ({
            userId,
            baseId
          }))
        });
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

  async listBasesByCompany(companyId: string): Promise<BaseSummary[]> {
    return prisma.base.findMany({
      where: {
        companyId
      },
      select: {
        id: true,
        name: true
      },
      orderBy: {
        name: "asc"
      }
    });
  }

  async reassignCreatedMovements(companyId: string, fromUserId: string, toUserId: string): Promise<number> {
    const result = await prisma.stockMovement.updateMany({
      where: {
        companyId,
        createdById: fromUserId
      },
      data: {
        createdById: toUserId
      }
    });

    return result.count;
  }

  async deleteById(userId: string): Promise<User> {
    return prisma.user.delete({
      where: {
        id: userId
      }
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<User> {
    return prisma.user.update({
      where: {
        id: userId
      },
      data: {
        passwordHash,
        isFirstLogin: false
      }
    });
  }
}
