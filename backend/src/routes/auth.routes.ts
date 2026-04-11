import { Role } from "@prisma/client";
import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authenticationMiddleware } from "../middlewares/authentication.middleware";
import { rbacMiddleware } from "../middlewares/rbac.middleware";
import { PasswordResetTokenRepository } from "../repositories/password-reset-token.repository";
import { UserRepository } from "../repositories/user.repository";
import { AuthService } from "../services/auth.service";
import { PasswordRecoveryNotificationService } from "../services/password-recovery-notification.service";

const authRoutes = Router();

const userRepository = new UserRepository();
const passwordResetTokenRepository = new PasswordResetTokenRepository();
const passwordRecoveryNotificationService = new PasswordRecoveryNotificationService();
const authService = new AuthService(userRepository, passwordResetTokenRepository, passwordRecoveryNotificationService);
const authController = new AuthController(authService);

authRoutes.post("/auth/login", authController.login);
authRoutes.post("/auth/forgot-password", authController.forgotPassword);
authRoutes.post("/auth/reset-password", authController.resetPassword);
authRoutes.get("/auth/me", authenticationMiddleware, rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]), authController.me);

export { authRoutes };
