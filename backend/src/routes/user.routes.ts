import { Role } from "@prisma/client";
import { Router } from "express";
import { UserController } from "../controllers/user.controller";
import { authenticationMiddleware } from "../middlewares/authentication.middleware";
import { rbacMiddleware } from "../middlewares/rbac.middleware";
import { UserRepository } from "../repositories/user.repository";
import { UserService } from "../services/user.service";

const userRoutes = Router();

const userRepository = new UserRepository();
const userService = new UserService(userRepository);
const userController = new UserController(userService);

userRoutes.get("/users", authenticationMiddleware, rbacMiddleware([Role.ADMIN]), userController.listUsers);
userRoutes.post("/users", authenticationMiddleware, rbacMiddleware([Role.ADMIN]), userController.createUser);
userRoutes.patch("/users/:id", authenticationMiddleware, rbacMiddleware([Role.ADMIN]), userController.updateUser);
userRoutes.delete("/users/:id", authenticationMiddleware, rbacMiddleware([Role.ADMIN]), userController.deleteUser);

userRoutes.get(
  "/profile",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
  userController.getProfile
);

userRoutes.patch(
  "/profile",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
  userController.updateProfile
);

userRoutes.patch(
  "/profile/password",
  authenticationMiddleware,
  rbacMiddleware([Role.ADMIN, Role.GESTOR, Role.TECNICO]),
  userController.changePassword
);

export { userRoutes };
