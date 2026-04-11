import ExcelJS from "exceljs";
import puppeteer from "puppeteer";

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
  rows: Array<Record<string, string | number>>;
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

export class ReportExportService {
  async generateExcel(report: TabularReport): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Relatorio");

    worksheet.columns = report.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? 20
    }));

    worksheet.addRows(report.rows);

    const headerRow = worksheet.getRow(1);
    headerRow.font = {
      bold: true
    };

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
        const columns = report.columns
          .map((column) => `<td>${escapeHtml(String(row[column.key] ?? ""))}</td>`)
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
              padding: 24px;
            }
            .report-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 24px;
              padding-bottom: 16px;
              margin-bottom: 20px;
              border-bottom: 1px solid #d1d5db;
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
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.12em;
              margin-bottom: 4px;
            }
            .brand-name {
              font-size: 20px;
              font-weight: 700;
              line-height: 1.2;
            }
            .report-summary {
              min-width: 260px;
              text-align: right;
            }
            h1 {
              margin: 0 0 8px 0;
              font-size: 22px;
            }
            .summary-line {
              color: #4b5563;
              font-size: 12px;
              margin-top: 4px;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              font-size: 12px;
            }
            th, td {
              border: 1px solid #d1d5db;
              padding: 8px;
              text-align: left;
            }
            th {
              background: #f3f4f6;
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${headerBlock}
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
