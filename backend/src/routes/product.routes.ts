import { Role } from "@prisma/client";
import { Router } from "express";
import { ProductController } from "../controllers/product.controller";
import { authenticationMiddleware } from "../middlewares/authentication.middleware";
import { rbacMiddleware } from "../middlewares/rbac.middleware";
import { ProductRepository } from "../repositories/product.repository";
import { ProductService } from "../services/product.service";

const productRoutes = Router();

const productRepository = new ProductRepository();
const productService = new ProductService(productRepository);
const productController = new ProductController(productService);

productRoutes.get(
  "/products",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
  productController.listProducts
);

productRoutes.get(
  "/products/export/:format",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
  productController.exportProducts
);

productRoutes.post(
  "/products",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR]),
  productController.createProduct
);

productRoutes.patch(
  "/products/:id",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR]),
  productController.updateProduct
);

productRoutes.delete(
  "/products/:id",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR]),
  productController.deleteProduct
);

export { productRoutes };
