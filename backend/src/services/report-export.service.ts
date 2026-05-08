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
  };
  columns: Array<{
    header: string;
    key: string;
    width?: number;
  }>;
  rows: TabularReportRow[];
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
    normalized.includes("ok") ||
    normalized.includes("conclu")
  ) {
    return "ok";
  }

  if (
    normalized.includes("baixo") ||
    normalized.includes("pendente") ||
    normalized.includes("aprovad")
  ) {
    return "warn";
  }

  if (
    normalized.includes("zerado") ||
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
    headerRow.font = {
      bold: true,
      color: {
        argb: "FF475569"
      },
      size: 10
    };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: "FFF8FAFC"
      }
    };
    headerRow.alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: true
    };
    headerRow.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } }
    };

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

      dataRow.alignment = {
        vertical: "top",
        horizontal: "left",
        wrapText: true
      };

      dataRow.eachCell((cell) => {
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFF1F5F9" } }
        };
        cell.font = {
          color: { argb: "FF1F2937" },
          size: 10
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
        waitUntil: "networkidle0"
      });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "16mm",
          right: "10mm",
          bottom: "16mm",
          left: "10mm"
        }
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  private buildHtmlTemplate(report: TabularReport): string {
    const contextLines = report.pdfHeader?.contextLines ?? [];
    const tableHeaders = report.columns
      .map((column) => `<th>${escapeHtml(column.header)}</th>`)
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

            if (isStatusColumn) {
              const tone = resolveStatusTone(String(formattedValue));

              return `
                <td class="status-cell">
                  <span class="status-pill status-pill-${tone}">${escapeHtml(String(formattedValue))}</span>
                </td>
              `;
            }

            return `<td class="${isNumeric ? "cell-number" : ""}">${escapeHtml(String(formattedValue))}</td>`;
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
              ${contextLines.map((line) => `<div class="summary-line">${escapeHtml(line)}</div>`).join("")}
              <div class="summary-line">Gerado em: ${escapeHtml(formatDateTime(report.generatedAt))}</div>
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

    return `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>${escapeHtml(report.title)}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              color: #111827;
              margin: 0;
              background: #ffffff;
            }
            .container {
              padding: 18px 24px 24px;
            }
            .report-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 24px;
              padding: 0 0 14px;
              margin-bottom: 16px;
              border-bottom: 1px solid #e2e8f0;
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
              width: 140px;
              max-height: 64px;
              object-fit: contain;
              object-position: left center;
              flex-shrink: 0;
            }
            .brand-copy {
              min-width: 0;
            }
            .brand-label {
              color: #64748b;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.14em;
              margin-bottom: 3px;
            }
            .brand-name {
              font-size: 18px;
              font-weight: 700;
              line-height: 1.2;
            }
            .report-summary {
              min-width: 260px;
              text-align: right;
            }
            h1 {
              margin: 0 0 8px 0;
              font-size: 20px;
            }
            .summary-line {
              color: #4b5563;
              font-size: 11px;
              margin-top: 3px;
            }
            .report-meta-strip {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 16px;
              margin-bottom: 12px;
              padding: 8px 12px;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              background: #f8fafc;
              font-size: 11px;
              color: #475569;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              font-size: 11px;
            }
            th, td {
              border-bottom: 1px solid #eef2f7;
              padding: 7px 8px;
              text-align: left;
              vertical-align: middle;
            }
            th {
              background: #ffffff;
              color: #52525b;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              border-top: 1px solid #cbd5e1;
              border-bottom: 2px solid #cbd5e1;
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
            .cell-number {
              text-align: right;
              font-variant-numeric: tabular-nums;
            }
            .status-cell {
              white-space: nowrap;
            }
            .status-pill {
              display: inline-flex;
              align-items: center;
              padding: 2px 0;
              font-size: 10px;
              font-weight: 700;
            }
            .status-pill-ok {
              color: #047857;
            }
            .status-pill-warn {
              color: #b45309;
            }
            .status-pill-danger {
              color: #b91c1c;
            }
            .status-pill-neutral {
              color: #475569;
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${headerBlock}
            <div class="report-meta-strip">
              <div>${escapeHtml(report.title)}</div>
              <div>${escapeHtml(`Itens: ${report.rows.filter((row) => row.__rowType !== "section").length}`)}</div>
            </div>
            <table>
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
}
