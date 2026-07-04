import ExcelJS from "exceljs";
import puppeteer from "puppeteer";

type TabularReportRow = Record<string, string | number> & {
  __rowType?: "section";
  __sectionTitle?: string;
};

export type TabularReport = {
  title: string;
  generatedAt: Date;
  pdfHeader?: {
    companyName: string;
    companyLogoDataUrl?: string | null;
    contextLines?: string[];
    contextItems?: Array<{
      label: string;
      value: string;
    }>;
  };
  pdfOptions?: {
    orientation?: "portrait" | "landscape";
    zebraStripes?: boolean;
  };
  columns: Array<{
    header: string;
    key: string;
    width?: number;
    align?: "left" | "center" | "right";
    wrap?: boolean;
    headerWrap?: boolean;
  }>;
  rows: TabularReportRow[];
};

export type OperationalPdfReport = {
  title: string;
  generatedAt: Date;
  pdfHeader?: {
    companyName: string;
    companyLogoDataUrl?: string | null;
    contextLines?: string[];
    contextItems?: Array<{
      label: string;
      value: string;
    }>;
  };
  operations: Array<{
    id: string;
    title: string;
    badge?: string;
    badgeTone?: "neutral" | "info" | "success" | "warning" | "danger";
    meta: Array<{
      label: string;
      value: string;
    }>;
    notes?: Array<{
      label: string;
      value: string;
    }>;
    items: Array<{
      productName: string;
      quantity: number;
    }>;
    summary: Array<{
      label: string;
      value: string;
    }>;
  }>;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(value);
}

function formatCellValue(value: string | number): string {
  if (typeof value === "number") {
    return value.toLocaleString("pt-BR", {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2
    });
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    const parsedDate = new Date(value);

    if (!Number.isNaN(parsedDate.getTime())) {
      return formatDateTime(parsedDate);
    }
  }

  return value;
}

function resolveStatusTone(value: string): "ok" | "warn" | "danger" | "neutral" {
  const normalized = value.trim().toLowerCase();

  if (!normalized || normalized === "-") {
    return "neutral";
  }

  if (
    normalized.includes("bom") ||
    normalized.includes("saud") ||
    normalized.includes("ok") ||
    normalized.includes("conclu") ||
    normalized.includes("meta")
  ) {
    return "ok";
  }

  if (
    normalized.includes("baixo") ||
    normalized.includes("atenc") ||
    normalized.includes("pendente") ||
    normalized.includes("aprovad")
  ) {
    return "warn";
  }

  if (
    normalized.includes("zerado") ||
    normalized.includes("crit") ||
    normalized.includes("reje") ||
    normalized.includes("cancel") ||
    normalized.includes("estornado") ||
    normalized.includes("reversed")
  ) {
    return "danger";
  }

  return "neutral";
}

export class ReportExportService {
  async generateExcel(report: TabularReport): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Relatorio");

