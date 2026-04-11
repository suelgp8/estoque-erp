import { Role } from "@prisma/client";
import { Router } from "express";
import { StockController } from "../controllers/stock.controller";
import { authenticationMiddleware } from "../middlewares/authentication.middleware";
import { rbacMiddleware } from "../middlewares/rbac.middleware";
import { BaseRepository } from "../repositories/base.repository";
import { ProductRepository } from "../repositories/product.repository";
import { StockQueryService } from "../services/stock-query.service";

const stockRoutes = Router();

const productRepository = new ProductRepository();
const baseRepository = new BaseRepository();
const stockQueryService = new StockQueryService(productRepository, baseRepository);
const stockController = new StockController(stockQueryService);

stockRoutes.get(
  "/stock/by-base",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
  stockController.getStockByBase
);

export { stockRoutes };
