import { Role, StockMovementStatus, StockMovementType } from "@prisma/client";
import { AppError } from "../errors/app-error";
import {
  MovementReportFilters,
  MovementReportRecord,
  ReportRepository,
  StockReportFilters,
  StockReportRecord,
  UserWithBaseAccess
} from "../repositories/report.repository";
import { ReportExportService, TabularReport } from "./report-export.service";

type ReportFormat = "excel" | "pdf";

type StockReportRow = {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  baseId: string;
  base: string;
  quantity: number;
  updatedAt: string;
};

type MovementReportRow = {
  id: string;
  type: StockMovementType;
  status: StockMovementStatus;
  sourceBase: string;
  destinationBase: string;
  createdBy: string;
  approvedBy: string;
  itemsCount: number;
  totalQuantity: number;
  items: string;
  reason: string;
  rejectionReason: string;
  statusNote: string;
  createdAt: string;
  approvedAt: string;
  completedAt: string;
};

export class ReportService {
  constructor(
    private readonly reportRepository: ReportRepository,
    private readonly reportExportService: ReportExportService
  ) {}

  async getStockReport(userId: string, filters: StockReportFilters) {
    const user = await this.requireUserWithBaseAccess(userId);
    const records = await this.reportRepository.getStockRecords(
      user.companyId,
      filters,
      this.resolveAllowedBaseIds(user)
    );
    const rows = records.map((record) => this.mapStockRow(record));

    return {
      filters,
      summary: {
        rows: rows.length,
        totalQuantity: rows.reduce((accumulator, row) => accumulator + row.quantity, 0)
      },
      rows
    };
  }

  async getMovementsReport(userId: string, filters: MovementReportFilters) {
    const user = await this.requireUserWithBaseAccess(userId);
    const records = await this.reportRepository.getMovementRecords(
      user.companyId,
      filters,
      this.resolveAllowedBaseIds(user)
    );
    const rows = records.map((record) => this.mapMovementRow(record));

    return {
      filters,
      summary: {
        rows: rows.length,
        totalQuantity: rows.reduce((accumulator, row) => accumulator + row.totalQuantity, 0)
      },
      rows
    };
  }

  async getTransfersReport(userId: string, filters: Omit<MovementReportFilters, "type">) {
    const user = await this.requireUserWithBaseAccess(userId);
    const records = await this.reportRepository.getTransferRecords(
      user.companyId,
      filters,
      this.resolveAllowedBaseIds(user)
    );
    const rows = records.map((record) => this.mapMovementRow(record));

    return {
      filters,
      summary: {
        rows: rows.length,
        totalQuantity: rows.reduce((accumulator, row) => accumulator + row.totalQuantity, 0)
      },
      rows
    };
  }

  async exportStockReport(userId: string, filters: StockReportFilters, format: ReportFormat) {
    const user = await this.requireUserWithBaseAccess(userId);
    const report = await this.getStockReport(userId, filters);

    const tabularReport: TabularReport = {
      title: "Relatorio de Estoque",
      generatedAt: new Date(),
      pdfHeader: {
        companyName: user.company.name,
        companyLogoDataUrl: user.company.logoDataUrl ?? null,
        contextLines: [`Base: ${await this.resolveBaseLabel(user.companyId, filters.baseId)}`]
      },
      columns: [
        { header: "Produto", key: "productName", width: 24 },
        { header: "SKU", key: "sku", width: 16 },
        { header: "Categoria", key: "category", width: 20 },
        { header: "Base", key: "base", width: 20 },
        { header: "Quantidade", key: "quantity", width: 12 },
        { header: "Atualizado Em", key: "updatedAt", width: 28 }
      ],
      rows: report.rows
    };

    return this.exportReportByFormat(tabularReport, "estoque", format);
  }

  async exportMovementsReport(userId: string, filters: MovementReportFilters, format: ReportFormat) {
    const user = await this.requireUserWithBaseAccess(userId);
    const report = await this.getMovementsReport(userId, filters);

    const tabularReport: TabularReport = {
      title: "Relatorio de Movimentacoes",
      generatedAt: new Date(),
      pdfHeader: {
        companyName: user.company.name,
        companyLogoDataUrl: user.company.logoDataUrl ?? null,
        contextLines: await this.resolveMovementContextLines(user.companyId, filters)
      },
      columns: [
        { header: "ID", key: "id", width: 30 },
        { header: "Tipo", key: "type", width: 12 },
        { header: "Status", key: "status", width: 12 },
        { header: "Origem", key: "sourceBase", width: 20 },
        { header: "Destino", key: "destinationBase", width: 20 },
        { header: "Criado Por", key: "createdBy", width: 20 },
        { header: "Aprovado Por", key: "approvedBy", width: 20 },
        { header: "Itens", key: "items", width: 40 },
        { header: "Quantidade Total", key: "totalQuantity", width: 14 },
        { header: "Criado Em", key: "createdAt", width: 28 },
        { header: "Aprovado Em", key: "approvedAt", width: 28 },
        { header: "Concluido Em", key: "completedAt", width: 28 },
        { header: "Motivo", key: "reason", width: 24 },
        { header: "Motivo Rejeicao", key: "rejectionReason", width: 24 },
        { header: "Observacao Status", key: "statusNote", width: 28 }
      ],
      rows: report.rows
    };

    return this.exportReportByFormat(tabularReport, "movimentacoes", format);
  }

