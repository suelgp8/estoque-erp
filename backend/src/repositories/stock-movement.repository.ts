import { Prisma, StockMovementStatus, StockMovementType, User } from "@prisma/client";
import { prisma } from "../lib/prisma";

type Tx = Prisma.TransactionClient;

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

const movementInclude = Prisma.validator<Prisma.StockMovementInclude>()({
  originalMovement: {
    select: {
      id: true
    }
  },
  reversalMovement: {
    select: {
      id: true
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
  },
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
  }
});

export type StockMovementWithRelations = Prisma.StockMovementGetPayload<{
  include: typeof movementInclude;
}>;

type CreateMovementInput = {
  type: StockMovementType;
  status: StockMovementStatus;
  reason?: string;
  rejectionReason?: string | null;
  cancellationReason?: string | null;
  reversalReason?: string | null;
  companyId: string;
  createdById: string;
  approvedById?: string;
  sourceBaseId?: string;
  destinationBaseId?: string;
  originalMovementId?: string;
  approvedAt?: Date;
  completedAt?: Date;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
};

type CreateLogInput = {
  companyId: string;
  userId?: string;
  entityType: string;
  entityId?: string;
  action: string;
  metadata?: Prisma.InputJsonValue;
};

export class StockMovementRepository {
  async withTransaction<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
    return prisma.$transaction((tx) => operation(tx));
  }

  async findUserById(tx: Tx, userId: string): Promise<User | null> {
    return tx.user.findUnique({
      where: {
        id: userId
      }
    });
  }

  async findUserWithBaseAccessById(tx: Tx, userId: string): Promise<UserWithBaseAccess | null> {
    return tx.user.findUnique({
      where: {
        id: userId
      },
      include: userWithBaseAccessInclude
    });
  }

  async listCompanyBaseIds(tx: Tx, companyId: string): Promise<string[]> {
    const bases = await tx.base.findMany({
      where: {
        companyId
      },
      select: {
        id: true
      }
    });

    return bases.map((base) => base.id);
  }

  async countProductsByIds(tx: Tx, companyId: string, productIds: string[]): Promise<number> {
    return tx.product.count({
      where: {
        companyId,
        id: {
          in: productIds
        }
      }
    });
  }

  async countProductsAllowedAtBase(tx: Tx, companyId: string, productIds: string[], baseId: string): Promise<number> {
    const accessRecords = await tx.productBaseAccess.findMany({
      where: {
        baseId,
        productId: {
          in: productIds
        },
        product: {
          companyId
        }
      },
      distinct: ["productId"],
      select: {
        productId: true
      }
    });

    return accessRecords.length;
  }

  async countBasesByIds(tx: Tx, companyId: string, baseIds: string[]): Promise<number> {
    return tx.base.count({
      where: {
        companyId,
        id: {
          in: baseIds
        }
      }
    });
  }

  async createMovement(tx: Tx, input: CreateMovementInput): Promise<StockMovementWithRelations> {
    return tx.stockMovement.create({
      data: {
        type: input.type,
        status: input.status,
        reason: input.reason,
        rejectionReason: input.rejectionReason,
        cancellationReason: input.cancellationReason,
        reversalReason: input.reversalReason,
        companyId: input.companyId,
        createdById: input.createdById,
        approvedById: input.approvedById,
        sourceBaseId: input.sourceBaseId,
        destinationBaseId: input.destinationBaseId,
        originalMovementId: input.originalMovementId,
        approvedAt: input.approvedAt,
        completedAt: input.completedAt,
        items: {
          create: input.items
        }
      },
      include: movementInclude
    });
  }

  async findMovementById(tx: Tx, movementId: string, companyId: string): Promise<StockMovementWithRelations | null> {
    return tx.stockMovement.findFirst({
      where: {
        id: movementId,
        companyId
      },
      include: movementInclude
    });
  }

  async updateMovement(
    tx: Tx,
    movementId: string,
    data: Prisma.StockMovementUncheckedUpdateInput
  ): Promise<StockMovementWithRelations> {
    return tx.stockMovement.update({
      where: {
        id: movementId
      },
      data,
      include: movementInclude
    });
  }

  async createLog(tx: Tx, input: CreateLogInput): Promise<void> {
    await tx.log.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        metadata: input.metadata
      }
    });
  }
}
