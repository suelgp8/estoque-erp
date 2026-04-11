import { Router } from "express";
import { HealthController } from "../controllers/health.controller";
import { HealthService } from "../services/health.service";
import { HealthRepository } from "../repositories/health.repository";

const healthRoutes = Router();

const healthRepository = new HealthRepository();
const healthService = new HealthService(healthRepository);
const healthController = new HealthController(healthService);

healthRoutes.get("/health", healthController.getHealth);

export { healthRoutes };