  async exportTransfersReport(userId: string, filters: Omit<MovementReportFilters, "type">, format: ReportFormat) {
    const user = await this.requireUserWithBaseAccess(userId);
    const report = await this.getTransfersReport(userId, filters);

    const tabularReport: TabularReport = {
      title: "Relatorio de Transferencias",
      generatedAt: new Date(),
      pdfHeader: {
        companyName: user.company.name,
        companyLogoDataUrl: user.company.logoDataUrl ?? null,
        contextLines: await this.resolveMovementContextLines(user.companyId, filters)
      },
      columns: [
        { header: "ID", key: "id", width: 30 },
        { header: "Status", key: "status", width: 12 },
        { header: "Origem", key: "sourceBase", width: 20 },
        { header: "Destino", key: "destinationBase", width: 20 },
        { header: "Criado Por", key: "createdBy", width: 20 },
        { header: "Aprovado Por", key: "approvedBy", width: 20 },
        { header: "Itens", key: "items", width: 40 },
        { header: "Quantidade Total", key: "totalQuantity", width: 14 },
        { header: "Criado Em", key: "createdAt", width: 28 },
        { header: "Aprovado Em", key: "approvedAt", width: 28 },
        { header: "Concluido Em", key: "completedAt", width: 28 },
        { header: "Motivo", key: "reason", width: 24 },
        { header: "Motivo Rejeicao", key: "rejectionReason", width: 24 },
        { header: "Observacao Status", key: "statusNote", width: 28 }
      ],
      rows: report.rows
    };

    return this.exportReportByFormat(tabularReport, "transferencias", format);
  }

  private async requireUserWithBaseAccess(userId: string) {
    const user = await this.reportRepository.findUserWithBaseAccessById(userId);

    if (!user) {
      throw new AppError("Unauthorized", 401);
    }

    return user;
  }

  private resolveAllowedBaseIds(user: UserWithBaseAccess): string[] | undefined {
    if (user.role === Role.ADMIN) {
      return undefined;
    }

    return user.baseAccesses.map((access) => access.baseId);
  }

  private mapStockRow(record: StockReportRecord): StockReportRow {
    return {
      productId: record.productId,
      productName: record.product.name,
      sku: record.product.sku,
      category: record.product.category?.name ?? "Sem categoria",
      baseId: record.baseId,
      base: record.base.name,
      quantity: record.quantity,
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private mapMovementRow(record: MovementReportRecord): MovementReportRow {
    const totalQuantity = record.items.reduce((accumulator, item) => accumulator + item.quantity, 0);

    return {
      id: record.id,
      type: record.type,
      status: record.status,
      sourceBase: record.sourceBase?.name ?? "-",
      destinationBase: record.destinationBase?.name ?? "-",
      createdBy: record.createdBy.name,
      approvedBy: record.approvedBy?.name ?? "-",
      itemsCount: record.items.length,
      totalQuantity,
      items: record.items.map((item) => `${item.product.name} (${item.quantity})`).join(", "),
      reason: record.reason ?? "-",
      rejectionReason: record.rejectionReason ?? "-",
      statusNote: record.reversalReason ?? record.cancellationReason ?? record.rejectionReason ?? "-",
      createdAt: record.createdAt.toISOString(),
      approvedAt: record.approvedAt?.toISOString() ?? "-",
      completedAt: record.completedAt?.toISOString() ?? "-"
    };
  }

  private async resolveBaseLabel(companyId: string, baseId?: string): Promise<string> {
    if (!baseId) {
      return "Todas as bases";
    }

    const base = await this.reportRepository.findBaseByIdAndCompany(baseId, companyId);
    return base?.name ?? baseId;
  }

  private async resolveMovementContextLines(companyId: string, filters: Partial<MovementReportFilters>): Promise<string[]> {
    const contextLines = [`Base: ${await this.resolveBaseLabel(companyId, filters.baseId)}`];

    if (filters.sourceBaseId) {
      contextLines.push(`Base de origem: ${await this.resolveBaseLabel(companyId, filters.sourceBaseId)}`);
    }

    if (filters.destinationBaseId) {
      contextLines.push(`Base de destino: ${await this.resolveBaseLabel(companyId, filters.destinationBaseId)}`);
    }

    return contextLines;
  }

  private async exportReportByFormat(report: TabularReport, baseFileName: string, format: ReportFormat) {
    if (format === "excel") {
      const buffer = await this.reportExportService.generateExcel(report);

      return {
        fileName: `${baseFileName}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer
      };
    }

    const buffer = await this.reportExportService.generatePdf(report);

    return {
      fileName: `${baseFileName}.pdf`,
      contentType: "application/pdf",
      buffer
    };
  }
}
