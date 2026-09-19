import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow } from "electron";

/**
 * HTML to PDF, by a window nobody sees - the printer the invoices and the
 * handbook share.
 *
 * The page is written to a file in the temp folder and loaded from there
 * rather than as a data: address, which Chromium caps at 2 MB: a handbook
 * with a logo and a year of meeting notes passes that easily.
 */
export async function printToPdf(
  html: string,
  options: { pageNumbers?: boolean; title?: string } = {},
): Promise<Buffer> {
  const path = join(app.getPath("temp"), `caulder-print-${randomUUID()}.html`);
  await writeFile(path, html, "utf8");
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
  });
  try {
    await window.loadFile(path);
    return await window.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      ...(options.pageNumbers
        ? {
            displayHeaderFooter: true,
            headerTemplate: "<span></span>",
            footerTemplate: `<div style="font: 9px -apple-system, 'Segoe UI', sans-serif; color: #8a90a0; width: 100%; padding: 0 16mm; display: flex; justify-content: space-between;"><span>${
              options.title ? escapeText(options.title) : ""
            }</span><span><span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
            margins: { top: 0.6, bottom: 0.7, left: 0.6, right: 0.6 },
          }
        : {}),
    });
  } finally {
    window.destroy();
    await rm(path, { force: true });
  }
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
