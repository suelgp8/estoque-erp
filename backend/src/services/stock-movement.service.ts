import { Prisma, Role, StockMovementStatus, StockMovementType } from "@prisma/client";
import { AppError } from "../errors/app-error";
import {
  StockMovementRepository,
  StockMovementWithRelations,
  UserWithBaseAccess
} from "../repositories/stock-movement.repository";
import { ReportExportService, TabularReport } from "./report-export.service";
import { StockService, StockServiceTransaction, stockService as defaultStockService } from "./stock.service";

type ReportFormat = "excel" | "pdf";

type CreateStockMovementInput = {
  type: StockMovementType;
  sourceBaseId?: string;
  destinationBaseId?: string;
  reason?: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
};

type CreateTransferBetweenBasesInput = {
  productId: string;
  fromBaseId: string;
  toBaseId: string;
  quantity: number;
  technicianId: string;
};

type TransferBetweenBasesPayload = {
  productId: string;
  fromBaseId: string;
  toBaseId: string;
  quantity: number;
  technicianId: string;
  movement: {
    id: string;
    type: string;
    productId: string;
    fromBaseId: string | null;
    toBaseId: string | null;
    technicianId: string | null;
    quantity: number;
    createdAt: string;
    updatedAt: string;
  };
  sourceStock: {
    productId: string;
    baseId: string;
    quantity: number;
  };
  destinationStock: {
    productId: string;
    baseId: string;
    quantity: number;
  };
};

type MovementDetailPayload = {
  id: string;
  type: StockMovementType;
  status: StockMovementStatus;
  reason: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  reversalReason: string | null;
  sourceBase: {
    id: string;
    name: string;
  } | null;
  destinationBase: {
    id: string;
    name: string;
  } | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  approvedBy: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
  items: Array<{
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
  }>;
  totalQuantity: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  originalMovementId: string | null;
  reversalMovementId: string | null;
  permissions: {
    canApprove: boolean;
    canReject: boolean;
    canConfirmTransfer: boolean;
    canCancel: boolean;
    canReverse: boolean;
  };
};

export class StockMovementService {
  constructor(
    private readonly movementRepository: StockMovementRepository,
    private readonly reportExportService: ReportExportService,
    private readonly stockService: StockService = defaultStockService
  ) {}

  async create(userId: string, input: CreateStockMovementInput): Promise<StockMovementWithRelations> {
    const normalizedItems = this.normalizeItems(input.items);

    return this.movementRepository.withTransaction(async (tx) => {
      const user = await this.movementRepository.findUserWithBaseAccessById(tx, userId);

      if (!user) {
        throw new AppError("Unauthorized", 401);
      }

      this.assertUserCanCreateMovement(user, input.type, input.sourceBaseId, input.destinationBaseId);

      await this.validateEntities(tx, user.companyId, normalizedItems, input.sourceBaseId, input.destinationBaseId, input.type);

      const status = this.getInitialStatus(input.type, user.role);
      const now = new Date();

      const movement = await this.movementRepository.createMovement(tx, {
        type: input.type,
        status,
        reason: input.reason,
        companyId: user.companyId,
        createdById: user.id,
        sourceBaseId: input.sourceBaseId,
        destinationBaseId: input.destinationBaseId,
        completedAt: status === StockMovementStatus.COMPLETED ? now : undefined,
        items: normalizedItems
      });

      await this.movementRepository.createLog(tx, {
        companyId: user.companyId,
        userId: user.id,
        entityType: "StockMovement",
        entityId: movement.id,
        action: `MOVEMENT_CREATED_${movement.type}_${movement.status}`,
        metadata: {
          sourceBaseId: movement.sourceBaseId,
          destinationBaseId: movement.destinationBaseId,
          items: movement.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity
          }))
        }
      });

      if (status === StockMovementStatus.COMPLETED) {
        await this.applyCompletedMovement(movement);
      }

