import { StockMovementStatus, StockMovementType } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { MovementReportFilters, StockReportFilters } from "../repositories/report.repository";
import { ReportService } from "../services/report.service";
import { appIdSchema } from "../validation/app-id";

const reportFormatSchema = z.enum(["excel", "pdf"]);

const dateQuerySchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  if (!value.trim()) {
    return undefined;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate;
}, z.date().optional());

const stockQuerySchema = z.object({
  baseId: appIdSchema.optional(),
  categoryId: appIdSchema.optional(),
  productId: appIdSchema.optional(),
  search: z.string().trim().min(1).max(120).optional()
});

const movementQuerySchema = z.object({
  baseId: appIdSchema.optional(),
  type: z.nativeEnum(StockMovementType).optional(),
  status: z.nativeEnum(StockMovementStatus).optional(),
  sourceBaseId: appIdSchema.optional(),
  destinationBaseId: appIdSchema.optional(),
  productId: appIdSchema.optional(),
  createdById: appIdSchema.optional(),
  dateFrom: dateQuerySchema,
  dateTo: dateQuerySchema
});

const transferQuerySchema = movementQuerySchema.omit({ type: true });

const exportParamsSchema = z.object({
  format: reportFormatSchema
});

export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  getStockReport = async (request: Request, response: Response) => {
    const userId = this.requireUser(request);
    const query = stockQuerySchema.parse(request.query);
    const report = await this.reportService.getStockReport(userId, query as StockReportFilters);

    response.status(200).json(report);
  };

  exportStockReport = async (request: Request, response: Response) => {
    const userId = this.requireUser(request);
    const query = stockQuerySchema.parse(request.query);
    const params = exportParamsSchema.parse(request.params);

    const exported = await this.reportService.exportStockReport(userId, query as StockReportFilters, params.format);

    response.setHeader("Content-Type", exported.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${exported.fileName}"`);
    response.status(200).send(exported.buffer);
  };

  getMovementsReport = async (request: Request, response: Response) => {
    const userId = this.requireUser(request);
    const query = movementQuerySchema.parse(request.query);
    const report = await this.reportService.getMovementsReport(userId, query as MovementReportFilters);

    response.status(200).json(report);
  };

  exportMovementsReport = async (request: Request, response: Response) => {
    const userId = this.requireUser(request);
    const query = movementQuerySchema.parse(request.query);
    const params = exportParamsSchema.parse(request.params);

    const exported = await this.reportService.exportMovementsReport(userId, query as MovementReportFilters, params.format);

    response.setHeader("Content-Type", exported.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${exported.fileName}"`);
    response.status(200).send(exported.buffer);
  };

  getTransfersReport = async (request: Request, response: Response) => {
    const userId = this.requireUser(request);
    const query = transferQuerySchema.parse(request.query);
    const report = await this.reportService.getTransfersReport(userId, query as Omit<MovementReportFilters, "type">);

    response.status(200).json(report);
  };

  exportTransfersReport = async (request: Request, response: Response) => {
    const userId = this.requireUser(request);
    const query = transferQuerySchema.parse(request.query);
    const params = exportParamsSchema.parse(request.params);

    const exported = await this.reportService.exportTransfersReport(
      userId,
      query as Omit<MovementReportFilters, "type">,
      params.format
    );

    response.setHeader("Content-Type", exported.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${exported.fileName}"`);
    response.status(200).send(exported.buffer);
  };

  private requireUser(request: Request): string {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    return request.authUser.userId;
  }
}