    worksheet.columns = report.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? 20
    }));

    const headerRow = worksheet.getRow(1);
    report.columns.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.font = {
        bold: true,
        color: {
          argb: "FF475569"
        },
        size: 10
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb: "FFF8FAFC"
        }
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: column.align ?? "left",
        wrapText: false,
        shrinkToFit: true
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } }
      };
    });

    for (const row of report.rows) {
      if (row.__rowType === "section") {
        if (worksheet.rowCount > 1) {
          worksheet.addRow([]);
        }

        const sectionRow = worksheet.addRow([row.__sectionTitle ?? ""]);
        const sectionRowNumber = sectionRow.number;
        const lastColumnIndex = Math.max(report.columns.length, 1);

        worksheet.mergeCells(sectionRowNumber, 1, sectionRowNumber, lastColumnIndex);

        const titleCell = sectionRow.getCell(1);
        titleCell.font = {
          bold: true,
          color: {
            argb: "FF1E3A8A"
          },
          size: 11
        };
        titleCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb: "FFF8FAFC"
          }
        };
        titleCell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFCBD5E1" } }
        };
        titleCell.alignment = {
          vertical: "middle",
          horizontal: "left"
        };

        continue;
      }

      const dataRow = worksheet.addRow(
        report.columns.map((column) => formatCellValue(row[column.key] ?? ""))
      );

      dataRow.eachCell((cell, columnNumber) => {
        const reportColumn = report.columns[columnNumber - 1];
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFF1F5F9" } }
        };
        cell.font = {
          color: { argb: "FF1F2937" },
          size: 10
        };
        cell.alignment = {
          vertical: "top",
          horizontal: reportColumn?.align ?? "left",
          wrapText: false,
          shrinkToFit: true
        };
      });
    }

    const workbookBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(workbookBuffer as ArrayBuffer);
  }

  async generatePdf(report: TabularReport): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    try {
      const page = await browser.newPage();
      const html = this.buildHtmlTemplate(report);

      await page.setContent(html, {
        waitUntil: "load"
      });

      const pdfBuffer = await page.pdf({
        format: "A4",
        landscape: report.pdfOptions?.orientation === "landscape",
        printBackground: true,
        margin: {
          top: "12mm",
          right: "10mm",
          bottom: "12mm",
          left: "10mm"
        }
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  async generateOperationalPdf(report: OperationalPdfReport): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    try {
      const page = await browser.newPage();
      const html = this.buildOperationalHtmlTemplate(report);

      await page.setContent(html, {
        waitUntil: "load"
      });

      const pdfBuffer = await page.pdf({
        format: "A4",
        landscape: false,
        printBackground: true,
        margin: {
          top: "12mm",
          right: "10mm",
          bottom: "12mm",
          left: "10mm"
        }
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  private buildHtmlTemplate(report: TabularReport): string {
    const contextItems =
      report.pdfHeader?.contextItems ??
      (report.pdfHeader?.contextLines ?? []).map((line, index) => {
        const separatorIndex = line.indexOf(":");

        if (separatorIndex === -1) {
          return {
            label: `Contexto ${index + 1}`,
            value: line
          };
        }

        return {
          label: line.slice(0, separatorIndex).trim(),
          value: line.slice(separatorIndex + 1).trim()
        };
      });
    const totalRows = report.rows.filter((row) => row.__rowType !== "section").length;
    const tableHeaders = report.columns
      .map((column) => {
        const alignment = column.align ?? "left";
        const wrapClass = column.headerWrap ?? column.wrap ? "cell-wrap" : "cell-nowrap";
        return `<th class="align-${alignment} ${wrapClass}">${escapeHtml(column.header)}</th>`;
      })
      .join("");
    const totalColumnWidth = report.columns.reduce((sum, column) => sum + (column.width ?? 20), 0);
    const colGroup = report.columns
      .map((column) => {
        const width = (((column.width ?? 20) / totalColumnWidth) * 100).toFixed(2);
        return `<col style="width: ${width}%;" />`;
      })
      .join("");

    const tableRows = report.rows
      .map((row) => {
        if (row.__rowType === "section") {
          return `
            <tr class="section-row">
              <td colspan="${report.columns.length}">
                <div class="section-title">
                  <span class="section-marker"></span>
                  <span>${escapeHtml(row.__sectionTitle ?? "")}</span>
                </div>
              </td>
            </tr>
          `;
        }

        const columns = report.columns
          .map((column) => {
            const rawValue = row[column.key] ?? "";
            const formattedValue = formatCellValue(rawValue);
            const isNumeric = typeof rawValue === "number";
            const isStatusColumn = column.key.toLowerCase().includes("status");
            const alignmentClass = `align-${column.align ?? (isNumeric ? "right" : "left")}`;
            const wrapClass = column.wrap ? "cell-wrap" : "cell-nowrap";

            if (isStatusColumn) {
              const tone = resolveStatusTone(String(formattedValue));

              return `
                <td class="status-cell ${alignmentClass} ${wrapClass}">
                  <span class="status-pill status-pill-${tone}">${escapeHtml(String(formattedValue))}</span>
                </td>
              `;
            }

            return `<td class="${alignmentClass} ${wrapClass} ${isNumeric ? "cell-number" : ""}">${escapeHtml(String(formattedValue))}</td>`;
          })
          .join("");

        return `<tr>${columns}</tr>`;
      })
      .join("");

    const headerLogo = report.pdfHeader?.companyLogoDataUrl
      ? `<img class="brand-logo" src="${escapeHtml(report.pdfHeader.companyLogoDataUrl)}" alt="Logo da empresa" />`
      : "";

    const headerBlock = report.pdfHeader
      ? `
          <header class="report-header">
            <div class="brand-block">
              ${headerLogo}
              <div class="brand-copy">
                <div class="brand-label">Empresa</div>
                <div class="brand-name">${escapeHtml(report.pdfHeader.companyName)}</div>
              </div>
            </div>

            <div class="report-summary">
              <h1>${escapeHtml(report.title)}</h1>
              <div class="summary-line">Relatorio executivo com foco em legibilidade e acompanhamento operacional.</div>
            </div>
          </header>
        `
      : `
          <header class="report-header report-header-simple">
            <div class="report-summary">
              <h1>${escapeHtml(report.title)}</h1>
              <div class="summary-line">Gerado em: ${escapeHtml(formatDateTime(report.generatedAt))}</div>
            </div>
          </header>
        `;

    const metaCards = [
      ...contextItems,
      {
        label: "Gerado em",
        value: formatDateTime(report.generatedAt)
      },
      {
        label: "Total de registros",
        value: totalRows.toLocaleString("pt-BR")
      }
    ]
      .map(
        (item) => `
          <div class="meta-card">
            <div class="meta-label">${escapeHtml(item.label)}</div>
            <div class="meta-value">${escapeHtml(item.value)}</div>
          </div>
        `
      )
      .join("");

    return `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>${escapeHtml(report.title)}</title>
          <style>
            * {
              box-sizing: border-box;
            }
            body {
              font-family: "Segoe UI", Arial, sans-serif;
              color: #0f172a;
              margin: 0;
              background: #ffffff;
            }
            .container {
              padding: 12px 14px 18px;
            }
            .report-header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 18px;
              padding: 0 0 12px;
              margin-bottom: 12px;
              border-bottom: 1px solid #cbd5e1;
            }
            .report-header-simple {
              justify-content: flex-start;
            }
            .brand-block {
              display: flex;
              align-items: center;
              gap: 16px;
              min-width: 0;
              flex: 1;
            }
            .brand-logo {
              width: 128px;
              max-height: 56px;
              object-fit: contain;
              object-position: left center;
              flex-shrink: 0;
            }
            .brand-copy {
              min-width: 0;
            }
            .brand-label {
              color: #64748b;
              font-size: 9px;
              text-transform: uppercase;
              letter-spacing: 0.18em;
              margin-bottom: 3px;
            }
            .brand-name {
              font-size: 17px;
              font-weight: 700;
              line-height: 1.25;
            }
            .report-summary {
              min-width: 280px;
              text-align: right;
            }
            h1 {
              margin: 0 0 6px 0;
              font-size: 24px;
              line-height: 1.15;
            }
            .summary-line {
              color: #4b5563;
              font-size: 10.5px;
              margin-top: 3px;
              line-height: 1.4;
            }
            .report-meta-grid {
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              gap: 8px;
              margin-bottom: 12px;
            }
            .meta-card {
              min-height: 54px;
              padding: 8px 10px;
              border: 1px solid #dbe3ee;
              border-radius: 10px;
              background: #f8fafc;
            }
            .meta-label {
              color: #64748b;
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.12em;
              margin-bottom: 5px;
            }
            .meta-value {
              color: #0f172a;
              font-size: 11px;
              font-weight: 600;
              line-height: 1.35;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              font-size: 10px;
              table-layout: fixed;
              border: 1px solid #dbe3ee;
              border-radius: 12px;
              overflow: hidden;
            }
            thead {
              display: table-header-group;
            }
            tbody {
              display: table-row-group;
            }
            tr, td, th {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            th {
              padding: 8px 9px;
              background: #e2e8f0;
              color: #334155;
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              border-bottom: 1px solid #cbd5e1;
              vertical-align: top;
              line-height: 1.35;
            }
            td {
              padding: 7px 9px;
              border-bottom: 1px solid #e5e7eb;
              text-align: left;
              vertical-align: top;
              line-height: 1.35;
              color: #0f172a;
            }
            tbody tr {
              background: #ffffff;
            }
            ${
              report.pdfOptions?.zebraStripes === false
                ? ""
                : `
            tbody tr:nth-child(even) {
              background: #f8fafc;
            }
            `
            }
            tbody tr:last-child td {
              border-bottom: none;
            }
            tbody tr.section-row td {
              border: none;
              padding: 12px 0 6px;
              background: transparent;
            }
            .section-title {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 8px 10px;
              border-top: 1px solid #cbd5e1;
              border-bottom: 1px solid #cbd5e1;
              background: #f8fafc;
              color: #334155;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.04em;
            }
            .section-marker {
              width: 8px;
              height: 8px;
              border-radius: 2px;
              background: #f59e0b;
              flex-shrink: 0;
            }
            .cell-wrap {
              white-space: normal;
              overflow: visible;
              text-overflow: clip;
              overflow-wrap: anywhere;
              word-break: break-word;
            }
            .cell-nowrap {
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .cell-number {
              text-align: right;
              font-variant-numeric: tabular-nums;
            }
            .align-left {
              text-align: left;
            }
            .align-center {
              text-align: center;
            }
            .align-right {
              text-align: right;
            }
            .status-cell {
              vertical-align: middle;
            }
            .status-pill {
              display: inline-flex;
              align-items: center;
              min-height: 22px;
              padding: 2px 8px;
              border: 1px solid currentColor;
              border-left-width: 4px;
              border-radius: 999px;
              background: #ffffff;
              font-size: 9.5px;
              font-weight: 700;
              letter-spacing: 0.02em;
            }
            .status-pill-ok {
              color: #166534;
            }
            .status-pill-warn {
              color: #92400e;
            }
            .status-pill-danger {
              color: #991b1b;
            }
            .status-pill-neutral {
              color: #475569;
            }
            @media print {
              .container {
                padding-bottom: 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${headerBlock}
            <div class="report-meta-grid">
              ${metaCards}
            </div>
            <table>
              <colgroup>
                ${colGroup}
              </colgroup>
              <thead>
                <tr>${tableHeaders}</tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>
        </body>
      </html>
    `;
  }

  private buildOperationalHtmlTemplate(report: OperationalPdfReport): string {
    const contextItems =
      report.pdfHeader?.contextItems ??
      (report.pdfHeader?.contextLines ?? []).map((line, index) => {
        const separatorIndex = line.indexOf(":");

        if (separatorIndex === -1) {
          return {
            label: `Contexto ${index + 1}`,
            value: line
          };
        }

        return {
          label: line.slice(0, separatorIndex).trim(),
          value: line.slice(separatorIndex + 1).trim()
        };
      });
    const baseContextItem = contextItems.find((item) => item.label.trim().toLowerCase().includes("base"));
    const secondaryContextItems = contextItems.filter((item) => item !== baseContextItem);

    const headerLogo = report.pdfHeader?.companyLogoDataUrl
      ? `<img class="brand-logo" src="${escapeHtml(report.pdfHeader.companyLogoDataUrl)}" alt="Logo da empresa" />`
      : "";

    const headerBlock = report.pdfHeader
      ? `
          <header class="report-header operational-header">
            <div class="brand-block">
              ${headerLogo}
              <div class="brand-copy">
                <div class="brand-label">Empresa</div>
                <div class="brand-name">${escapeHtml(report.pdfHeader.companyName)}</div>
              </div>
            </div>

            <div class="report-summary">
              <div class="summary-card compact-span-2">
                <div class="summary-label">Relatorio</div>
                <div class="summary-value">${escapeHtml(report.title)}</div>
              </div>
              <div class="summary-card">
                <div class="summary-label">Quantidade</div>
                <div class="summary-value">${report.operations.length.toLocaleString("pt-BR")}</div>
              </div>
              <div class="summary-card">
                <div class="summary-label">Data</div>
                <div class="summary-value">${escapeHtml(formatDateTime(report.generatedAt))}</div>
              </div>
              ${
                baseContextItem
                  ? `
                    <div class="summary-card compact-span-2">
                      <div class="summary-label">${escapeHtml(baseContextItem.label)}</div>
                      <div class="summary-value">${escapeHtml(baseContextItem.value)}</div>
                    </div>
                  `
                  : ""
              }
            </div>
          </header>
        `
      : "";

    const contextBlock = secondaryContextItems.length
      ? `
          <section class="context-strip">
            ${secondaryContextItems
              .map(
                (item) => `
                  <div class="context-pill">
                    <span class="context-label">${escapeHtml(item.label)}</span>
                    <span class="context-divider">:</span>
                    <span class="context-value">${escapeHtml(item.value)}</span>
                  </div>
                `
              )
              .join("")}
          </section>
        `
      : "";

    const operationsBlock = report.operations
      .map((operation) => {
        const itemsCount = operation.items.length;
        const keepTogetherClass = itemsCount <= 20 ? "operation-card-keep-together" : "operation-card-breakable";
        const badge = operation.badge
          ? `<span class="operation-badge tone-${operation.badgeTone ?? "neutral"}">${escapeHtml(operation.badge)}</span>`
          : "";

        const metaRows = Array.from({ length: Math.ceil(operation.meta.length / 3) }, (_, index) =>
          operation.meta.slice(index * 3, index * 3 + 3)
        )
          .map(
            (row) => `
              <div class="meta-row">
                ${row
                  .map(
                    (item) => `
                      <div class="meta-cell">
                        <span class="meta-label">${escapeHtml(item.label)}</span>
                        <span class="meta-value">${escapeHtml(item.value)}</span>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            `
          )
          .join("");

        const notesGrid = (operation.notes ?? [])
          .filter((item) => item.value.trim() && item.value.trim() !== "-")
          .map(
            (item) => `
              <div class="note-item">
                <div class="meta-label">${escapeHtml(item.label)}</div>
                <div class="meta-value">${escapeHtml(item.value)}</div>
              </div>
            `
          )
          .join("");

        const itemRows = operation.items
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.productName)}</td>
                <td class="align-right cell-number">${escapeHtml(formatCellValue(item.quantity))}</td>
              </tr>
            `
          )
          .join("");

        const summaryGrid = operation.summary
          .map(
            (item) => `
              <div class="summary-inline-item">
                <span class="summary-inline-label">${escapeHtml(item.label)}</span>
                <strong class="summary-inline-value">${escapeHtml(item.value)}</strong>
              </div>
            `
          )
          .join("");

        const summaryLine = operation.summary
          .map(
            (item) => `
              <span class="summary-foot-item">
                <span class="summary-inline-label">${escapeHtml(item.label)}</span>
                <strong class="summary-inline-value">${escapeHtml(item.value)}</strong>
              </span>
            `
          )
          .join("");

        return `
          <article class="operation-card ${keepTogetherClass}">
            <div class="operation-card-shell">
              <section class="operation-preface">
                <div class="operation-intro">
                  <div>
                    <div class="operation-kicker">${escapeHtml(report.title)}</div>
                    <h2 class="operation-title">${escapeHtml(operation.title)}</h2>
                  </div>
                  ${badge}
                </div>

                <section class="meta-matrix">
                  ${metaRows}
                </section>

                ${
                  notesGrid
                    ? `
                      <section class="notes-grid">
                        ${notesGrid}
                      </section>
                    `
                    : ""
                }
              </section>

              <section class="items-section">
                <table class="items-table">
                  <thead>
                    <tr>
                      <th colspan="2" class="items-owner-cell">
                        <div class="items-owner-row">
                          <span class="items-owner-label">Operacao</span>
                          <span class="items-owner-value">${escapeHtml(operation.title)}</span>
                        </div>
                      </th>
                    </tr>
                    <tr>
                      <th>Itens da movimentacao</th>
                      <th class="align-right">Quantidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemRows}
                  </tbody>
                </table>
              </section>

              <footer class="operation-summary-footer">
                ${summaryLine}
              </footer>
            </div>
          </article>
        `;
      })
      .join("");

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${escapeHtml(report.title)}</title>
          <style>
            :root {
              color-scheme: light;
              --erp-bg: #f6f7f9;
              --erp-surface: #ffffff;
              --erp-surface-soft: #fbfcfd;
              --erp-border: rgba(148, 163, 184, 0.28);
              --erp-border-strong: rgba(148, 163, 184, 0.5);
              --erp-text: #0f172a;
              --erp-text-soft: #475569;
              --erp-accent: #0f766e;
              --erp-primary: #1d4ed8;
              --erp-success: #16a34a;
              --erp-warning: #d97706;
              --erp-danger: #dc2626;
              --erp-info: #2563eb;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              font-family: "Manrope", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
              color: var(--erp-text);
              background:
                radial-gradient(circle at top left, rgba(15, 118, 110, 0.08), transparent 28%),
                linear-gradient(180deg, #fbfcfd 0%, var(--erp-bg) 100%);
            }

            .page {
              padding: 1.5mm 0;
            }

            .report-header {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              align-items: center;
              margin-bottom: 8px;
              padding: 10px 12px;
              border: 1px solid var(--erp-border);
              border-radius: 16px;
              background: rgba(255, 255, 255, 0.96);
              box-shadow: 0 12px 28px -28px rgba(15, 23, 42, 0.28);
            }

            .brand-block {
              display: flex;
              align-items: center;
              gap: 10px;
              min-width: 0;
              flex: 1;
            }

            .brand-logo {
              width: 42px;
              height: 42px;
              object-fit: contain;
              border-radius: 12px;
              border: 1px solid var(--erp-border);
              background: #fff;
              padding: 4px;
            }

            .brand-label,
            .summary-label,
            .context-label,
            .meta-label,
            .summary-inline-label,
            .operation-kicker,
            .items-owner-label {
              font-size: 8.5px;
              text-transform: uppercase;
              letter-spacing: 0.14em;
              font-weight: 700;
              color: var(--erp-text-soft);
            }

            .brand-name,
            .summary-value,
            .context-value,
            .meta-value,
            .items-owner-value {
              color: var(--erp-text);
            }

            .brand-name {
              font-size: 15px;
              font-weight: 800;
              margin-top: 2px;
              line-height: 1.2;
            }

            .report-summary {
              display: grid;
              grid-template-columns: repeat(3, minmax(110px, 1fr));
              gap: 6px;
              flex: 1;
              max-width: 460px;
            }

            .summary-card {
              padding: 7px 9px;
              border: 1px solid var(--erp-border);
              border-radius: 11px;
              background: var(--erp-surface-soft);
            }

            .compact-span-2 {
              grid-column: span 2;
            }

            .summary-value {
              margin-top: 3px;
              font-size: 11px;
              font-weight: 700;
              line-height: 1.25;
              word-break: break-word;
            }

            .context-strip {
              display: flex;
              flex-wrap: wrap;
              gap: 6px 10px;
              margin-bottom: 8px;
              padding: 0 2px;
            }

            .context-pill {
              display: inline-flex;
              align-items: baseline;
              gap: 4px;
              padding: 4px 8px;
              border-radius: 999px;
              border: 1px solid var(--erp-border);
              background: rgba(255, 255, 255, 0.8);
            }

            .context-divider {
              color: var(--erp-text-soft);
              font-size: 9px;
            }

            .context-value {
              font-size: 10px;
              font-weight: 600;
              line-height: 1.2;
              word-break: break-word;
            }

            .operation-card {
              margin-bottom: 10px;
              break-inside: auto;
            }

            .operation-card-keep-together {
              break-inside: avoid-page;
              page-break-inside: avoid;
            }

            .operation-card-shell {
              border: 1px solid var(--erp-border-strong);
              border-radius: 16px;
              background: rgba(255, 255, 255, 0.98);
              box-shadow: 0 14px 32px -30px rgba(15, 23, 42, 0.26);
              overflow: hidden;
            }

            .operation-preface {
              break-inside: avoid-page;
              page-break-inside: avoid;
            }

            .operation-intro {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 8px;
              padding: 10px 12px 8px;
              background: linear-gradient(135deg, rgba(15, 118, 110, 0.08), rgba(29, 78, 216, 0.04));
              border-bottom: 1px solid var(--erp-border);
            }

            .operation-title {
              margin: 3px 0 0;
              font-size: 16px;
              line-height: 1.15;
            }

            .operation-badge {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              padding: 5px 8px;
              border-radius: 999px;
              font-size: 8.5px;
              font-weight: 800;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              border: 1px solid transparent;
              white-space: nowrap;
            }

            .tone-neutral { color: #334155; background: #f8fafc; border-color: #cbd5e1; }
            .tone-info { color: #1d4ed8; background: #eff6ff; border-color: #bfdbfe; }
            .tone-success { color: #15803d; background: #f0fdf4; border-color: #bbf7d0; }
            .tone-warning { color: #b45309; background: #fffbeb; border-color: #fcd34d; }
            .tone-danger { color: #b91c1c; background: #fef2f2; border-color: #fecaca; }

            .meta-matrix,
            .notes-grid {
              padding: 8px 12px 0;
            }

            .meta-matrix {
              border-bottom: 1px solid rgba(148, 163, 184, 0.16);
            }

            .meta-row {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 0;
              border-top: 1px solid rgba(148, 163, 184, 0.12);
            }

            .meta-row:first-child {
              border-top: none;
            }

            .meta-cell {
              display: flex;
              gap: 6px;
              align-items: baseline;
              min-height: 28px;
              padding: 7px 8px;
              border-left: 1px solid rgba(148, 163, 184, 0.12);
            }

            .meta-cell:first-child {
              border-left: none;
            }

            .note-item,
            .meta-item {
              padding: 7px 8px;
              border: 1px solid var(--erp-border);
              border-radius: 10px;
              background: #ffffff;
            }

            .notes-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 8px;
            }

            .meta-value {
              font-size: 11px;
              line-height: 1.3;
              font-weight: 600;
              white-space: pre-wrap;
              word-break: break-word;
            }

            .items-section {
              padding: 8px 12px 0;
            }

            .items-table {
              width: 100%;
              border-collapse: separate;
              border-spacing: 0;
              border: 1px solid var(--erp-border);
              border-radius: 12px;
              overflow: hidden;
            }

            .items-table thead {
              display: table-header-group;
            }

            .items-table th,
            .items-table td {
              padding: 7px 9px;
              font-size: 10.5px;
              text-align: left;
              vertical-align: top;
              line-height: 1.22;
            }

            .items-table thead tr:first-child th {
              background: #eef6f6;
              border-bottom: 1px solid var(--erp-border);
            }

            .items-table thead tr:last-child th {
              background: #f8fafc;
              color: var(--erp-text-soft);
              font-size: 8.5px;
              text-transform: uppercase;
              letter-spacing: 0.12em;
              border-bottom: 1px solid var(--erp-border);
            }

            .items-owner-row {
              display: flex;
              justify-content: space-between;
              gap: 8px;
              align-items: center;
            }

            .items-owner-value {
              font-size: 11px;
              font-weight: 800;
              text-align: right;
            }

            .items-table tbody tr:nth-child(even) td {
              background: #fcfdfd;
            }

            .items-table tbody td {
              border-bottom: 1px solid #edf2f7;
            }

            .items-table tbody tr:last-child td {
              border-bottom: none;
            }

            .items-table tr {
              page-break-inside: avoid;
              break-inside: avoid;
            }

            .align-right,
            .cell-number {
              text-align: right;
            }

            .operation-summary-footer {
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
              align-items: center;
              padding: 8px 12px 10px;
              border-top: 1px solid rgba(148, 163, 184, 0.14);
            }

            .summary-foot-item {
              display: inline-flex;
              gap: 5px;
              align-items: baseline;
              font-size: 10.5px;
            }

            @page {
              size: A4 portrait;
            }

            @media print {
              body {
                background: #ffffff;
              }

              .page {
                padding: 0;
              }

              .operation-card,
              .operation-card-shell {
                break-inside: auto;
                page-break-inside: auto;
              }

              .operation-card-keep-together {
                break-inside: avoid-page;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <main class="page">
            ${headerBlock}
            ${contextBlock}
            ${operationsBlock}
          </main>
        </body>
      </html>
    `;
  }
}
