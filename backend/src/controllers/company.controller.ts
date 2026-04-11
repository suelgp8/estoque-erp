import { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { CompanyService } from "../services/company.service";

const emptySchema = z.object({}).strict();

const updateCompanySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    logoDataUrl: z
      .string()
      .trim()
      .max(900_000)
      .refine(
        (value) =>
          value.startsWith("data:image/jpeg;base64,") ||
          value.startsWith("data:image/png;base64,") ||
          value.startsWith("data:image/webp;base64,"),
        {
          message: "A logo deve estar em JPEG, PNG ou WebP"
        }
      )
      .nullable()
      .optional()
  })
  .refine((value) => value.name !== undefined || value.logoDataUrl !== undefined, {
    message: "Informe ao menos um campo para atualização"
  });

export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  getCompany = async (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);
    emptySchema.parse(request.body ?? {});

    const userId = this.requireAuthUserId(request);
    const company = await this.companyService.getCompany(userId);

    response.status(200).json({ company });
  };

  updateCompany = async (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);

    const userId = this.requireAuthUserId(request);
    const payload = updateCompanySchema.parse(request.body);
    const company = await this.companyService.updateCompany(userId, payload);

    response.status(200).json({ company });
  };

  private requireAuthUserId(request: Request): string {
    if (!request.authUser) {
      throw new AppError("Unauthorized", 401);
    }

    return request.authUser.userId;
  }
}
