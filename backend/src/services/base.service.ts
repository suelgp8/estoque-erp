import { Role, User } from "@prisma/client";
import { AppError } from "../errors/app-error";
import { BaseRepository } from "../repositories/base.repository";

type CreateBaseInput = {
  name: string;
};

type UpdateBaseInput = {
  name?: string;
};

type BasePayload = {
  id: string;
  name: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
};

export class BaseService {
  constructor(private readonly baseRepository: BaseRepository) {}

  async listBases(userId: string): Promise<BasePayload[]> {
    const user = await this.baseRepository.findUserWithBaseAccessById(userId);

    if (!user) {
      throw new AppError("Unauthorized", 401);
    }

    const bases =
      user.role === Role.ADMIN
        ? await this.baseRepository.listByCompany(user.companyId)
        : await this.baseRepository.listByIds(
            user.companyId,
            user.baseAccesses.map((access) => access.baseId)
          );

    return bases.map((base) => this.serializeBase(base));
  }

  async createBase(userId: string, input: CreateBaseInput): Promise<BasePayload> {
    const user = await this.requireManager(userId);
    const normalizedName = input.name.trim();

    const existingBase = await this.baseRepository.findByName(user.companyId, normalizedName);

    if (existingBase) {
      throw new AppError("Já existe uma base com este nome", 409);
    }

    const createdBase = await this.baseRepository.create({
      name: normalizedName,
      companyId: user.companyId
    });

    return this.serializeBase(createdBase);
  }

  async updateBase(userId: string, baseId: string, input: UpdateBaseInput): Promise<BasePayload> {
    const user = await this.requireManager(userId);
    const existingBase = await this.baseRepository.findByIdAndCompany(baseId, user.companyId);

    if (!existingBase) {
      throw new AppError("Base não encontrada", 404);
    }

    const updateData: { name?: string } = {};

    if (input.name !== undefined) {
      const normalizedName = input.name.trim();
      const baseWithSameName = await this.baseRepository.findByName(user.companyId, normalizedName);

      if (baseWithSameName && baseWithSameName.id !== existingBase.id) {
        throw new AppError("Já existe uma base com este nome", 409);
      }

      updateData.name = normalizedName;
    }

    const updatedBase = await this.baseRepository.updateById(existingBase.id, updateData);

    return this.serializeBase(updatedBase);
  }

  async deleteBase(userId: string, baseId: string): Promise<void> {
    const user = await this.requireManager(userId);
    const existingBase = await this.baseRepository.findByIdAndCompany(baseId, user.companyId);

    if (!existingBase) {
      throw new AppError("Base não encontrada", 404);
    }

    const stockWithQuantity = await this.baseRepository.countStockWithPositiveQuantity(existingBase.id);

    if (stockWithQuantity > 0) {
      throw new AppError("Não é possível excluir base com estoque positivo", 400);
    }

    const linkedMovements = await this.baseRepository.countMovementsLinked(existingBase.id);

    if (linkedMovements > 0) {
      throw new AppError("Não é possível excluir base com movimentações vinculadas", 400);
    }

    const usersWithAccess = await this.baseRepository.countUsersWithAccess(existingBase.id);

    if (usersWithAccess > 0) {
      throw new AppError("Não é possível excluir base vinculada a usuários", 400);
    }

    const categoriesWithAccess = await this.baseRepository.countCategoriesWithAccess(existingBase.id);

    if (categoriesWithAccess > 0) {
      throw new AppError("Não é possível excluir base vinculada a categorias", 400);
    }

    const productsWithAccess = await this.baseRepository.countProductsWithAccess(existingBase.id);

    if (productsWithAccess > 0) {
      throw new AppError("Não é possível excluir base vinculada a produtos", 400);
    }

    await this.baseRepository.deleteById(existingBase.id);
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.baseRepository.findUserById(userId);

    if (!user) {
      throw new AppError("Unauthorized", 401);
    }

    return user;
  }

  private async requireManager(userId: string): Promise<User> {
    const user = await this.requireUser(userId);

    if (user.role !== Role.ADMIN && user.role !== Role.GESTOR) {
      throw new AppError("Apenas ADMIN ou GESTOR podem realizar esta operação", 403);
    }

    return user;
  }

  private serializeBase(base: { id: string; name: string; companyId: string; createdAt: Date; updatedAt: Date }): BasePayload {
    return {
      id: base.id,
      name: base.name,
      companyId: base.companyId,
      createdAt: base.createdAt.toISOString(),
      updatedAt: base.updatedAt.toISOString()
    };
  }
}
