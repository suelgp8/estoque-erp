import { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { ProductService } from "../services/product.service";
import { appIdArraySchema, appIdSchema } from "../validation/app-id";

const emptySchema = z.object({}).strict();

const paramsIdSchema = z.object({
  id: appIdSchema
});

const exportParamsSchema = z.object({
  format: z.enum(["excel", "pdf"])
});

const exportQuerySchema = z.object({
  baseId: appIdSchema.optional(),
  categoryId: appIdSchema.optional()
});

const createProductSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(255).optional(),
  minimumStock: z.number().int().min(0).optional(),
  categoryId: appIdSchema.optional(),
  allowedBaseIds: appIdArraySchema.min(1)
});

const updateProductSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(255).nullable().optional(),
    minimumStock: z.number().int().min(0).optional(),
    categoryId: appIdSchema.nullable().optional(),
    allowedBaseIds: appIdArraySchema.min(1).optional()
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.minimumStock !== undefined ||
      value.categoryId !== undefined ||
      value.allowedBaseIds !== undefined,
    {
      message: "Informe ao menos um campo para atualizacao"
    }
  );

export class ProductController {
  constructor(private readonly productService: ProductService) {}

  listProducts = async (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);
    emptySchema.parse(request.body ?? {});

    const userId = this.requireAuthUserId(request);
    const products = await this.productService.listProducts(userId);

    response.status(200).json({ products });
  };

  exportProducts = async (request: Request, response: Response) => {
    emptySchema.parse(request.body ?? {});

    const userId = this.requireAuthUserId(request);
    const query = exportQuerySchema.parse(request.query);
    const params = exportParamsSchema.parse(request.params);
    const exported = await this.productService.exportProductsTable(userId, query, params.format);

    response.setHeader("Content-Type", exported.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${exported.fileName}"`);
    response.status(200).send(exported.buffer);
  };

  createProduct = async (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const payload = createProductSchema.parse(request.body);
    const product = await this.productService.createProduct(userId, payload);

    response.status(201).json({ product });
  };

  updateProduct = async (request: Request, response: Response) => {
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const params = paramsIdSchema.parse(request.params);
    const payload = updateProductSchema.parse(request.body);
    const product = await this.productService.updateProduct(userId, params.id, payload);

    response.status(200).json({ product });
  };

  deleteProduct = async (request: Request, response: Response) => {
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const params = paramsIdSchema.parse(request.params);
    emptySchema.parse(request.body ?? {});

    await this.productService.deleteProduct(userId, params.id);

    response.status(200).json({
      message: "Produto excluido com sucesso"
    });
  };

  private requireAuthUserId(request: Request): string {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    return request.authUser.userId;
  }
}
