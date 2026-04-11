import { Role } from "@prisma/client";
import bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { PasswordResetTokenRepository } from "../repositories/password-reset-token.repository";
import { UserRepository, UserWithBaseAccess } from "../repositories/user.repository";
import { PasswordRecoveryNotificationService } from "./password-recovery-notification.service";

type LoginInput = {
  email: string;
  password: string;
};

type ForgotPasswordInput = {
  email: string;
};

type ResetPasswordInput = {
  token: string;
  newPassword: string;
};

type AuthUserPayload = {
  id: string;
  name: string;
  email: string;
  profilePhotoDataUrl: string | null;
  companyLogoDataUrl: string | null;
  role: Role;
  companyId: string;
  isFirstLogin: boolean;
  allowedBases: Array<{
    id: string;
    name: string;
  }>;
};

type LoginResponse = {
  token: string;
  user: AuthUserPayload;
};

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    private readonly passwordRecoveryNotificationService: PasswordRecoveryNotificationService
  ) {}

  async login(input: LoginInput): Promise<LoginResponse> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.userRepository.findByEmailWithBaseAccess(normalizedEmail);

    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppError("Invalid credentials", 401);
    }

    const signOptions: SignOptions = {
      subject: user.id,
      expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"]
    };

    const token = jwt.sign(
      {
        role: user.role,
        email: user.email
      },
      env.JWT_SECRET,
      signOptions
    );

    return {
      token,
      user: await this.serializeUser(user)
    };
  }

  async me(userId: string): Promise<AuthUserPayload> {
    const user = await this.userRepository.findByIdWithBaseAccess(userId);

    if (!user) {
      throw new AppError("Unauthorized", 401);
    }

    return this.serializeUser(user);
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<{ message: string }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (!user) {
      return {
        message: "If the email exists, recovery instructions were sent"
      };
    }

    const rawToken = randomBytes(48).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await this.passwordResetTokenRepository.invalidateUserActiveTokens(user.id);
    await this.passwordResetTokenRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt
    });

    await this.passwordRecoveryNotificationService.sendPasswordResetNotification({
      email: user.email,
      name: user.name,
      token: rawToken
    });

    return {
      message: "If the email exists, recovery instructions were sent"
    };
  }

  async resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
    const tokenHash = createHash("sha256").update(input.token).digest("hex");
    const passwordResetToken = await this.passwordResetTokenRepository.findValidByTokenHash(tokenHash);

    if (!passwordResetToken) {
      throw new AppError("Invalid or expired reset token", 400);
    }

    const passwordHash = await bcrypt.hash(input.newPassword, env.BCRYPT_SALT_ROUNDS);

    await this.userRepository.updatePassword(passwordResetToken.userId, passwordHash);
    await this.passwordResetTokenRepository.markAsUsed(passwordResetToken.id);
    await this.passwordResetTokenRepository.invalidateUserActiveTokens(passwordResetToken.userId);

    return {
      message: "Password reset completed successfully"
    };
  }

  private async serializeUser(user: UserWithBaseAccess): Promise<AuthUserPayload> {
    const allowedBases =
      user.role === Role.ADMIN
        ? await this.userRepository.listBasesByCompany(user.companyId)
        : user.baseAccesses.map((access) => ({
            id: access.base.id,
            name: access.base.name
          }));

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      profilePhotoDataUrl: user.profilePhotoDataUrl ?? null,
      companyLogoDataUrl: user.company.logoDataUrl ?? null,
      role: user.role,
      companyId: user.companyId,
      isFirstLogin: user.isFirstLogin,
      allowedBases
    };
  }
}
