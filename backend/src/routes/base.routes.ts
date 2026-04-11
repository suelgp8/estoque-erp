import { Role } from "@prisma/client";
import { Router } from "express";
import { BaseController } from "../controllers/base.controller";
import { authenticationMiddleware } from "../middlewares/authentication.middleware";
import { rbacMiddleware } from "../middlewares/rbac.middleware";
import { BaseRepository } from "../repositories/base.repository";
import { BaseService } from "../services/base.service";

const baseRoutes = Router();

const baseRepository = new BaseRepository();
const baseService = new BaseService(baseRepository);
const baseController = new BaseController(baseService);

baseRoutes.get("/bases", authenticationMiddleware, rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]), baseController.listBases);
baseRoutes.post("/bases", authenticationMiddleware, rbacMiddleware([Role.ADMIN, Role.GESTOR]), baseController.createBase);
baseRoutes.patch("/bases/:id", authenticationMiddleware, rbacMiddleware([Role.ADMIN, Role.GESTOR]), baseController.updateBase);
baseRoutes.delete("/bases/:id", authenticationMiddleware, rbacMiddleware([Role.ADMIN, Role.GESTOR]), baseController.deleteBase);

export { baseRoutes };
