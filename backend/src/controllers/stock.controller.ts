import { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { StockQueryService } from "../services/stock-query.service";
import { appIdSchema } from "../validation/app-id";

const emptyParamsSchema = z.object({}).strict();
const emptyBodySchema = z.object({}).strict();

const getStockByBaseQuerySchema = z.object({
  productId: appIdSchema,
  baseId: appIdSchema
});

export class StockController {
  constructor(private readonly stockQueryService: StockQueryService) {}

  getStockByBase = async (request: Request, response: Response) => {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    emptyParamsSchema.parse(request.params);
    emptyBodySchema.parse(request.body ?? {});

    const query = getStockByBaseQuerySchema.parse(request.query);
    const stock = await this.stockQueryService.getStockByBase(request.authUser.userId, query.productId, query.baseId);

    response.status(200).json(stock);
  };
}
