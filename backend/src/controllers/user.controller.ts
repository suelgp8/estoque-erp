import { Role } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { UserService } from "../services/user.service";
import { appIdArraySchema, appIdSchema } from "../validation/app-id";

const emptySchema = z.object({}).strict();

const paramsIdSchema = z.object({
  id: appIdSchema
});

const createUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().email(),
    password: z.string().min(6).max(100),
    role: z.nativeEnum(Role),
    allowedBaseIds: appIdArraySchema.optional()
  })
  .refine(
    (value) => {
      if (value.role === Role.ADMIN) {
        return true;
      }

      if (value.role === Role.GESTOR) {
        return (value.allowedBaseIds?.length ?? 0) >= 1;
      }

      return (value.allowedBaseIds?.length ?? 0) === 1;
    },
    {
      message: "Defina bases permitidas conforme o perfil: GESTOR (mínimo 1) e TÉCNICO (exatamente 1)",
      path: ["allowedBaseIds"]
    }
  );

const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().email().optional(),
    role: z.nativeEnum(Role).optional(),
    allowedBaseIds: appIdArraySchema.optional()
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.email !== undefined ||
      value.role !== undefined ||
      value.allowedBaseIds !== undefined,
    {
      message: "Informe ao menos um campo para atualização"
    }
  );

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().email().optional(),
    profilePhotoDataUrl: z
      .string()
      .trim()
      .max(600_000)
      .refine(
        (value) =>
          value.startsWith("data:image/jpeg;base64,") ||
          value.startsWith("data:image/png;base64,") ||
          value.startsWith("data:image/webp;base64,"),
        {
          message: "A foto deve estar em JPEG, PNG ou WebP"
        }
      )
      .nullable()
      .optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.email !== undefined || value.profilePhotoDataUrl !== undefined,
    {
      message: "Informe ao menos um campo para atualização"
    }
  );

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(100),
    newPassword: z.string().min(6).max(100)
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "A nova senha deve ser diferente da senha atual",
    path: ["newPassword"]
  });

export class UserController {
  constructor(private readonly userService: UserService) {}

  listUsers = async (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const users = await this.userService.listUsers(userId);

    response.status(200).json({ users });
  };

  createUser = async (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const payload = createUserSchema.parse(request.body);
    const user = await this.userService.createUser(userId, payload);

    response.status(201).json({ user });
  };

  updateUser = async (request: Request, response: Response) => {
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const params = paramsIdSchema.parse(request.params);
    const payload = updateUserSchema.parse(request.body);
    const user = await this.userService.updateUser(userId, params.id, payload);

    response.status(200).json({ user });
  };

  deleteUser = async (request: Request, response: Response) => {
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const params = paramsIdSchema.parse(request.params);
    emptySchema.parse(request.body ?? {});

    await this.userService.deleteUser(userId, params.id);

    response.status(200).json({
      message: "Usuário excluído com sucesso"
    });
  };

  getProfile = async (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);
    emptySchema.parse(request.body ?? {});

    const userId = this.requireAuthUserId(request);
    const user = await this.userService.getProfile(userId);

    response.status(200).json({ user });
  };

  updateProfile = async (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const payload = updateProfileSchema.parse(request.body);
    const user = await this.userService.updateProfile(userId, payload);

    response.status(200).json({ user });
  };

  changePassword = async (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const payload = changePasswordSchema.parse(request.body);

    await this.userService.changePassword(userId, payload);

    response.status(200).json({
      message: "Senha atualizada com sucesso"
    });
  };

  private requireAuthUserId(request: Request): string {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    return request.authUser.userId;
  }
}
