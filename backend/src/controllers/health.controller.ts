import { Request, Response } from "express";
import { z } from "zod";
import { HealthService } from "../services/health.service";

const emptySchema = z.object({}).strict();

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  getHealth = (request: Request, response: Response) => {
    emptySchema.parse(request.params);
    emptySchema.parse(request.query);

    const payload = this.healthService.getHealth();

    response.status(200).json(payload);
  };
}
