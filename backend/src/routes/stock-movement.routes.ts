import { Role } from "@prisma/client";
import { Router } from "express";
import { StockMovementController } from "../controllers/stock-movement.controller";
import { authenticationMiddleware } from "../middlewares/authentication.middleware";
import { rbacMiddleware } from "../middlewares/rbac.middleware";
import { StockMovementRepository } from "../repositories/stock-movement.repository";
import { ReportExportService } from "../services/report-export.service";
import { StockMovementService } from "../services/stock-movement.service";

const stockMovementRoutes = Router();

const stockMovementRepository = new StockMovementRepository();
const reportExportService = new ReportExportService();
const stockMovementService = new StockMovementService(stockMovementRepository, reportExportService);
const stockMovementController = new StockMovementController(stockMovementService);

for (const basePath of ["/movements", "/stock-movements"]) {
  stockMovementRoutes.get(
    `${basePath}/:id`,
    authenticationMiddleware,
    rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
    stockMovementController.getById
  );

  stockMovementRoutes.post(
    basePath,
    authenticationMiddleware,
    rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
    stockMovementController.create
  );

  stockMovementRoutes.post(
    `${basePath}/transfer`,
    authenticationMiddleware,
    rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
    stockMovementController.createTransfer
  );

  stockMovementRoutes.post(
    `${basePath}/:id/approve`,
    authenticationMiddleware,
    rbacMiddleware([Role.ADMIN, Role.GESTOR]),
    stockMovementController.approve
  );

  stockMovementRoutes.post(
    `${basePath}/:id/reject`,
    authenticationMiddleware,
    rbacMiddleware([Role.ADMIN, Role.GESTOR]),
    stockMovementController.reject
  );

  stockMovementRoutes.post(
    `${basePath}/:id/cancel`,
    authenticationMiddleware,
    rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
    stockMovementController.cancel
  );

  stockMovementRoutes.post(
    `${basePath}/:id/reverse`,
    authenticationMiddleware,
    rbacMiddleware([Role.ADMIN, Role.GESTOR]),
    stockMovementController.reverse
  );

  stockMovementRoutes.post(
    `${basePath}/:id/confirm-transfer`,
    authenticationMiddleware,
    rbacMiddleware([Role.ADMIN, Role.GESTOR]),
    stockMovementController.confirmTransfer
  );

  stockMovementRoutes.get(
    `${basePath}/:id/export/:format`,
    authenticationMiddleware,
    rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
    stockMovementController.exportById
  );
}

export { stockMovementRoutes };
