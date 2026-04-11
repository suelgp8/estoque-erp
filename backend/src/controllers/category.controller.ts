import { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { CategoryService } from "../services/category.service";
import { appIdArraySchema, appIdSchema } from "../validation/app-id";

const emptySchema = z.object({}).strict();

const paramsIdSchema = z.object({
  id: appIdSchema
});

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(255).optional(),
  allowedBaseIds: appIdArraySchema.min(1)
});

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(255).nullable().optional(),
    allowedBaseIds: appIdArraySchema.min(1).optional()
  })
  .refine(
    (value) => value.name !== undefined || value.description !== undefined || value.allowedBaseIds !== undefined,
    {
      message: "Informe ao menos um campo para atualizacao"
    }
  );

export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  listCategories = async (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);
    emptySchema.parse(request.body ?? {});

    const userId = this.requireAuthUserId(request);
    const categories = await this.categoryService.listCategories(userId);

    response.status(200).json({ categories });
  };

  createCategory = async (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const payload = createCategorySchema.parse(request.body);
    const category = await this.categoryService.createCategory(userId, payload);

    response.status(201).json({ category });
  };

  updateCategory = async (request: Request, response: Response) => {
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const params = paramsIdSchema.parse(request.params);
    const payload = updateCategorySchema.parse(request.body);
    const category = await this.categoryService.updateCategory(userId, params.id, payload);

    response.status(200).json({ category });
  };

  deleteCategory = async (request: Request, response: Response) => {
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const params = paramsIdSchema.parse(request.params);
    emptySchema.parse(request.body ?? {});

    await this.categoryService.deleteCategory(userId, params.id);

    response.status(200).json({
      message: "Categoria excluida com sucesso"
    });
  };

  private requireAuthUserId(request: Request): string {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    return request.authUser.userId;
  }
}
