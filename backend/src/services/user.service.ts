import { Prisma, Role, User } from "@prisma/client";
import bcrypt from "bcrypt";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { UserRepository, UserWithBaseAccess } from "../repositories/user.repository";

type CreateManagedUserInput = {
  name: string;
  email: string;
  password: string;
  role: Role;
  allowedBaseIds?: string[];
};

type UpdateManagedUserInput = {
  name?: string;
  email?: string;
  role?: Role;
  allowedBaseIds?: string[];
};

type UpdateProfileInput = {
  name?: string;
  email?: string;
  profilePhotoDataUrl?: string | null;
};

type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

type BaseAccessPayload = {
  id: string;
  name: string;
};

type UserPayload = {
  id: string;
  name: string;
  email: string;
  profilePhotoDataUrl: string | null;
  companyLogoDataUrl: string | null;
  role: Role;
  companyId: string;
  isFirstLogin: boolean;
  allowedBases: BaseAccessPayload[];
  createdAt: string;
  updatedAt: string;
};

export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async listUsers(adminUserId: string): Promise<UserPayload[]> {
    const admin = await this.requireUserWithBaseAccess(adminUserId);
    this.ensureAdmin(admin);

    const [users, companyBases] = await Promise.all([
      this.userRepository.listByCompanyWithBaseAccess(admin.companyId),
      this.userRepository.listBasesByCompany(admin.companyId)
    ]);

    return users.map((user) => this.serializeUser(user, companyBases));
  }

  async createUser(adminUserId: string, input: CreateManagedUserInput): Promise<UserPayload> {
    const admin = await this.requireUserWithBaseAccess(adminUserId);
    this.ensureAdmin(admin);

    const normalizedEmail = input.email.trim().toLowerCase();
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);

    if (existingUser) {
      throw new AppError("E-mail já cadastrado", 409);
    }

    const allowedBaseIds = await this.resolveAllowedBaseIdsForCreateOrUpdate({
      companyId: admin.companyId,
      role: input.role,
      requestedBaseIds: input.allowedBaseIds,
      fallbackBaseIds: []
    });

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);

    const createdUser = await this.userRepository.createWithBaseAccess(
      {
        name: input.name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: input.role,
        isFirstLogin: true,
        companyId: admin.companyId
      },
      allowedBaseIds
    );

    const companyBases = await this.userRepository.listBasesByCompany(admin.companyId);

    return this.serializeUser(createdUser, companyBases);
  }

  async updateUser(adminUserId: string, targetUserId: string, input: UpdateManagedUserInput): Promise<UserPayload> {
    const admin = await this.requireUserWithBaseAccess(adminUserId);
    this.ensureAdmin(admin);

    const targetUser = await this.userRepository.findByIdAndCompanyWithBaseAccess(targetUserId, admin.companyId);

    if (!targetUser) {
      throw new AppError("Usuário não encontrado", 404);
    }

    if (targetUser.id === admin.id && input.role && input.role !== admin.role) {
      throw new AppError("Não é permitido alterar o próprio perfil de acesso", 400);
    }

    if (targetUser.role === Role.ADMIN && input.role && input.role !== Role.ADMIN) {
      const adminsCount = await this.userRepository.countByCompanyAndRole(admin.companyId, Role.ADMIN);

      if (adminsCount <= 1) {
        throw new AppError("Não é permitido remover o último ADMIN da empresa", 400);
      }
    }

    const updateData: Prisma.UserUpdateInput = {};

    if (input.name !== undefined) {
      updateData.name = input.name.trim();
    }

    if (input.email !== undefined) {
      const normalizedEmail = input.email.trim().toLowerCase();
      const existingUser = await this.userRepository.findByEmail(normalizedEmail);

      if (existingUser && existingUser.id !== targetUser.id) {
        throw new AppError("E-mail já cadastrado", 409);
      }

      updateData.email = normalizedEmail;
    }

    const nextRole = input.role ?? targetUser.role;

    if (input.role !== undefined) {
      updateData.role = input.role;
    }

    const fallbackBaseIds = targetUser.baseAccesses.map((access) => access.baseId);
    const allowedBaseIds = await this.resolveAllowedBaseIdsForCreateOrUpdate({
      companyId: admin.companyId,
      role: nextRole,
      requestedBaseIds: input.allowedBaseIds,
      fallbackBaseIds
    });

    await this.userRepository.updateById(targetUser.id, updateData);

    if (nextRole === Role.ADMIN) {
      await this.userRepository.replaceBaseAccesses(targetUser.id, []);
    } else if (input.allowedBaseIds !== undefined || input.role !== undefined) {
      await this.userRepository.replaceBaseAccesses(targetUser.id, allowedBaseIds);
    }

    const updatedUser = await this.requireUserWithBaseAccess(targetUser.id);
    const companyBases = await this.userRepository.listBasesByCompany(admin.companyId);

    return this.serializeUser(updatedUser, companyBases);
  }

  async deleteUser(adminUserId: string, targetUserId: string): Promise<void> {
    const admin = await this.requireUser(adminUserId);
    this.ensureAdmin(admin);

    if (admin.id === targetUserId) {
      throw new AppError("Não é permitido excluir o próprio usuário", 400);
    }

    const targetUser = await this.userRepository.findByIdAndCompany(targetUserId, admin.companyId);

    if (!targetUser) {
      throw new AppError("Usuário não encontrado", 404);
    }

    if (targetUser.role === Role.ADMIN) {
      const adminsCount = await this.userRepository.countByCompanyAndRole(admin.companyId, Role.ADMIN);

      if (adminsCount <= 1) {
        throw new AppError("Não é permitido excluir o último ADMIN da empresa", 400);
      }
    }

    await this.userRepository.reassignCreatedMovements(admin.companyId, targetUser.id, admin.id);

    try {
      await this.userRepository.deleteById(targetUser.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new AppError("Usuário possui registros vinculados e não pode ser excluído", 400);
      }

      throw error;
    }
  }

  async getProfile(userId: string): Promise<UserPayload> {
    const user = await this.requireUserWithBaseAccess(userId);
    const companyBases = await this.userRepository.listBasesByCompany(user.companyId);

    return this.serializeUser(user, companyBases);
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserPayload> {
    const user = await this.requireUserWithBaseAccess(userId);

    const updateData: Prisma.UserUpdateInput = {};

    if (input.name !== undefined) {
      updateData.name = input.name.trim();
    }

    if (input.email !== undefined) {
      const normalizedEmail = input.email.trim().toLowerCase();
      const existingUser = await this.userRepository.findByEmail(normalizedEmail);

      if (existingUser && existingUser.id !== user.id) {
        throw new AppError("E-mail já cadastrado", 409);
      }

      updateData.email = normalizedEmail;
    }

    if (input.profilePhotoDataUrl !== undefined) {
      updateData.profilePhotoDataUrl = input.profilePhotoDataUrl;
    }

    if (Object.keys(updateData).length > 0) {
      await this.userRepository.updateById(user.id, updateData);
    }

    const refreshedUser = await this.requireUserWithBaseAccess(user.id);
    const companyBases = await this.userRepository.listBasesByCompany(user.companyId);

    return this.serializeUser(refreshedUser, companyBases);
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.requireUser(userId);

    const isCurrentPasswordValid = await bcrypt.compare(input.currentPassword, user.passwordHash);

    if (!isCurrentPasswordValid) {
      throw new AppError("Senha atual inválida", 400);
    }

    const isSamePassword = await bcrypt.compare(input.newPassword, user.passwordHash);

    if (isSamePassword) {
      throw new AppError("A nova senha deve ser diferente da senha atual", 400);
    }

    const passwordHash = await bcrypt.hash(input.newPassword, env.BCRYPT_SALT_ROUNDS);
    await this.userRepository.updatePassword(user.id, passwordHash);
  }

  private async resolveAllowedBaseIdsForCreateOrUpdate(input: {
    companyId: string;
    role: Role;
    requestedBaseIds: string[] | undefined;
    fallbackBaseIds: string[];
  }): Promise<string[]> {
    if (input.role === Role.ADMIN) {
      return [];
    }

    const sourceIds = input.requestedBaseIds !== undefined ? input.requestedBaseIds : input.fallbackBaseIds;
    const uniqueBaseIds = Array.from(new Set(sourceIds.map((id) => id.trim()).filter((id) => id.length > 0)));

    if (input.role === Role.GESTOR && uniqueBaseIds.length === 0) {
      throw new AppError("GESTOR deve possuir ao menos uma base permitida", 400);
    }

    if (input.role === Role.TECNICO && uniqueBaseIds.length !== 1) {
      throw new AppError("TÉCNICO deve possuir exatamente uma base permitida", 400);
    }

    const validBasesCount = await this.userRepository.countBasesByIds(input.companyId, uniqueBaseIds);

    if (validBasesCount !== uniqueBaseIds.length) {
      throw new AppError("Uma ou mais bases informadas são inválidas para a empresa", 400);
    }

    return uniqueBaseIds;
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new AppError("Unauthorized", 401);
    }

    return user;
  }

  private async requireUserWithBaseAccess(userId: string): Promise<UserWithBaseAccess> {
    const user = await this.userRepository.findByIdWithBaseAccess(userId);

    if (!user) {
      throw new AppError("Unauthorized", 401);
    }

    return user;
  }

  private ensureAdmin(user: User): void {
    if (user.role !== Role.ADMIN) {
      throw new AppError("Apenas ADMIN pode realizar esta operação", 403);
    }
  }

  private serializeUser(user: UserWithBaseAccess, companyBases: Array<{ id: string; name: string }>): UserPayload {
    const allowedBases =
      user.role === Role.ADMIN
        ? companyBases
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
      allowedBases,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    };
  }
}
