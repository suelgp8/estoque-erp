import { Role } from "@prisma/client";
import { AppError } from "../errors/app-error";
import { BaseRepository } from "../repositories/base.repository";
import { ProductRepository, UserWithBaseAccess } from "../repositories/product.repository";
import { StockRepository } from "../repositories/stock.repository";
import { StockSnapshot, stockService } from "./stock.service";
import { resolveStockStatus, resolveStockThresholds, type StockStatus } from "./stock-status.service";

type StockConfigurationInput = {
  productId: string;
  baseId: string;
  minimumQuantity: number;
  idealQuantity: number;
};

export type StockByBasePayload = StockSnapshot & {
  status: StockStatus;
};

export class StockQueryService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly baseRepository: BaseRepository,
    private readonly stockRepository: StockRepository
  ) {}

  async getStockByBase(userId: string, productId: string, baseId: string): Promise<StockByBasePayload> {
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

    const stock = await stockService.getStock(productId, baseId);
    const { minimumQuantity, idealQuantity } = resolveStockThresholds({
      stock,
      legacyMinimumStock: product.minimumStock
    });

    return {
      productId: stock.productId,
      baseId: stock.baseId,
      quantity: stock.quantity,
      minimumQuantity,
      idealQuantity,
      status: resolveStockStatus({
        quantity: stock.quantity,
        minimumQuantity,
        idealQuantity
      })
    };
  }

  async updateStockConfiguration(userId: string, input: StockConfigurationInput): Promise<StockByBasePayload> {
    const user = await this.productRepository.findUserWithBaseAccessById(userId);

    if (!user) {
      throw new AppError("Unauthorized", 401);
    }

    if (user.role !== Role.ADMIN && user.role !== Role.GESTOR) {
      throw new AppError("Apenas ADMIN ou GESTOR podem realizar esta operacao", 403);
    }

    this.assertValidConfiguration(input.minimumQuantity, input.idealQuantity);

    const product = await this.productRepository.findByIdAndCompany(input.productId, user.companyId);

    if (!product) {
      throw new AppError("Produto nao encontrado", 404);
    }

    const base = await this.baseRepository.findByIdAndCompany(input.baseId, user.companyId);

    if (!base) {
      throw new AppError("Base nao encontrada", 404);
    }

    this.assertManagerCanManageBase(user, input.baseId);
    this.assertProductAllowedAtBase(product.baseAccesses.map((access) => access.baseId), input.baseId);

    const stock = await this.stockRepository.upsertConfiguration({
      companyId: user.companyId,
      productId: input.productId,
      baseId: input.baseId,
      minimumQuantity: input.minimumQuantity,
      idealQuantity: input.idealQuantity
    });

    return {
      productId: stock.productId,
      baseId: stock.baseId,
      quantity: stock.quantity,
      minimumQuantity: stock.minimumQuantity,
      idealQuantity: stock.idealQuantity,
      status: resolveStockStatus(stock)
    };
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

  private assertManagerCanManageBase(user: UserWithBaseAccess, baseId: string): void {
    if (user.role === Role.ADMIN) {
      return;
    }

    this.assertUserCanAccessBase(user, baseId);
  }

  private assertProductAllowedAtBase(productBaseIds: string[], baseId: string): void {
    if (!productBaseIds.includes(baseId)) {
      throw new AppError("Produto nao vinculado a esta base", 400);
    }
  }

  private assertValidConfiguration(minimumQuantity: number, idealQuantity: number): void {
    if (idealQuantity < minimumQuantity) {
      throw new AppError("Estoque ideal deve ser maior ou igual ao mínimo", 400);
    }
  }
}
