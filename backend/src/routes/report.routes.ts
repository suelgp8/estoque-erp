import { Role } from "@prisma/client";
import { Router } from "express";
import { ReportController } from "../controllers/report.controller";
import { authenticationMiddleware } from "../middlewares/authentication.middleware";
import { rbacMiddleware } from "../middlewares/rbac.middleware";
import { ReportRepository } from "../repositories/report.repository";
import { ReportExportService } from "../services/report-export.service";
import { ReportService } from "../services/report.service";

const reportRoutes = Router();

const reportRepository = new ReportRepository();
const reportExportService = new ReportExportService();
const reportService = new ReportService(reportRepository, reportExportService);
const reportController = new ReportController(reportService);

reportRoutes.get(
  "/reports/stock",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
  reportController.getStockReport
);

reportRoutes.get(
  "/reports/stock/export/:format",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
  reportController.exportStockReport
);

reportRoutes.get(
  "/reports/movements",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
  reportController.getMovementsReport
);

reportRoutes.get(
  "/reports/movements/export/:format",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
  reportController.exportMovementsReport
);

reportRoutes.get(
  "/reports/transfers",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
  reportController.getTransfersReport
);

reportRoutes.get(
  "/reports/transfers/export/:format",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
  reportController.exportTransfersReport
);

export { reportRoutes };
