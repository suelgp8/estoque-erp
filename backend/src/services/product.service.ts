import { Role } from "@prisma/client";
import { AppError } from "../errors/app-error";
import { ReportExportService, TabularReport } from "./report-export.service";
import {
  CategoryWithBaseAccess,
  ProductRepository,
  ProductWithRelations,
  UserWithBaseAccess
} from "../repositories/product.repository";

type ReportFormat = "excel" | "pdf";

type ExportProductsFilters = {
  baseId?: string;
  categoryId?: string;
};

type CreateProductInput = {
  name: string;
  description?: string;
  minimumStock?: number;
  categoryId?: string;
  allowedBaseIds: string[];
};

type UpdateProductInput = {
  name?: string;
  description?: string | null;
  minimumStock?: number;
  categoryId?: string | null;
  allowedBaseIds?: string[];
};

type BaseAccessPayload = {
  id: string;
  name: string;
};

type StockBalancePayload = {
  baseId: string;
  quantity: number;
};

type ProductPayload = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  companyId: string;
  categoryId: string | null;
  category: {
    id: string;
    name: string;
  } | null;
  allowedBases: BaseAccessPayload[];
  minimumStock: number;
  stocksCount: number;
  stockQuantity: number;
  stockByBase: StockBalancePayload[];
  movementItemsCount: number;
  createdAt: string;
  updatedAt: string;
};

