import { StockMovementType } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { StockMovementService } from "../services/stock-movement.service";
import { appIdSchema } from "../validation/app-id";

const createStockMovementSchema = z.object({
  type: z.nativeEnum(StockMovementType),
  sourceBaseId: appIdSchema.optional(),
  destinationBaseId: appIdSchema.optional(),
  reason: z.string().trim().max(255).optional(),
  items: z.array(
    z.object({
      productId: appIdSchema,
      quantity: z.number().int().positive()
    })
  ).min(1)
});

const createTransferSchema = z.object({
  productId: appIdSchema,
  fromBaseId: appIdSchema,
  toBaseId: appIdSchema,
  quantity: z.number().int().positive(),
  technicianId: appIdSchema
});

const paramsIdSchema = z.object({
  id: appIdSchema
});

const exportParamsSchema = z.object({
  id: appIdSchema,
  format: z.enum(["excel", "pdf"])
});

const rejectSchema = z.object({
  reason: z.string().trim().min(3).max(255)
});

const statusActionSchema = z.object({
  reason: z.string().trim().min(3).max(255)
});

const emptyBodySchema = z.object({}).strict();

export class StockMovementController {
  constructor(private readonly stockMovementService: StockMovementService) {}

  getById = async (request: Request, response: Response) => {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    const params = paramsIdSchema.parse(request.params);
    const movement = await this.stockMovementService.getDetails(request.authUser.userId, params.id);

    response.status(200).json({ movement });
  };

  create = async (request: Request, response: Response) => {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    const payload = createStockMovementSchema.parse(request.body);
    const movement = await this.stockMovementService.create(request.authUser.userId, payload);

    response.status(201).json({ movement });
  };

  createTransfer = async (request: Request, response: Response) => {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    const payload = createTransferSchema.parse(request.body);
    const movement = await this.stockMovementService.createTransfer(request.authUser.userId, payload);

    response.status(201).json({ movement });
  };

  approve = async (request: Request, response: Response) => {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    const params = paramsIdSchema.parse(request.params);
    emptyBodySchema.parse(request.body ?? {});
    const movement = await this.stockMovementService.approve(request.authUser.userId, params.id);

    response.status(200).json({ movement });
  };

  reject = async (request: Request, response: Response) => {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    const params = paramsIdSchema.parse(request.params);
    const payload = rejectSchema.parse(request.body);
    const movement = await this.stockMovementService.reject(request.authUser.userId, params.id, payload.reason);

    response.status(200).json({ movement });
  };

  cancel = async (request: Request, response: Response) => {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    const params = paramsIdSchema.parse(request.params);
    const payload = statusActionSchema.parse(request.body);
    const movement = await this.stockMovementService.cancel(request.authUser.userId, params.id, payload.reason);

    response.status(200).json({ movement });
  };

  reverse = async (request: Request, response: Response) => {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    const params = paramsIdSchema.parse(request.params);
    const payload = statusActionSchema.parse(request.body);
    const movement = await this.stockMovementService.reverse(request.authUser.userId, params.id, payload.reason);

    response.status(200).json({ movement });
  };

  confirmTransfer = async (request: Request, response: Response) => {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    const params = paramsIdSchema.parse(request.params);
    emptyBodySchema.parse(request.body ?? {});
    const movement = await this.stockMovementService.confirmTransfer(request.authUser.userId, params.id);

    response.status(200).json({ movement });
  };

  exportById = async (request: Request, response: Response) => {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    const params = exportParamsSchema.parse(request.params);
    const exported = await this.stockMovementService.exportMovement(request.authUser.userId, params.id, params.format);

    response.setHeader("Content-Type", exported.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${exported.fileName}"`);
    response.status(200).send(exported.buffer);
  };
}
