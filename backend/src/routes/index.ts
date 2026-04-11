import { Router } from "express";
import { authRoutes } from "./auth.routes";
import { baseRoutes } from "./base.routes";
import { categoryRoutes } from "./category.routes";
import { companyRoutes } from "./company.routes";
import { healthRoutes } from "./health.routes";
import { productRoutes } from "./product.routes";
import { reportRoutes } from "./report.routes";
import { stockRoutes } from "./stock.routes";
import { stockMovementRoutes } from "./stock-movement.routes";
import { userRoutes } from "./user.routes";

const routes = Router();

routes.use(healthRoutes);
routes.use(authRoutes);
routes.use(companyRoutes);
routes.use(userRoutes);
routes.use(baseRoutes);
routes.use(categoryRoutes);
routes.use(productRoutes);
routes.use(stockRoutes);
routes.use(stockMovementRoutes);
routes.use(reportRoutes);

export { routes };
