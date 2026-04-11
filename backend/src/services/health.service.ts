import { HealthRepository } from "../repositories/health.repository";

export class HealthService {
  constructor(private readonly healthRepository: HealthRepository) {}

  getHealth() {
    return this.healthRepository.getStatus();
  }
}