export class ProductService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly reportExportService: ReportExportService = new ReportExportService()
  ) {}

  async listProducts(userId: string): Promise<ProductPayload[]> {
    const user = await this.requireUserWithBaseAccess(userId);
    const products =
      user.role === Role.ADMIN
        ? await this.productRepository.listByCompany(user.companyId)
        : await this.productRepository.listByCompanyAndAllowedBaseIds(
            user.companyId,
            user.baseAccesses.map((access) => access.baseId)
          );

    return products.map((product) => this.serializeProduct(product));
  }

  async createProduct(userId: string, input: CreateProductInput): Promise<ProductPayload> {
    const user = await this.requireManagerWithBaseAccess(userId);
    const generatedSku = await this.productRepository.getNextNumericSku();
    const allowedBaseIds = await this.resolveAllowedBaseIds(user, input.allowedBaseIds);
    const category = input.categoryId
      ? await this.ensureCategoryBelongsToCompanyAndAllowsBases(input.categoryId, user.companyId, allowedBaseIds)
      : null;

    const createdProduct = await this.productRepository.create({
      name: input.name.trim(),
      sku: generatedSku,
      description: input.description?.trim() || null,
      minimumStock: input.minimumStock ?? 0,
      company: {
        connect: {
          id: user.companyId
        }
      },
      ...(category
        ? {
            category: {
              connect: {
                id: category.id
              }
            }
          }
        : {}),
      baseAccesses: {
        create: allowedBaseIds.map((baseId) => ({
          base: {
            connect: {
              id: baseId
            }
          }
        }))
      }
    });

    return this.serializeProduct(createdProduct);
  }

  async updateProduct(userId: string, productId: string, input: UpdateProductInput): Promise<ProductPayload> {
    const user = await this.requireManagerWithBaseAccess(userId);
    const existingProduct = await this.productRepository.findByIdAndCompany(productId, user.companyId);

    if (!existingProduct) {
      throw new AppError("Produto nao encontrado", 404);
    }

    this.ensureManagerCanManageProduct(user, existingProduct);

    const updateData: PrismaProductUpdateData = {};

    if (input.name !== undefined) {
      updateData.name = input.name.trim();
    }

    if (input.description !== undefined) {
      updateData.description = input.description?.trim() || null;
    }

    if (input.minimumStock !== undefined) {
      updateData.minimumStock = input.minimumStock;
    }

    const nextAllowedBaseIds =
      input.allowedBaseIds !== undefined
        ? await this.resolveAllowedBaseIds(user, input.allowedBaseIds)
        : existingProduct.baseAccesses.map((access) => access.baseId);

    if (input.allowedBaseIds !== undefined) {
      const stockOutsideAllowedBases = await this.productRepository.countStockWithPositiveQuantityOutsideAllowedBases(
        existingProduct.id,
        nextAllowedBaseIds
      );

      if (stockOutsideAllowedBases > 0) {
        throw new AppError(
          "Nao e possivel remover bases que ainda possuem estoque positivo para este produto",
          400
        );
      }

      updateData.baseAccesses = {
        deleteMany: {},
        create: nextAllowedBaseIds.map((baseId) => ({
          base: {
            connect: {
              id: baseId
            }
          }
        }))
      };
    }

    if (input.categoryId !== undefined) {
      if (input.categoryId === null) {
        updateData.category = {
          disconnect: true
        };
      } else {
        const category = await this.ensureCategoryBelongsToCompanyAndAllowsBases(
          input.categoryId,
          user.companyId,
          nextAllowedBaseIds
        );

        updateData.category = {
          connect: {
            id: category.id
          }
        };
      }
    } else if (existingProduct.categoryId) {
      await this.ensureCategoryBelongsToCompanyAndAllowsBases(existingProduct.categoryId, user.companyId, nextAllowedBaseIds);
    }

    const updatedProduct = await this.productRepository.updateById(existingProduct.id, updateData);

    return this.serializeProduct(updatedProduct);
  }

  async deleteProduct(userId: string, productId: string): Promise<void> {
    const user = await this.requireManagerWithBaseAccess(userId);
    const existingProduct = await this.productRepository.findByIdAndCompany(productId, user.companyId);

    if (!existingProduct) {
      throw new AppError("Produto nao encontrado", 404);
    }

    this.ensureManagerCanManageProduct(user, existingProduct);

    const stockWithQuantity = await this.productRepository.countStockWithPositiveQuantity(existingProduct.id);

    if (stockWithQuantity > 0) {
      throw new AppError("Nao e possivel excluir produto com estoque positivo", 400);
    }

    const movementItems = await this.productRepository.countMovementItems(existingProduct.id);

    if (movementItems > 0) {
      throw new AppError("Nao e possivel excluir produto com movimentacoes vinculadas", 400);
    }

    await this.productRepository.deleteById(existingProduct.id);
  }

  async exportProductsTable(userId: string, filters: ExportProductsFilters, format: ReportFormat) {
    const user = await this.requireUserWithBaseAccess(userId);
    const products = await this.listProducts(userId);
    const { baseId, categoryId } = filters;

    if (baseId && user.role !== Role.ADMIN) {
      const hasBaseAccess = user.baseAccesses.some((access) => access.baseId === baseId);

      if (!hasBaseAccess) {
        throw new AppError("Voce nao possui acesso a esta base", 403);
      }
    }

    const filteredProducts = baseId
      ? products.filter((product) => product.allowedBases.some((base) => base.id === baseId))
      : products;
    const filteredByCategoryProducts = categoryId
      ? filteredProducts.filter((product) => product.categoryId === categoryId)
      : filteredProducts;
    const rows = this.buildGroupedProductReportRows(filteredByCategoryProducts, baseId);

    const report: TabularReport = {
      title: baseId ? "Produtos por Base" : "Produtos e Estoque",
      generatedAt: new Date(),
      pdfHeader: {
        companyName: user.company.name,
        companyLogoDataUrl: user.company.logoDataUrl ?? null,
        contextLines: [
          `Base: ${await this.resolveBaseLabel(user.companyId, baseId)}`,
          `Categoria: ${await this.resolveCategoryLabel(user.companyId, categoryId)}`
        ]
      },
      columns: [
        { header: "Produto", key: "productName", width: 28 },
        { header: "Categoria", key: "category", width: 22 },
        { header: "Bases", key: "bases", width: 22 },
        { header: "Estoque Atual", key: "stockQuantity", width: 14 },
        { header: "Estoque Minimo", key: "minimumStock", width: 16 },
        { header: "Status", key: "stockStatus", width: 16 }
      ],
      rows,
    };

    return this.exportReportByFormat(report, "produtos-estoque", format);
  }

  private async resolveAllowedBaseIds(user: UserWithBaseAccess, baseIds: string[]): Promise<string[]> {
    const normalizedBaseIds = Array.from(new Set(baseIds.map((baseId) => baseId.trim()).filter((baseId) => baseId.length > 0)));

    if (normalizedBaseIds.length === 0) {
      throw new AppError("Selecione ao menos uma base para o produto", 400);
    }

    const validBasesCount = await this.productRepository.countBasesByIds(user.companyId, normalizedBaseIds);

    if (validBasesCount !== normalizedBaseIds.length) {
      throw new AppError("Uma ou mais bases informadas sao invalidas para a empresa", 400);
    }

    if (user.role !== Role.ADMIN) {
      const allowedBaseIds = new Set(user.baseAccesses.map((access) => access.baseId));
      const hasForbiddenBase = normalizedBaseIds.some((baseId) => !allowedBaseIds.has(baseId));

      if (hasForbiddenBase) {
        throw new AppError("Voce nao possui permissao para vincular este produto as bases selecionadas", 403);
      }
    }

    return normalizedBaseIds;
  }

  private async ensureCategoryBelongsToCompanyAndAllowsBases(
    categoryId: string,
    companyId: string,
    allowedBaseIds: string[]
  ): Promise<CategoryWithBaseAccess> {
    const category = await this.productRepository.findCategoryByIdAndCompanyWithBaseAccess(categoryId, companyId);

    if (!category) {
      throw new AppError("Categoria invalida para esta empresa", 400);
    }

    const categoryBaseIds = new Set(category.baseAccesses.map((access) => access.baseId));
    const hasInvalidBase = allowedBaseIds.some((baseId) => !categoryBaseIds.has(baseId));

    if (hasInvalidBase) {
      throw new AppError("O produto so pode usar bases ja permitidas para a categoria selecionada", 400);
    }

    return category;
  }

  private async resolveBaseLabel(companyId: string, baseId?: string): Promise<string> {
    if (!baseId) {
      return "Todas as bases";
    }

    const base = await this.productRepository.findBaseByIdAndCompany(baseId, companyId);
    return base?.name ?? baseId;
  }

  private async resolveCategoryLabel(companyId: string, categoryId?: string): Promise<string> {
    if (!categoryId) {
      return "Todas as categorias";
    }

    const category = await this.productRepository.findCategoryByIdAndCompany(categoryId, companyId);
    return category?.name ?? categoryId;
  }

  private async requireUserWithBaseAccess(userId: string): Promise<UserWithBaseAccess> {
    const user = await this.productRepository.findUserWithBaseAccessById(userId);

    if (!user) {
      throw new AppError("Unauthorized", 401);
    }

    return user;
  }

  private async requireManagerWithBaseAccess(userId: string): Promise<UserWithBaseAccess> {
    const user = await this.requireUserWithBaseAccess(userId);

    if (user.role !== Role.ADMIN && user.role !== Role.GESTOR) {
      throw new AppError("Apenas ADMIN ou GESTOR podem realizar esta operacao", 403);
    }

    return user;
  }

  private ensureManagerCanManageProduct(user: UserWithBaseAccess, product: ProductWithRelations): void {
    if (user.role === Role.ADMIN) {
      return;
    }

    const allowedBaseIds = new Set(user.baseAccesses.map((access) => access.baseId));
    const hasPartialAccess = product.baseAccesses.some((access) => !allowedBaseIds.has(access.baseId));

    if (hasPartialAccess) {
      throw new AppError("Voce nao possui acesso completo a todas as bases deste produto", 403);
    }
  }

  private serializeProduct(product: ProductWithRelations): ProductPayload {
    const stockByBase = product.stocks.map((stock) => ({
      baseId: stock.baseId,
      quantity: stock.quantity
    }));
    const stockQuantity = stockByBase.reduce((total, stock) => total + stock.quantity, 0);

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      description: product.description,
      companyId: product.companyId,
      categoryId: product.categoryId,
      category: product.category
        ? {
            id: product.category.id,
            name: product.category.name
          }
        : null,
      allowedBases: product.baseAccesses.map((access) => ({
        id: access.base.id,
        name: access.base.name
      })),
      minimumStock: product.minimumStock,
      stocksCount: product._count.stocks,
      stockQuantity,
      stockByBase,
      movementItemsCount: product._count.movementItems,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString()
    };
  }

  private resolveDisplayedStockQuantity(product: ProductPayload, baseId?: string): number {
    if (!baseId) {
      return product.stockQuantity;
    }

    return product.stockByBase.find((stock) => stock.baseId === baseId)?.quantity ?? 0;
  }

  private resolveProductBaseSummary(product: ProductPayload, baseId?: string): string {
    if (baseId) {
      return product.allowedBases.find((base) => base.id === baseId)?.name ?? "-";
    }

    if (product.allowedBases.length === 1) {
      return product.allowedBases[0]?.name ?? "-";
    }

    return `${product.allowedBases.length} bases vinculadas`;
  }

  private resolveStockHealthLabel(stockQuantity: number, minimumStock: number): string {
    if (stockQuantity === 0) {
      return "Estoque zerado";
    }

    if (stockQuantity <= minimumStock) {
      return "Estoque baixo";
    }

    return "Estoque bom";
  }

  private buildGroupedProductReportRows(products: ProductPayload[], baseId?: string): Array<Record<string, string | number>> {
    const groupedProducts = new Map<string, ProductPayload[]>();

    for (const product of [...products].sort((left, right) => {
      const leftCategory = left.category?.name ?? "Sem categoria";
      const rightCategory = right.category?.name ?? "Sem categoria";

      return leftCategory.localeCompare(rightCategory, "pt-BR") || left.name.localeCompare(right.name, "pt-BR");
    })) {
      const categoryName = product.category?.name ?? "Sem categoria";
      const categoryProducts = groupedProducts.get(categoryName) ?? [];
      categoryProducts.push(product);
      groupedProducts.set(categoryName, categoryProducts);
    }

    const rows: Array<Record<string, string | number>> = [];

    for (const [categoryName, categoryProducts] of groupedProducts.entries()) {
      rows.push({
        __rowType: "section",
        __sectionTitle: categoryName,
        productName: "",
        sku: "",
        category: "",
        bases: "",
        stockQuantity: "",
        minimumStock: "",
        stockStatus: "",
        updatedAt: ""
      });

      for (const product of categoryProducts) {
        const stockQuantity = this.resolveDisplayedStockQuantity(product, baseId);

        rows.push({
          productName: product.name,
          sku: product.sku,
          category: "",
          bases: this.resolveProductBaseSummary(product, baseId),
          stockQuantity,
          minimumStock: product.minimumStock,
          stockStatus: this.resolveStockHealthLabel(stockQuantity, product.minimumStock),
          updatedAt: product.updatedAt
        });
      }
    }

    return rows;
  }

  private async exportReportByFormat(report: TabularReport, baseFileName: string, format: ReportFormat) {
    if (format === "excel") {
      const buffer = await this.reportExportService.generateExcel(report);

      return {
        fileName: `${baseFileName}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer,
      };
    }

    const buffer = await this.reportExportService.generatePdf(report);

    return {
      fileName: `${baseFileName}.pdf`,
      contentType: "application/pdf",
      buffer,
    };
  }
}

type PrismaProductUpdateData = {
  name?: string;
  description?: string | null;
  minimumStock?: number;
  category?:
    | {
        connect: {
          id: string;
        };
      }
    | {
        disconnect: true;
      };
  baseAccesses?: {
    deleteMany: Record<string, never>;
    create: Array<{
      base: {
        connect: {
          id: string;
        };
      };
    }>;
  };
};
