import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import type { Db } from "../db/connection";
import {
  EMAIL_STATUSES,
  OUTBOX_COLUMNS,
  type EmailStatus,
  type IngestResult,
  type LogRow,
  type LOG_COLUMNS,
  type SyncBatch,
} from "@shared/email";
import { applyLogRow, listDue, markExported } from "../repositories/email";
import { advanceAfterSend, stopOnReply } from "./sequences";

/**
 * The file bridge.
 *
 * Caulder writes an outbox; Apps Script sends and writes a log; Caulder reads
 * the log back. Neither side can call the other, so everything here is built
 * around the exchange being repeated, arriving out of order, or being handed
 * the same file twice.
 */

/* ---- Writing the outbox ------------------------------------------------- */

type OutboxFile = { csv: string; count: number; ids: string[] };

/**
 * Builds the outbox for everything due.
 *
 * Marking the rows exported is the caller's job, after the file is safely on
 * disk: a message marked exported for a file that was never written would
 * never be sent and never be noticed.
 */
export async function buildOutbox(
  db: Db,
  companyId: string,
  day: string,
): Promise<OutboxFile> {
  const due = listDue(db, companyId, day);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Outbox");
  sheet.addRow([...OUTBOX_COLUMNS]);

  for (const message of due) {
    sheet.addRow([
      message.messageId,
      message.leadId,
      message.toEmail,
      message.subject,
      message.body,
      message.scheduledFor,
    ]);
  }

  // exceljs handles the quoting. A body containing commas, quotes or newlines
  // is the normal case, not an edge one, and hand-rolled CSV gets it wrong.
  const buffer = await workbook.csv.writeBuffer();

  return {
    csv: buffer.toString(),
    count: due.length,
    ids: due.map((message) => message.id),
  };
}

/** Called once the file is written. Separate so a failed write changes nothing. */
export function recordOutbox(
  db: Db,
  companyId: string,
  filename: string,
  file: OutboxFile,
): void {
  db.transaction(() => {
    markExported(db, file.ids);
    db.prepare(
      `INSERT INTO sync_batches (
         id, company_id, direction, filename, file_hash, row_count,
         applied, ignored, unmatched, created_at
       ) VALUES (?, ?, 'outbox', ?, ?, ?, ?, 0, 0, ?)`,
    ).run(
      randomUUID(),
      companyId,
      filename,
      hash(file.csv),
      file.count,
      file.count,
      new Date().toISOString(),
    );
  })();
}

/* ---- Reading the log ---------------------------------------------------- */

/**
 * Applies a log file.
 *
 * Every row is an upsert keyed on message_id, and the status ladder never goes
 * backwards, so importing the same file twice is harmless and rows arriving
 * out of order do not matter. The file hash is recorded as well, so the UI can
 * say "you have already read this one" rather than leaving the user guessing
 * why nothing changed.
 */
export async function ingestLog(
  db: Db,
  companyId: string,
  filename: string,
  content: string,
): Promise<IngestResult> {
  const fileHash = hash(content);

  const seen = db
    .prepare(
      `SELECT id FROM sync_batches
       WHERE company_id = ? AND direction = 'log' AND file_hash = ?`,
    )
    .get(companyId, fileHash) as { id: string } | undefined;

  const rows = await parseLog(content);

  let applied = 0;
  let ignored = 0;
  let unmatched = 0;

  db.transaction(() => {
    for (const row of rows) {
      const outcome = applyLogRow(db, row);
      if (outcome === "applied") applied += 1;
      else if (outcome === "ignored") ignored += 1;
      else unmatched += 1;

      if (outcome !== "applied") continue;

      // A send moves the cadence along; a reply ends it. Both are decided here
      // rather than in the repository, because both are sequence questions
      // rather than message questions.
      if (row.status === "sent") advanceAfterSend(db, row.messageId, row.sentAt);
      if (row.status === "replied") stopOnReply(db, row.messageId);
    }

    db.prepare(
      `INSERT INTO sync_batches (
         id, company_id, direction, filename, file_hash, row_count,
         applied, ignored, unmatched, created_at
       ) VALUES (?, ?, 'log', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      companyId,
      filename,
      fileHash,
      rows.length,
      applied,
      ignored,
      unmatched,
      new Date().toISOString(),
    );
  })();

  return {
    filename,
    rows: rows.length,
    applied,
    ignored,
    unmatched,
    duplicate: seen !== undefined,
  };
}

/**
 * Reads a log CSV.
 *
 * Columns are matched by header name, not position, because a spreadsheet
 * somebody has opened and re-saved will not keep the column order.
 */
async function parseLog(content: string): Promise<LogRow[]> {
  const workbook = new ExcelJS.Workbook();
  const { Readable } = await import("node:stream");
  await workbook.csv.read(Readable.from(content));

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("That log file is empty.");

  const table: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, index) => {
      cells[index - 1] = cellText(cell.value);
    });
    table.push(cells);
  });

  const header = (table.shift() ?? []).map((value) => value.trim().toLowerCase());
  const at = (name: (typeof LOG_COLUMNS)[number]) => header.indexOf(name);

  const idAt = at("message_id");
  const statusAt = at("status");
  if (idAt === -1 || statusAt === -1) {
    throw new Error("That file has no message_id and status columns.");
  }

  const rows: LogRow[] = [];

  for (const cells of table) {
    const messageId = (cells[idAt] ?? "").trim();
    const status = (cells[statusAt] ?? "").trim().toLowerCase();
    if (messageId === "") continue;

    // A status Caulder does not know is skipped rather than guessed at. The
    // script is someone else's code and may grow a status this build has
    // never heard of.
    if (!(EMAIL_STATUSES as readonly string[]).includes(status)) continue;

    rows.push({
      messageId,
      status: status as EmailStatus,
      sentAt: optional(cells, at("sent_at")),
      providerMessageId: optional(cells, at("provider_message_id")),
      threadId: optional(cells, at("thread_id")),
      openedAt: optional(cells, at("opened_at")),
      repliedAt: optional(cells, at("replied_at")),
      bouncedAt: optional(cells, at("bounced_at")),
      error: optional(cells, at("error")),
    });
  }

  return rows;
}

function optional(cells: string[], index: number): string | null {
  if (index === -1) return null;
  const value = (cells[index] ?? "").trim();
  return value === "" ? null : value;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record["text"] === "string") return record["text"];
    if (record["result"] !== undefined) return cellText(record["result"]);
  }
  return String(value);
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/* ---- History ------------------------------------------------------------ */

export function listSyncBatches(db: Db, companyId: string): SyncBatch[] {
  const rows = db
    .prepare(
      `SELECT * FROM sync_batches WHERE company_id = ? ORDER BY created_at DESC LIMIT 20`,
    )
    .all(companyId) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row["id"] as string,
    direction: row["direction"] as "outbox" | "log",
    filename: row["filename"] as string,
    rowCount: row["row_count"] as number,
    applied: row["applied"] as number,
    ignored: row["ignored"] as number,
    unmatched: row["unmatched"] as number,
    createdAt: row["created_at"] as string,
  }));
}

/**
 * When the last log was read.
 *
 * The bridge is manual, so the risk the plan flags is somebody exporting an
 * outbox and never importing the log back. Today shows this so the gap is
 * visible rather than silent.
 */
export function lastLogAt(db: Db, companyId: string): string | null {
  const row = db
    .prepare(
      `SELECT MAX(created_at) AS at FROM sync_batches
       WHERE company_id = ? AND direction = 'log'`,
    )
    .get(companyId) as { at: string | null };
  return row.at;
}
