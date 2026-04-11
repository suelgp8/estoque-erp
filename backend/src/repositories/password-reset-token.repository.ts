import { PasswordResetToken } from "@prisma/client";
import { prisma } from "../lib/prisma";

type CreatePasswordResetTokenInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

export class PasswordResetTokenRepository {
  async invalidateUserActiveTokens(userId: string): Promise<void> {
    await prisma.passwordResetToken.updateMany({
      where: {
        userId,
        usedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      data: {
        usedAt: new Date()
      }
    });
  }

  async create(input: CreatePasswordResetTokenInput): Promise<PasswordResetToken> {
    return prisma.passwordResetToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt
      }
    });
  }

  async findValidByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: new Date()
        }
      }
    });
  }

  async markAsUsed(id: string): Promise<void> {
    await prisma.passwordResetToken.update({
      where: {
        id
      },
      data: {
        usedAt: new Date()
      }
    });
  }
}
