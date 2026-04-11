import { Role } from "@prisma/client";
import { Router } from "express";
import { CompanyController } from "../controllers/company.controller";
import { authenticationMiddleware } from "../middlewares/authentication.middleware";
import { rbacMiddleware } from "../middlewares/rbac.middleware";
import { CompanyRepository } from "../repositories/company.repository";
import { UserRepository } from "../repositories/user.repository";
import { CompanyService } from "../services/company.service";

const companyRoutes = Router();

const companyRepository = new CompanyRepository();
const userRepository = new UserRepository();
const companyService = new CompanyService(companyRepository, userRepository);
const companyController = new CompanyController(companyService);

companyRoutes.get("/company", authenticationMiddleware, rbacMiddleware([Role.ADMIN]), companyController.getCompany);
companyRoutes.patch("/company", authenticationMiddleware, rbacMiddleware([Role.ADMIN]), companyController.updateCompany);

export { companyRoutes };
