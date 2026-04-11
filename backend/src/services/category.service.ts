import { Role } from "@prisma/client";
import { AppError } from "../errors/app-error";
import {
  CategoryRepository,
  CategoryWithRelations,
  UserWithBaseAccess
} from "../repositories/category.repository";

type CreateCategoryInput = {
  name: string;
  description?: string;
  allowedBaseIds: string[];
};

type UpdateCategoryInput = {
  name?: string;
  description?: string | null;
  allowedBaseIds?: string[];
};

type BaseAccessPayload = {
  id: string;
  name: string;
};

type CategoryPayload = {
  id: string;
  name: string;
  description: string | null;
  companyId: string;
  productsCount: number;
  allowedBases: BaseAccessPayload[];
  createdAt: string;
  updatedAt: string;
};

export class CategoryService {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async listCategories(userId: string): Promise<CategoryPayload[]> {
    const user = await this.requireUserWithBaseAccess(userId);
    const categories =
      user.role === Role.ADMIN
        ? await this.categoryRepository.listByCompany(user.companyId)
        : await this.categoryRepository.listByCompanyAndAllowedBaseIds(
            user.companyId,
            user.baseAccesses.map((access) => access.baseId)
          );

    return categories.map((category) => this.serializeCategory(category));
  }

  async createCategory(userId: string, input: CreateCategoryInput): Promise<CategoryPayload> {
    const user = await this.requireManagerWithBaseAccess(userId);
    const normalizedName = input.name.trim();

    const existingCategory = await this.categoryRepository.findByName(user.companyId, normalizedName);

    if (existingCategory) {
      throw new AppError("Ja existe uma categoria com este nome", 409);
    }

    const allowedBaseIds = await this.resolveAllowedBaseIds(user, input.allowedBaseIds);

    const createdCategory = await this.categoryRepository.create({
      name: normalizedName,
      description: input.description?.trim() || null,
      company: {
        connect: {
          id: user.companyId
        }
      },
      baseAccesses: {
        create: allowedBaseIds.map((baseId) => ({
          base: {
            connect: {
              id: baseId
            }
          }
        }))
      }
    });

    return this.serializeCategory(createdCategory);
  }

  async updateCategory(userId: string, categoryId: string, input: UpdateCategoryInput): Promise<CategoryPayload> {
    const user = await this.requireManagerWithBaseAccess(userId);
    const existingCategory = await this.categoryRepository.findByIdAndCompany(categoryId, user.companyId);

    if (!existingCategory) {
      throw new AppError("Categoria nao encontrada", 404);
    }

    this.ensureManagerCanManageCategory(user, existingCategory);

    const updateData: PrismaCategoryUpdateData = {};

    if (input.name !== undefined) {
      const normalizedName = input.name.trim();
      const categoryWithSameName = await this.categoryRepository.findByName(user.companyId, normalizedName);

      if (categoryWithSameName && categoryWithSameName.id !== existingCategory.id) {
        throw new AppError("Ja existe uma categoria com este nome", 409);
      }

      updateData.name = normalizedName;
    }

    if (input.description !== undefined) {
      updateData.description = input.description?.trim() || null;
    }

    if (input.allowedBaseIds !== undefined) {
      const allowedBaseIds = await this.resolveAllowedBaseIds(user, input.allowedBaseIds);
      const productsOutsideAllowedBases = await this.categoryRepository.countProductsOutsideAllowedBases(
        existingCategory.id,
        allowedBaseIds
      );

      if (productsOutsideAllowedBases > 0) {
        throw new AppError(
          "Nao e possivel remover bases que ainda estao vinculadas a produtos desta categoria",
          400
        );
      }

      updateData.baseAccesses = {
        deleteMany: {},
        create: allowedBaseIds.map((baseId) => ({
          base: {
            connect: {
              id: baseId
            }
          }
        }))
      };
    }

    const updatedCategory = await this.categoryRepository.updateById(existingCategory.id, updateData);

    return this.serializeCategory(updatedCategory);
  }

  async deleteCategory(userId: string, categoryId: string): Promise<void> {
    const user = await this.requireManagerWithBaseAccess(userId);
    const existingCategory = await this.categoryRepository.findByIdAndCompany(categoryId, user.companyId);

    if (!existingCategory) {
      throw new AppError("Categoria nao encontrada", 404);
    }

    this.ensureManagerCanManageCategory(user, existingCategory);

    if (existingCategory._count.products > 0) {
      throw new AppError("Nao e possivel excluir categoria com produtos vinculados", 400);
    }

    await this.categoryRepository.deleteById(existingCategory.id);
  }

  private async resolveAllowedBaseIds(user: UserWithBaseAccess, baseIds: string[]): Promise<string[]> {
    const normalizedBaseIds = Array.from(new Set(baseIds.map((baseId) => baseId.trim()).filter((baseId) => baseId.length > 0)));

    if (normalizedBaseIds.length === 0) {
      throw new AppError("Selecione ao menos uma base para a categoria", 400);
    }

    const validBasesCount = await this.categoryRepository.countBasesByIds(user.companyId, normalizedBaseIds);

    if (validBasesCount !== normalizedBaseIds.length) {
      throw new AppError("Uma ou mais bases informadas sao invalidas para a empresa", 400);
    }

    if (user.role !== Role.ADMIN) {
      const allowedBaseIds = new Set(user.baseAccesses.map((access) => access.baseId));
      const hasForbiddenBase = normalizedBaseIds.some((baseId) => !allowedBaseIds.has(baseId));

      if (hasForbiddenBase) {
        throw new AppError("Voce nao possui permissao para vincular esta categoria as bases selecionadas", 403);
      }
    }

    return normalizedBaseIds;
  }

  private async requireUserWithBaseAccess(userId: string): Promise<UserWithBaseAccess> {
    const user = await this.categoryRepository.findUserWithBaseAccessById(userId);

    if (!user) {
      throw new AppError("Unauthorized", 401);
    }

    return user;
  }

  private async requireManagerWithBaseAccess(userId: string): Promise<UserWithBaseAccess> {
    const user = await this.requireUserWithBaseAccess(userId);

    if (user.role !== Role.ADMIN && user.role !== Role.GESTOR) {
      throw new AppError("Apenas ADMIN ou GESTOR podem realizar esta operacao", 403);
    }

    return user;
  }

  private ensureManagerCanManageCategory(user: UserWithBaseAccess, category: CategoryWithRelations): void {
    if (user.role === Role.ADMIN) {
      return;
    }

    const allowedBaseIds = new Set(user.baseAccesses.map((access) => access.baseId));
    const hasPartialAccess = category.baseAccesses.some((access) => !allowedBaseIds.has(access.baseId));

    if (hasPartialAccess) {
      throw new AppError("Voce nao possui acesso completo a todas as bases desta categoria", 403);
    }
  }

  private serializeCategory(category: CategoryWithRelations): CategoryPayload {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      companyId: category.companyId,
      productsCount: category._count.products,
      allowedBases: category.baseAccesses.map((access) => ({
        id: access.base.id,
        name: access.base.name
      })),
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString()
    };
  }
}

type PrismaCategoryUpdateData = {
  name?: string;
  description?: string | null;
  baseAccesses?: {
    deleteMany: Record<string, never>;
    create: Array<{
      base: {
        connect: {
          id: string;
        };
      };
    }>;
  };
};
