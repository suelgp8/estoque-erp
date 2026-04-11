import { Role } from "@prisma/client";
import { AppError } from "../errors/app-error";
import { BaseRepository } from "../repositories/base.repository";
import { ProductRepository, UserWithBaseAccess } from "../repositories/product.repository";
import { StockSnapshot, stockService } from "./stock.service";

export class StockQueryService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly baseRepository: BaseRepository
  ) {}

  async getStockByBase(userId: string, productId: string, baseId: string): Promise<StockSnapshot> {
    const user = await this.productRepository.findUserWithBaseAccessById(userId);

    if (!user) {
      throw new AppError("Unauthorized", 401);
    }

    const product = await this.productRepository.findByIdAndCompany(productId, user.companyId);

    if (!product) {
      throw new AppError("Produto nao encontrado", 404);
    }

    const base = await this.baseRepository.findByIdAndCompany(baseId, user.companyId);

    if (!base) {
      throw new AppError("Base nao encontrada", 404);
    }

    this.assertUserCanAccessBase(user, baseId);

    const productAllowedAtBase = product.baseAccesses.some((access) => access.baseId === baseId);

    if (!productAllowedAtBase) {
      throw new AppError("Produto nao vinculado a esta base", 400);
    }

    return stockService.getStock(productId, baseId);
  }

  private assertUserCanAccessBase(user: UserWithBaseAccess, baseId: string): void {
    if (user.role === Role.ADMIN) {
      return;
    }

    const hasBaseAccess = user.baseAccesses.some((access) => access.baseId === baseId);

    if (!hasBaseAccess) {
      throw new AppError("Voce nao possui acesso a esta base", 403);
    }
  }
}
