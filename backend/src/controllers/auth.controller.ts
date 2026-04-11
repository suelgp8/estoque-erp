import { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { AuthService } from "../services/auth.service";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(6).max(100)
});

const emptySchema = z.object({}).strict();

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  login = async (request: Request, response: Response) => {
    const payload = loginSchema.parse(request.body);
    const result = await this.authService.login(payload);

    response.status(200).json(result);
  };

  me = async (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);

    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    const user = await this.authService.me(request.authUser.userId);

    response.status(200).json({
      user
    });
  };

  forgotPassword = async (request: Request, response: Response) => {
    const payload = forgotPasswordSchema.parse(request.body);
    const result = await this.authService.forgotPassword(payload);

    response.status(200).json(result);
  };

  resetPassword = async (request: Request, response: Response) => {
    const payload = resetPasswordSchema.parse(request.body);
    const result = await this.authService.resetPassword(payload);

    response.status(200).json(result);
  };
}
