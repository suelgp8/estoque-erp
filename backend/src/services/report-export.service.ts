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
}