      return movement;
    });
  }

  async createTransfer(userId: string, input: CreateTransferBetweenBasesInput): Promise<TransferBetweenBasesPayload> {
    await this.movementRepository.withTransaction(async (tx) => {
      const requester = await this.movementRepository.findUserWithBaseAccessById(tx, userId);

      if (!requester) {
        throw new AppError("Unauthorized", 401);
      }

      const technician = await this.movementRepository.findUserWithBaseAccessById(tx, input.technicianId);

      if (!technician || technician.companyId !== requester.companyId) {
        throw new AppError("Tecnico nao encontrado para a empresa informada", 404);
      }

      if (technician.role !== Role.TECNICO) {
        throw new AppError("technicianId deve pertencer a um usuario TECNICO", 400);
      }

      this.assertUserCanCreateTransferForTechnician(requester, technician);
      this.assertUserCanCompleteImmediateTransfer(requester, input.fromBaseId, input.toBaseId);
      this.assertUserCanCompleteImmediateTransfer(technician, input.fromBaseId, input.toBaseId);

      await this.validateEntities(
        tx,
        requester.companyId,
        [{ productId: input.productId, quantity: input.quantity }],
        input.fromBaseId,
        input.toBaseId,
        StockMovementType.TRANSFER
      );
    });

    const transfer = await this.stockService.transferStock(
      input.productId,
      input.fromBaseId,
      input.toBaseId,
      input.quantity,
      input.technicianId
    );

    return {
      productId: input.productId,
      fromBaseId: input.fromBaseId,
      toBaseId: input.toBaseId,
      quantity: input.quantity,
      technicianId: input.technicianId,
      movement: {
        id: transfer.movement.id,
        type: transfer.movement.type,
        productId: transfer.movement.productId,
        fromBaseId: transfer.movement.fromBaseId,
        toBaseId: transfer.movement.toBaseId,
        technicianId: transfer.movement.technicianId,
        quantity: transfer.movement.quantity,
        createdAt: transfer.movement.createdAt.toISOString(),
        updatedAt: transfer.movement.updatedAt.toISOString()
      },
      sourceStock: {
        productId: transfer.sourceStock.productId,
        baseId: transfer.sourceStock.baseId,
        quantity: transfer.sourceStock.quantity
      },
      destinationStock: {
        productId: transfer.destinationStock.productId,
        baseId: transfer.destinationStock.baseId,
        quantity: transfer.destinationStock.quantity
      }
    };
  }

  async getDetails(userId: string, movementId: string): Promise<MovementDetailPayload> {
    return this.movementRepository.withTransaction(async (tx) => {
      const user = await this.movementRepository.findUserWithBaseAccessById(tx, userId);

      if (!user) {
        throw new AppError("Unauthorized", 401);
      }

      const movement = await this.movementRepository.findMovementById(tx, movementId, user.companyId);

      if (!movement) {
        throw new AppError("Stock movement not found", 404);
      }

      this.assertUserCanViewMovement(user, movement);

      return this.serializeMovement(user, movement);
    });
  }

  async exportMovement(userId: string, movementId: string, format: ReportFormat) {
    return this.movementRepository.withTransaction(async (tx) => {
      const user = await this.movementRepository.findUserWithBaseAccessById(tx, userId);

      if (!user) {
        throw new AppError("Unauthorized", 401);
      }

      const movement = await this.movementRepository.findMovementById(tx, movementId, user.companyId);

      if (!movement) {
        throw new AppError("Stock movement not found", 404);
      }

      this.assertUserCanViewMovement(user, movement);

      const detail = this.serializeMovement(user, movement);
      const report = this.buildMovementReport(detail, {
        companyName: user.company.name,
        companyLogoDataUrl: user.company.logoDataUrl ?? null
      });

      if (format === "excel") {
        const buffer = await this.reportExportService.generateExcel(report);

        return {
          fileName: `movimentacao-${detail.id}.xlsx`,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer
        };
      }

      const buffer = await this.reportExportService.generatePdf(report);

      return {
        fileName: `movimentacao-${detail.id}.pdf`,
        contentType: "application/pdf",
        buffer
      };
    });
  }

  async approve(reviewerUserId: string, movementId: string): Promise<StockMovementWithRelations> {
    return this.movementRepository.withTransaction(async (tx) => {
      const reviewer = await this.movementRepository.findUserWithBaseAccessById(tx, reviewerUserId);

      if (!reviewer) {
        throw new AppError("Unauthorized", 401);
      }

      if (reviewer.role === Role.TECNICO) {
        throw new AppError("Only ADMIN or GESTOR can approve movements", 403);
      }

      const movement = await this.movementRepository.findMovementById(tx, movementId, reviewer.companyId);

      if (!movement) {
        throw new AppError("Stock movement not found", 404);
      }

      this.assertUserCanModerateMovement(reviewer, movement);

      if (movement.type === StockMovementType.ENTRY) {
        throw new AppError("ENTRY movements are automatic and cannot be approved", 400);
      }

      if (movement.type === StockMovementType.TRANSFER) {
        throw new AppError(
          "TRANSFER movements must be validated by a destination base manager using transfer confirmation",
          400
        );
      }

      if (movement.status !== StockMovementStatus.PENDING) {
        throw new AppError("Only pending movements can be approved", 400);
      }

      const now = new Date();

      if (movement.type === StockMovementType.EXIT) {
        const updatedMovement = await this.movementRepository.updateMovement(tx, movement.id, {
          status: StockMovementStatus.COMPLETED,
          approvedById: reviewer.id,
          approvedAt: now,
          completedAt: now,
          rejectionReason: null
        });

        await this.movementRepository.createLog(tx, {
          companyId: reviewer.companyId,
          userId: reviewer.id,
          entityType: "StockMovement",
          entityId: movement.id,
          action: "MOVEMENT_APPROVED_EXIT",
          metadata: {
            previousStatus: movement.status,
            currentStatus: updatedMovement.status
          }
        });

        await this.applyCompletedMovement(updatedMovement);

        return updatedMovement;
      }
      
      throw new AppError("Unsupported stock movement type for approval", 400);
    });
  }

  async reject(reviewerUserId: string, movementId: string, reason: string): Promise<StockMovementWithRelations> {
    return this.movementRepository.withTransaction(async (tx) => {
      const reviewer = await this.movementRepository.findUserWithBaseAccessById(tx, reviewerUserId);

      if (!reviewer) {
        throw new AppError("Unauthorized", 401);
      }

      if (reviewer.role === Role.TECNICO) {
        throw new AppError("Only ADMIN or GESTOR can reject movements", 403);
      }

      const movement = await this.movementRepository.findMovementById(tx, movementId, reviewer.companyId);

      if (!movement) {
        throw new AppError("Stock movement not found", 404);
      }

      if (movement.type === StockMovementType.TRANSFER) {
        this.assertUserCanReviewTransferFromDestination(reviewer, movement);
      } else {
        this.assertUserCanModerateMovement(reviewer, movement);
      }

      if (movement.type === StockMovementType.ENTRY) {
        throw new AppError("ENTRY movements are automatic and cannot be rejected", 400);
      }

      if (movement.type === StockMovementType.EXIT && movement.status !== StockMovementStatus.PENDING) {
        throw new AppError("Only pending EXIT movements can be rejected", 400);
      }

      if (
        movement.type === StockMovementType.TRANSFER &&
        movement.status !== StockMovementStatus.PENDING &&
        movement.status !== StockMovementStatus.APPROVED
      ) {
        throw new AppError("Only pending or approved TRANSFER movements can be rejected", 400);
      }

      const now = new Date();
      const updatedMovement = await this.movementRepository.updateMovement(tx, movement.id, {
        status: StockMovementStatus.REJECTED,
        approvedById: reviewer.id,
        approvedAt: now,
        rejectionReason: reason,
        completedAt: null
      });

      await this.movementRepository.createLog(tx, {
        companyId: reviewer.companyId,
        userId: reviewer.id,
        entityType: "StockMovement",
        entityId: movement.id,
        action: "MOVEMENT_REJECTED",
        metadata: {
          previousStatus: movement.status,
          currentStatus: updatedMovement.status,
          reason
        }
      });

      return updatedMovement;
    });
  }

  async cancel(userId: string, movementId: string, reason: string): Promise<StockMovementWithRelations> {
    return this.movementRepository.withTransaction(async (tx) => {
      const user = await this.movementRepository.findUserWithBaseAccessById(tx, userId);

      if (!user) {
        throw new AppError("Unauthorized", 401);
      }

      const movement = await this.movementRepository.findMovementById(tx, movementId, user.companyId);

      if (!movement) {
        throw new AppError("Stock movement not found", 404);
      }

      const canCancelApprovedTransfer =
        movement.type === StockMovementType.TRANSFER && movement.status === StockMovementStatus.APPROVED;

      if (movement.status !== StockMovementStatus.PENDING && !canCancelApprovedTransfer) {
        throw new AppError("Only pending movements or approved transfers can be canceled", 400);
      }

      this.assertUserCanCancelMovement(user, movement);

      const updatedMovement = await this.movementRepository.updateMovement(tx, movement.id, {
        status: StockMovementStatus.CANCELED,
        cancellationReason: reason,
        rejectionReason: null,
        completedAt: null
      });

      await this.movementRepository.createLog(tx, {
        companyId: user.companyId,
        userId: user.id,
        entityType: "StockMovement",
        entityId: movement.id,
        action: "MOVEMENT_CANCELED",
        metadata: {
          previousStatus: movement.status,
          currentStatus: updatedMovement.status,
          reason
        }
      });

      return updatedMovement;
    });
  }

  async reverse(userId: string, movementId: string, reason: string): Promise<StockMovementWithRelations> {
    return this.movementRepository.withTransaction(async (tx) => {
      const user = await this.movementRepository.findUserWithBaseAccessById(tx, userId);

      if (!user) {
        throw new AppError("Unauthorized", 401);
      }

      const movement = await this.movementRepository.findMovementById(tx, movementId, user.companyId);

      if (!movement) {
        throw new AppError("Stock movement not found", 404);
      }

      if (movement.status !== StockMovementStatus.COMPLETED) {
        throw new AppError("Only completed movements can be reversed", 400);
      }

      if (movement.originalMovementId) {
        throw new AppError("Reversal movements cannot be reversed again", 400);
      }

      if (movement.reversalMovement) {
        throw new AppError("This movement has already been reversed", 400);
      }

      this.assertUserCanReverseMovement(user, movement);

      const reversalType = this.getReversalMovementType(movement.type);
      const reversalSourceBaseId = this.getReversalSourceBaseId(movement);
      const reversalDestinationBaseId = this.getReversalDestinationBaseId(movement);
      const reversalItems = movement.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity
      }));

      await this.validateEntities(
        tx,
        movement.companyId,
        reversalItems,
        reversalSourceBaseId,
        reversalDestinationBaseId,
        reversalType
      );

      const now = new Date();
      const reversalMovement = await this.movementRepository.createMovement(tx, {
        type: reversalType,
        status: StockMovementStatus.COMPLETED,
        reason: this.buildReversalMovementReason(movement.id, reason),
        companyId: movement.companyId,
        createdById: user.id,
        approvedById: user.id,
        sourceBaseId: reversalSourceBaseId,
        destinationBaseId: reversalDestinationBaseId,
        originalMovementId: movement.id,
        approvedAt: now,
        completedAt: now,
        items: reversalItems
      });

      const updatedMovement = await this.movementRepository.updateMovement(tx, movement.id, {
        status: StockMovementStatus.REVERSED,
        reversalReason: reason
      });

      await this.movementRepository.createLog(tx, {
        companyId: user.companyId,
        userId: user.id,
        entityType: "StockMovement",
        entityId: movement.id,
        action: "MOVEMENT_REVERSED",
        metadata: {
          previousStatus: movement.status,
          currentStatus: updatedMovement.status,
          reason,
          reversalMovementId: reversalMovement.id
        }
      });

      await this.movementRepository.createLog(tx, {
        companyId: user.companyId,
        userId: user.id,
        entityType: "StockMovement",
        entityId: reversalMovement.id,
        action: "MOVEMENT_REVERSAL_CREATED",
        metadata: {
          originalMovementId: movement.id,
          type: reversalMovement.type,
          status: reversalMovement.status
        }
      });

      await this.applyCompletedMovement(reversalMovement);

      return updatedMovement;
    });
  }

  async confirmTransfer(userId: string, movementId: string): Promise<StockMovementWithRelations> {
    return this.movementRepository.withTransaction(async (tx) => {
      const user = await this.movementRepository.findUserWithBaseAccessById(tx, userId);

      if (!user) {
        throw new AppError("Unauthorized", 401);
      }

      if (user.role === Role.TECNICO) {
        throw new AppError("Only ADMIN or GESTOR can confirm transfer", 403);
      }

      const movement = await this.movementRepository.findMovementById(tx, movementId, user.companyId);

      if (!movement) {
        throw new AppError("Stock movement not found", 404);
      }

      this.assertUserCanConfirmTransfer(user, movement);

      if (movement.type !== StockMovementType.TRANSFER) {
        throw new AppError("Only TRANSFER movements can be confirmed", 400);
      }

      if (movement.status !== StockMovementStatus.PENDING && movement.status !== StockMovementStatus.APPROVED) {
        throw new AppError("Only pending or approved TRANSFER movements can be confirmed", 400);
      }

      const now = new Date();
      const updatedMovement = await this.movementRepository.updateMovement(tx, movement.id, {
        status: StockMovementStatus.COMPLETED,
        approvedById: user.id,
        approvedAt: now,
        completedAt: now,
        rejectionReason: null
      });

      await this.movementRepository.createLog(tx, {
        companyId: user.companyId,
        userId: user.id,
        entityType: "StockMovement",
        entityId: movement.id,
        action: "MOVEMENT_TRANSFER_CONFIRMED",
        metadata: {
          previousStatus: movement.status,
          currentStatus: updatedMovement.status
        }
      });

      await this.applyCompletedMovement(updatedMovement);

      return updatedMovement;
    });
  }

  private normalizeItems(items: Array<{ productId: string; quantity: number }>) {
    const aggregatedItems = new Map<string, number>();

    for (const item of items) {
      const previousValue = aggregatedItems.get(item.productId) ?? 0;
      aggregatedItems.set(item.productId, previousValue + item.quantity);
    }

    return Array.from(aggregatedItems.entries()).map(([productId, quantity]) => ({
      productId,
      quantity
    }));
  }

  private getInitialStatus(type: StockMovementType, role: Role): StockMovementStatus {
    if (type === StockMovementType.ENTRY) {
      return StockMovementStatus.COMPLETED;
    }

    if (type === StockMovementType.EXIT) {
      return role === Role.TECNICO ? StockMovementStatus.PENDING : StockMovementStatus.COMPLETED;
    }

    return StockMovementStatus.PENDING;
  }

  private async validateEntities(
    tx: Prisma.TransactionClient,
    companyId: string,
    items: Array<{ productId: string; quantity: number }>,
    sourceBaseId: string | undefined,
    destinationBaseId: string | undefined,
    movementType: StockMovementType
  ) {
    if (items.length === 0) {
      throw new AppError("At least one movement item is required", 400);
    }

    const productIds = items.map((item) => item.productId);
    const productsCount = await this.movementRepository.countProductsByIds(tx, companyId, productIds);

    if (productsCount !== productIds.length) {
      throw new AppError("One or more products do not belong to the company", 400);
    }

    if (movementType === StockMovementType.ENTRY) {
      if (!destinationBaseId) {
        throw new AppError("destinationBaseId is required for ENTRY", 400);
      }

      const basesCount = await this.movementRepository.countBasesByIds(tx, companyId, [destinationBaseId]);

      if (basesCount !== 1) {
        throw new AppError("Destination base not found for the company", 400);
      }

      await this.assertProductsAllowedAtBase(tx, companyId, productIds, destinationBaseId);

      return;
    }

    if (movementType === StockMovementType.EXIT) {
      if (!sourceBaseId) {
        throw new AppError("sourceBaseId is required for EXIT", 400);
      }

      const basesCount = await this.movementRepository.countBasesByIds(tx, companyId, [sourceBaseId]);

      if (basesCount !== 1) {
        throw new AppError("Source base not found for the company", 400);
      }

      await this.assertProductsAllowedAtBase(tx, companyId, productIds, sourceBaseId);

      return;
    }

    if (!sourceBaseId || !destinationBaseId) {
      throw new AppError("sourceBaseId and destinationBaseId are required for TRANSFER", 400);
    }

    if (sourceBaseId === destinationBaseId) {
      throw new AppError("sourceBaseId and destinationBaseId must be different for TRANSFER", 400);
    }

    const basesCount = await this.movementRepository.countBasesByIds(tx, companyId, [sourceBaseId, destinationBaseId]);

    if (basesCount !== 2) {
      throw new AppError("Source or destination base not found for the company", 400);
    }

    await this.assertProductsAllowedAtBase(tx, companyId, productIds, sourceBaseId);
    await this.assertProductsAllowedAtBase(tx, companyId, productIds, destinationBaseId);
  }

  private async assertProductsAllowedAtBase(
    tx: Prisma.TransactionClient,
    companyId: string,
    productIds: string[],
    baseId: string
  ) {
    const allowedProductsCount = await this.movementRepository.countProductsAllowedAtBase(tx, companyId, productIds, baseId);

    if (allowedProductsCount !== productIds.length) {
      throw new AppError(`One or more products are not linked to base ${baseId}`, 400);
    }
  }

  private async applyCompletedMovement(movement: StockMovementWithRelations): Promise<void> {
    await this.stockService.withTransaction(async (stockTx) => {
      if (movement.type === StockMovementType.ENTRY) {
        await this.applyEntry(stockTx, movement);
        return;
      }

      if (movement.type === StockMovementType.EXIT) {
        await this.applyExit(stockTx, movement);
        return;
      }

      await this.applyTransfer(stockTx, movement);
    });
  }

  private async applyEntry(stockTx: StockServiceTransaction, movement: StockMovementWithRelations): Promise<void> {
    if (!movement.destinationBaseId) {
      throw new AppError("ENTRY movement requires destination base", 400);
    }

    for (const item of movement.items) {
      await stockTx.addStock(item.productId, movement.destinationBaseId, item.quantity, movement.createdById);
    }
  }

  private async applyExit(stockTx: StockServiceTransaction, movement: StockMovementWithRelations): Promise<void> {
    if (!movement.sourceBaseId) {
      throw new AppError("EXIT movement requires source base", 400);
    }

    for (const item of movement.items) {
      await stockTx.removeStock(item.productId, movement.sourceBaseId, item.quantity, movement.createdById);
    }
  }

  private async applyTransfer(stockTx: StockServiceTransaction, movement: StockMovementWithRelations): Promise<void> {
    if (!movement.sourceBaseId || !movement.destinationBaseId) {
      throw new AppError("TRANSFER movement requires source and destination bases", 400);
    }

    for (const item of movement.items) {
      await stockTx.transferStock(
        item.productId,
        movement.sourceBaseId,
        movement.destinationBaseId,
        item.quantity,
        movement.createdById
      );
    }
  }

  private assertUserCanCreateTransferForTechnician(requester: UserWithBaseAccess, technician: UserWithBaseAccess): void {
    if (requester.role !== Role.TECNICO) {
      return;
    }

    if (requester.id !== technician.id) {
      throw new AppError("Tecnicos so podem criar transferencias para si mesmos", 403);
    }
  }

  private assertUserCanCompleteImmediateTransfer(user: UserWithBaseAccess, fromBaseId: string, toBaseId: string): void {
    if (user.role === Role.ADMIN) {
      return;
    }

    const hasSourceAccess = this.userHasBaseAccess(user, fromBaseId);
    const hasDestinationAccess = this.userHasBaseAccess(user, toBaseId);

    if (!hasSourceAccess || !hasDestinationAccess) {
      throw new AppError("Usuario sem acesso as bases informadas para concluir a transferencia", 403);
    }
  }

  private assertUserCanCreateMovement(
    user: UserWithBaseAccess,
    type: StockMovementType,
    sourceBaseId: string | undefined,
    destinationBaseId: string | undefined
  ) {
    if (user.role === Role.ADMIN) {
      return;
    }

    if (type === StockMovementType.ENTRY) {
      if (!destinationBaseId) {
        return;
      }

      if (!this.userHasBaseAccess(user, destinationBaseId)) {
        throw new AppError("You do not have access to create entries for this destination base", 403);
      }

      return;
    }

    if (!sourceBaseId) {
      return;
    }

    if (!this.userHasBaseAccess(user, sourceBaseId)) {
      throw new AppError("You do not have access to create movements for this source base", 403);
    }
  }

  private assertUserCanViewMovement(user: UserWithBaseAccess, movement: StockMovementWithRelations) {
    if (user.role === Role.ADMIN) {
      return;
    }

    if (!this.userHasMovementAccess(user, movement)) {
      throw new AppError("You do not have access to this stock movement", 403);
    }
  }

  private assertUserCanModerateMovement(user: UserWithBaseAccess, movement: StockMovementWithRelations) {
    this.assertUserCanViewMovement(user, movement);
  }

  private assertUserCanReviewTransferFromDestination(user: UserWithBaseAccess, movement: StockMovementWithRelations) {
    if (movement.type !== StockMovementType.TRANSFER) {
      this.assertUserCanModerateMovement(user, movement);
      return;
    }

    this.assertUserCanConfirmTransfer(user, movement);
  }

  private assertUserCanCancelMovement(user: UserWithBaseAccess, movement: StockMovementWithRelations) {
    if (this.canUserCancelMovement(user, movement)) {
      return;
    }

    throw new AppError("You do not have permission to cancel this stock movement", 403);
  }

  private assertUserCanConfirmTransfer(user: UserWithBaseAccess, movement: StockMovementWithRelations) {
    if (user.role === Role.ADMIN) {
      return;
    }

    if (!this.userHasBaseAccess(user, movement.destinationBaseId)) {
      throw new AppError("You do not have access to confirm transfers for this destination base", 403);
    }
  }

  private assertUserCanReverseMovement(user: UserWithBaseAccess, movement: StockMovementWithRelations) {
    if (this.canUserReverseMovement(user, movement)) {
      return;
    }

    throw new AppError("You do not have permission to reverse this stock movement", 403);
  }

  private canUserCancelMovement(user: UserWithBaseAccess, movement: StockMovementWithRelations): boolean {
    const canCancelApprovedTransfer =
      movement.type === StockMovementType.TRANSFER && movement.status === StockMovementStatus.APPROVED;

    if (movement.status !== StockMovementStatus.PENDING && !canCancelApprovedTransfer) {
      return false;
    }

    if (!this.userHasMovementAccess(user, movement)) {
      return false;
    }

    if (user.role === Role.ADMIN || user.role === Role.GESTOR) {
      return true;
    }

    return movement.status === StockMovementStatus.PENDING && movement.createdById === user.id;
  }

  private canUserReverseMovement(user: UserWithBaseAccess, movement: StockMovementWithRelations): boolean {
    if (user.role === Role.TECNICO) {
      return false;
    }

    if (movement.status !== StockMovementStatus.COMPLETED) {
      return false;
    }

    if (movement.originalMovementId || movement.reversalMovement) {
      return false;
    }

    return this.userHasFullMovementAccess(user, movement);
  }

  private userHasMovementAccess(user: UserWithBaseAccess, movement: StockMovementWithRelations): boolean {
    if (user.role === Role.ADMIN) {
      return true;
    }

    return this.userHasBaseAccess(user, movement.sourceBaseId) || this.userHasBaseAccess(user, movement.destinationBaseId);
  }

  private userHasFullMovementAccess(user: UserWithBaseAccess, movement: StockMovementWithRelations): boolean {
    if (user.role === Role.ADMIN) {
      return true;
    }

    const baseIds = [movement.sourceBaseId, movement.destinationBaseId].filter(
      (baseId): baseId is string => Boolean(baseId)
    );

    return baseIds.every((baseId) => this.userHasBaseAccess(user, baseId));
  }

  private userHasBaseAccess(user: UserWithBaseAccess, baseId: string | null | undefined): boolean {
    if (!baseId) {
      return false;
    }

    if (user.role === Role.ADMIN) {
      return true;
    }

    return user.baseAccesses.some((access) => access.baseId === baseId);
  }

  private serializeMovement(user: UserWithBaseAccess, movement: StockMovementWithRelations): MovementDetailPayload {
    return {
      id: movement.id,
      type: movement.type,
      status: movement.status,
      reason: movement.reason ?? null,
      rejectionReason: movement.rejectionReason ?? null,
      cancellationReason: movement.cancellationReason ?? null,
      reversalReason: movement.reversalReason ?? null,
      sourceBase: movement.sourceBase
        ? {
            id: movement.sourceBase.id,
            name: movement.sourceBase.name
          }
        : null,
      destinationBase: movement.destinationBase
        ? {
            id: movement.destinationBase.id,
            name: movement.destinationBase.name
          }
        : null,
      createdBy: {
        id: movement.createdBy.id,
        name: movement.createdBy.name,
        email: movement.createdBy.email,
        role: movement.createdBy.role
      },
      approvedBy: movement.approvedBy
        ? {
            id: movement.approvedBy.id,
            name: movement.approvedBy.name,
            email: movement.approvedBy.email,
            role: movement.approvedBy.role
          }
        : null,
      items: movement.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        sku: item.product.sku,
        quantity: item.quantity
      })),
      totalQuantity: movement.items.reduce((total, item) => total + item.quantity, 0),
      createdAt: movement.createdAt.toISOString(),
      updatedAt: movement.updatedAt.toISOString(),
      approvedAt: movement.approvedAt?.toISOString() ?? null,
      completedAt: movement.completedAt?.toISOString() ?? null,
      originalMovementId: movement.originalMovementId ?? null,
      reversalMovementId: movement.reversalMovement?.id ?? null,
      permissions: {
        canApprove:
          user.role !== Role.TECNICO &&
          this.userHasMovementAccess(user, movement) &&
          movement.type === StockMovementType.EXIT &&
          movement.status === StockMovementStatus.PENDING,
        canReject:
          movement.type === StockMovementType.TRANSFER
            ? user.role !== Role.TECNICO &&
              (movement.status === StockMovementStatus.PENDING || movement.status === StockMovementStatus.APPROVED) &&
              (user.role === Role.ADMIN || this.userHasBaseAccess(user, movement.destinationBaseId))
            : user.role !== Role.TECNICO &&
              this.userHasMovementAccess(user, movement) &&
              movement.type === StockMovementType.EXIT &&
              movement.status === StockMovementStatus.PENDING,
        canConfirmTransfer:
          user.role !== Role.TECNICO &&
          movement.type === StockMovementType.TRANSFER &&
          (movement.status === StockMovementStatus.PENDING || movement.status === StockMovementStatus.APPROVED) &&
          (user.role === Role.ADMIN || this.userHasBaseAccess(user, movement.destinationBaseId)),
        canCancel: this.canUserCancelMovement(user, movement),
        canReverse: this.canUserReverseMovement(user, movement)
      }
    };
  }

  private buildMovementReport(
    detail: MovementDetailPayload,
    company: {
      companyName: string;
      companyLogoDataUrl: string | null;
    }
  ): TabularReport {
    return {
      title: `Movimentacao ${detail.id}`,
      generatedAt: new Date(),
      pdfHeader: {
        companyName: company.companyName,
        companyLogoDataUrl: company.companyLogoDataUrl,
        contextLines: this.buildMovementContextLines(detail)
      },
      columns: [
        { header: "Movimentacao", key: "movementId", width: 32 },
        { header: "Tipo", key: "type", width: 14 },
        { header: "Status", key: "status", width: 14 },
        { header: "Origem", key: "sourceBase", width: 20 },
        { header: "Destino", key: "destinationBase", width: 20 },
        { header: "Produto", key: "productName", width: 24 },
        { header: "Quantidade", key: "quantity", width: 12 },
        { header: "Criado por", key: "createdBy", width: 22 },
        { header: "Criado em", key: "createdAt", width: 24 },
        { header: "Motivo", key: "reason", width: 24 },
        { header: "Motivo rejeicao", key: "rejectionReason", width: 24 },
        { header: "Motivo cancelamento", key: "cancellationReason", width: 24 },
        { header: "Motivo estorno", key: "reversalReason", width: 24 }
      ],
      rows: detail.items.map((item) => ({
        movementId: detail.id,
        type: detail.type,
        status: detail.status,
        sourceBase: detail.sourceBase?.name ?? "-",
        destinationBase: detail.destinationBase?.name ?? "-",
        productName: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        createdBy: detail.createdBy.name,
        createdAt: detail.createdAt,
        reason: detail.reason ?? "-",
        rejectionReason: detail.rejectionReason ?? "-",
        cancellationReason: detail.cancellationReason ?? "-",
        reversalReason: detail.reversalReason ?? "-"
      }))
    };
  }

  private buildMovementContextLines(detail: MovementDetailPayload): string[] {
    const contextLines: string[] = [];

    if (detail.sourceBase?.name) {
      contextLines.push(`Base de origem: ${detail.sourceBase.name}`);
    }

    if (detail.destinationBase?.name) {
      contextLines.push(`Base de destino: ${detail.destinationBase.name}`);
    }

    if (contextLines.length === 0) {
      contextLines.push("Base: -");
    }

    return contextLines;
  }

  private getReversalMovementType(type: StockMovementType): StockMovementType {
    if (type === StockMovementType.ENTRY) {
      return StockMovementType.EXIT;
    }

    if (type === StockMovementType.EXIT) {
      return StockMovementType.ENTRY;
    }

    return StockMovementType.TRANSFER;
  }

  private getReversalSourceBaseId(movement: StockMovementWithRelations): string | undefined {
    if (movement.type === StockMovementType.ENTRY) {
      return movement.destinationBaseId ?? undefined;
    }

    if (movement.type === StockMovementType.EXIT) {
      return undefined;
    }

    return movement.destinationBaseId ?? undefined;
  }

  private getReversalDestinationBaseId(movement: StockMovementWithRelations): string | undefined {
    if (movement.type === StockMovementType.ENTRY) {
      return undefined;
    }

    if (movement.type === StockMovementType.EXIT) {
      return movement.sourceBaseId ?? undefined;
    }

    return movement.sourceBaseId ?? undefined;
  }

  private buildReversalMovementReason(movementId: string, reason: string): string {
    return `Estorno da movimentacao ${movementId}: ${reason}`.slice(0, 255);
  }
}
