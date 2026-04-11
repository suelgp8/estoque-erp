import { Role } from "@prisma/client";
import { Router } from "express";
import { CategoryController } from "../controllers/category.controller";
import { authenticationMiddleware } from "../middlewares/authentication.middleware";
import { rbacMiddleware } from "../middlewares/rbac.middleware";
import { CategoryRepository } from "../repositories/category.repository";
import { CategoryService } from "../services/category.service";

const categoryRoutes = Router();

const categoryRepository = new CategoryRepository();
const categoryService = new CategoryService(categoryRepository);
const categoryController = new CategoryController(categoryService);

categoryRoutes.get(
  "/categories",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
  categoryController.listCategories
);

categoryRoutes.post(
  "/categories",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR]),
  categoryController.createCategory
);

categoryRoutes.patch(
  "/categories/:id",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR]),
  categoryController.updateCategory
);

categoryRoutes.delete(
  "/categories/:id",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR]),
  categoryController.deleteCategory
);

export { categoryRoutes };
