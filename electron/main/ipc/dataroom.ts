import { writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { dialog, shell } from "electron";
import { CHANNELS } from "@shared/ipc";
import type { HandbookOutcome, RoomOutcome } from "@shared/dataroom";
import { getDatabase } from "../db/connection";
import { assertId, handle } from "./handle";
import { dataRoomContents, handbookHtml, roomChoices, writeZip } from "../services/dataroom";
import { attachmentsDir } from "../services/files";
import { printToPdf } from "../services/print";
import { safeName } from "../services/names";

/**
 * The data room and the handbook (PLAN.md, phase 13). Main asks where each
 * goes and keeps the answer, so "Show it" needs no path from the window.
 */

const written = new Map<string, string>();

function nameOf(companyId: string): string {
  const row = getDatabase().prepare(`SELECT name FROM companies WHERE id = ?`).get(companyId) as { name: string } | undefined;
  if (!row) throw new Error("That company no longer exists.");
  return row.name;
}

function dated(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function registerRoomHandlers(): void {
  const companyOf = (value: unknown) => assertId(value, "company id");

  handle(CHANNELS.roomChoices, (_event, companyId: unknown) => roomChoices(getDatabase(), companyOf(companyId)));

  handle(CHANNELS.roomWrite, async (_event, companyId: unknown, input: unknown): Promise<RoomOutcome | null> => {
    const id = companyOf(companyId);
    const now = new Date();
    // Built before asking where, so a data room with nothing ticked says so rather than asking first.
    const contents = dataRoomContents(getDatabase(), id, input, attachmentsDir(), now);
    const picked = await dialog.showSaveDialog({
      title: "Where should the data room go?",
      defaultPath: `${safeName(nameOf(id))} data room ${dated(now)}.zip`,
      filters: [{ name: "Zip file", extensions: ["zip"] }],
    });
    if (picked.canceled || !picked.filePath) return null;
    const bytes = writeZip(contents, picked.filePath, now);
    written.set(`${id}:room`, picked.filePath);
    return { file: basename(picked.filePath), pages: contents.pages, documents: contents.documents, missing: contents.missing, bytes };
  });

  handle(CHANNELS.roomHandbook, async (_event, companyId: unknown, input: unknown): Promise<HandbookOutcome | null> => {
    const id = companyOf(companyId);
    const now = new Date();
    const book = handbookHtml(getDatabase(), id, input, now);
    const picked = await dialog.showSaveDialog({
      title: "Where should the handbook go?",
      defaultPath: `${safeName(book.title)} ${dated(now)}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (picked.canceled || !picked.filePath) return null;
    const pdf = await printToPdf(book.html, { pageNumbers: true, title: book.title });
    await writeFile(picked.filePath, pdf);
    written.set(`${id}:handbook`, picked.filePath);
    return { file: basename(picked.filePath), pages: book.pages };
  });

  handle(CHANNELS.roomReveal, (_event, companyId: unknown, which: unknown) => {
    const path = written.get(`${companyOf(companyId)}:${which === "handbook" ? "handbook" : "room"}`);
    if (!path) throw new Error("Nothing has been saved yet in this session.");
    shell.showItemInFolder(path);
  });
}
