import { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { BaseService } from "../services/base.service";
import { appIdSchema } from "../validation/app-id";

const emptySchema = z.object({}).strict();

const paramsIdSchema = z.object({
  id: appIdSchema
});

const createBaseSchema = z.object({
  name: z.string().trim().min(2).max(120)
});

const updateBaseSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional()
  })
  .refine((value) => value.name !== undefined, {
    message: "Informe ao menos um campo para atualização"
  });

export class BaseController {
  constructor(private readonly baseService: BaseService) {}

  listBases = async (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);
    emptySchema.parse(request.body ?? {});

    const userId = this.requireAuthUserId(request);
    const bases = await this.baseService.listBases(userId);

    response.status(200).json({ bases });
  };

  createBase = async (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const payload = createBaseSchema.parse(request.body);
    const base = await this.baseService.createBase(userId, payload);

    response.status(201).json({ base });
  };

  updateBase = async (request: Request, response: Response) => {
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const params = paramsIdSchema.parse(request.params);
    const payload = updateBaseSchema.parse(request.body);
    const base = await this.baseService.updateBase(userId, params.id, payload);

    response.status(200).json({ base });
  };

  deleteBase = async (request: Request, response: Response) => {
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const params = paramsIdSchema.parse(request.params);
    emptySchema.parse(request.body ?? {});

    await this.baseService.deleteBase(userId, params.id);

    response.status(200).json({
      message: "Base excluída com sucesso"
    });
  };

  private requireAuthUserId(request: Request): string {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    return request.authUser.userId;
  }
}
