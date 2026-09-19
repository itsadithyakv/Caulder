import { createDeal, mainDeal, setDealValue } from "../repositories/deals";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import type { Db } from "../db/connection";
import {
  MAX_BYTES,
  MAX_ROWS,
  TEMPLATE_COLUMNS,
  guessColumn,
  isRequired,
  type ColumnMapping,
  type DuplicateMatch,
  type FieldConflict,
  type ImportBatch,
  type ImportPreview,
  type ImportRowResult,
  type ImportSummary,
  type ChosenFile,
  type ImportValues,
  type Resolution,
  type TemplateColumn,
} from "@shared/import";
import {
  clean,
  labelKey,
  normaliseEmail,
  parseValue,
  phoneKey,
  splitLocation,
  splitNameAndSource,
  splitPhones,
  text,
} from "@shared/normalise";
import { parsePasted } from "@shared/paste";
import type { Lead } from "@shared/domain";
import { createLead, deleteLead, findLead } from "../repositories/leads";

/**
 * The importer.
 *
 * Two phases, the way Unifloe's does it: `previewImport` reads and normalises
 * without writing anything, and `commitImport` applies a preview the user has
 * seen. Nothing reaches the database until somebody has looked at it.
 */

/* ---- Reading ------------------------------------------------------------ */

export type SheetData = { headers: string[]; rows: unknown[][] };

/**
 * Reads the first sheet of a workbook, or a CSV, into raw cells.
 *
 * Cells are returned untouched. Normalising happens later so the preview can
 * show both what the file said and what Caulder made of it.
 */
export async function readSheet(buffer: Buffer, fileType: "xlsx" | "csv"): Promise<SheetData> {
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("That file is over the 10 MB limit.");
  }

  const workbook = new ExcelJS.Workbook();
  if (fileType === "csv") {
    // exceljs reads CSV through the same object model, so one code path
    // handles both and there is no second parser to keep in step.
    const { Readable } = await import("node:stream");
    const stream = Readable.from(buffer.toString("utf8"));
    await workbook.csv.read(stream);
  } else {
    // exceljs ships its own Buffer declaration, which no longer lines up with
    // the one in @types/node. The value is right; only the two nominal types
    // disagree.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("That file has no sheets in it.");

  const table: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, index) => {
      cells[index - 1] = cell.value;
    });
    table.push(cells);
  });

  const headerRow = table.shift() ?? [];
  const headers = headerRow.map((cell) => text(cell));

  // Trailing blank rows are normal in a hand-edited sheet and are not errors.
  const rows = table.filter((row) => row.some((cell) => text(cell) !== ""));

  if (rows.length > MAX_ROWS) {
    throw new Error(`That file has more than ${MAX_ROWS.toLocaleString()} rows.`);
  }

  return { headers, rows };
}

/**
 * Pasted text into the same shape a file produces.
 *
 * Markdown and tab-separated rows arrive already split, because neither has
 * quoting to get wrong. Anything else is CSV and goes through exceljs like a
 * chosen file would - a comma is the one separator that can appear inside a
 * cell, and hand-rolling that is how a spreadsheet ends up shifted by one
 * column three weeks later.
 */
export async function readPasted(raw: string): Promise<SheetData> {
  const parsed = parsePasted(raw);
  if (!parsed) {
    throw new Error(
      "That does not look like a table. Paste a markdown table, or rows copied " +
        "from a spreadsheet.",
    );
  }

  if (parsed.kind === "csv") return readSheet(Buffer.from(parsed.text, "utf8"), "csv");

  if (parsed.rows.length > MAX_ROWS) {
    throw new Error(`That is more than ${MAX_ROWS.toLocaleString()} rows.`);
  }
  if (parsed.headers.every((header) => header === "")) {
    throw new Error("The first row has to be the column headings.");
  }

  return { headers: parsed.headers, rows: parsed.rows };
}

/**
 * Files the user has chosen but not yet previewed.
 *
 * Held in main so re-mapping a column does not mean re-reading the file, and
 * so the renderer never carries thousands of raw cells across the bridge.
 */
const files = new Map<string, { name: string; type: "xlsx" | "csv"; sheet: SheetData }>();

export function registerFile(
  name: string,
  type: "xlsx" | "csv",
  sheet: SheetData,
): ChosenFile {
  const fileId = randomUUID();
  files.set(fileId, { name, type, sheet });

  return {
    fileId,
    filename: name,
    headers: sheet.headers,
    mapping: guessMapping(sheet.headers),
    sample: sheet.rows.slice(0, 5).map((row) => sheet.headers.map((_, i) => text(row[i]))),
    rowCount: sheet.rows.length,
  };
}

export function previewFile(
  db: Db,
  companyId: string,
  fileId: string,
  mapping: ColumnMapping,
): ImportPreview {
  const file = files.get(fileId);
  if (!file) throw new Error("That file is no longer open. Choose it again.");
  return previewImport(db, companyId, { name: file.name, type: file.type }, file.sheet, mapping);
}

/** The mapping Caulder guesses from the headers, before the user adjusts it. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<TemplateColumn>();

  headers.forEach((header, index) => {
    const guess = guessColumn(header);
    // One spreadsheet column per field: a second "Phone" is left unmapped
    // rather than silently overwriting the first.
    mapping[index] = guess && !taken.has(guess) ? guess : null;
    if (guess && !taken.has(guess)) taken.add(guess);
  });

  return mapping;
}

/* ---- Normalising one row ------------------------------------------------ */

function readRow(row: unknown[], mapping: ColumnMapping): ImportValues | null {
  const cell = (column: TemplateColumn): string | null => {
    for (const [index, mapped] of Object.entries(mapping)) {
      if (mapped === column) return clean(row[Number(index)]);
    }
    return null;
  };

  const rawName = cell("Name");
  if (rawName === null) return null;

  // Provenance smuggled into the name belongs in Source, but an explicit
  // Source column wins over anything inferred.
  const { name, source: inferredSource } = splitNameAndSource(rawName);
  if (name === "") return null;

  const phones = splitPhones(cell("Phone"));
  const explicitAlt = cell("Alt Phone");
  const place = splitLocation(cell("Location"));
  const explicitCity = cell("City");

  return {
    name,
    contactPerson: cell("Contact Person"),
    email: normaliseEmail(cell("Email")),
    phone: phones.phone,
    // A dedicated Alt Phone column wins; otherwise keep the extra numbers
    // that shared a cell with the first.
    altPhone: explicitAlt ?? phones.altPhone,
    location: place.location,
    city: explicitCity ?? place.city,
    pin: place.pin,
    source: cell("Source") ?? inferredSource,
    website: cell("Website"),
    value: parseValue(cell("Value")),
    notes: cell("Notes"),
  };
}

/* ---- Duplicate detection ------------------------------------------------ */

type Candidate = {
  leadId: string | null;
  rowNumber?: number;
  name: string;
  values: ImportValues;
};

/**
 * Finds the lead a row repeats, if any.
 *
 * The rules are tried in order, and the first hit wins:
 *
 *   1. email AND a similar name
 *   2. phone number AND a similar name
 *   3. name AND city
 *
 * **No contact detail is ever enough on its own.** The real file makes the
 * case twice over. One address, prajnavahini2025@gmail.com, sits against seven
 * different schools, and one number, 9480040338, against four. Both belong to
 * the directory the rows were scraped from, not to any school. Matching on
 * either alone collapses unrelated leads into one.
 *
 * The phone rule started without the name check and merged TRIO World School,
 * GIG International and Cambridge School into a single lead. Requiring the
 * name to agree costs the case where one lead is listed twice under different
 * names with the same number, which rule 3 usually catches anyway.
 */
function findDuplicate(values: ImportValues, candidates: Candidate[]): DuplicateMatch | null {
  const email = values.email;
  const phone = phoneKey(values.phone);
  const name = labelKey(values.name);
  const city = labelKey(values.city);

  for (const candidate of candidates) {
    const other = candidate.values;
    const otherName = labelKey(other.name);

    if (email && other.email === email && otherName && name && namesAgree(name, otherName)) {
      return match(candidate, values, "email+name");
    }
  }

  for (const candidate of candidates) {
    const otherName = labelKey(candidate.values.name);
    if (
      phone &&
      phoneKey(candidate.values.phone) === phone &&
      otherName &&
      name &&
      namesAgree(name, otherName)
    ) {
      return match(candidate, values, "phone");
    }
  }

  for (const candidate of candidates) {
    const otherName = labelKey(candidate.values.name);
    const otherCity = labelKey(candidate.values.city);
    if (name && city && otherName === name && otherCity === city) {
      return match(candidate, values, "name+city");
    }
  }

  return null;
}

/**
 * Two names agree when one contains the other. "Oakridge International School"
 * and "Oakridge International School Bengaluru" are the same school; exact
 * equality would miss that, and a fuzzy distance would start merging schools
 * that merely sound alike.
 */
function namesAgree(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a);
}

const CONFLICT_FIELDS: { field: keyof ImportValues; label: string }[] = [
  { field: "email", label: "Email" },
  { field: "phone", label: "Phone" },
  { field: "altPhone", label: "Alt phone" },
  { field: "contactPerson", label: "Contact" },
  { field: "city", label: "City" },
  { field: "location", label: "Location" },
  { field: "source", label: "Source" },
  { field: "website", label: "Website" },
  { field: "value", label: "Value" },
];

function match(candidate: Candidate, values: ImportValues, on: DuplicateMatch["on"]): DuplicateMatch {
  const conflicts: FieldConflict[] = [];

  for (const { field, label } of CONFLICT_FIELDS) {
    const existing = asText(candidate.values[field]);
    const incoming = asText(values[field]);
    // Only a real disagreement counts. A blank on either side is something to
    // fill in, not something to decide between.
    if (existing !== null && incoming !== null && existing !== incoming) {
      conflicts.push({ field, label, existing, incoming });
    }
  }

  const result: DuplicateMatch = {
    leadId: candidate.leadId,
    leadName: candidate.name,
    on,
    conflicts,
  };
  if (candidate.rowNumber !== undefined) result.rowNumber = candidate.rowNumber;
  return result;
}

function asText(value: string | number | null): string | null {
  if (value === null) return null;
  return typeof value === "number" ? String(value) : value;
}

/* ---- Preview ------------------------------------------------------------ */

type Job = {
  id: string;
  companyId: string;
  filename: string;
  fileType: "xlsx" | "csv";
  mapping: ColumnMapping;
  rows: ImportRowResult[];
};

/**
 * Previews live in memory, not in the database.
 *
 * A preview is a scratch calculation the user is about to accept or abandon.
 * Losing one to a restart costs a re-pick of the file, and keeping them in
 * SQLite would mean a table that needs sweeping.
 */
const jobs = new Map<string, Job>();

export function previewImport(
  db: Db,
  companyId: string,
  file: { name: string; type: "xlsx" | "csv" },
  sheet: SheetData,
  mapping: ColumnMapping,
): ImportPreview {
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const missing = TEMPLATE_COLUMNS.filter(
    (column) => isRequired(column) && !mapped.has(column),
  );
  if (missing.length > 0) {
    throw new Error(`Map a column to ${missing.join(", ")} before previewing.`);
  }

  // Existing leads first, then rows accepted earlier in this same file: the
  // file itself repeats schools, so a row can duplicate one three rows above
  // it that does not exist in the database yet.
  const candidates: Candidate[] = existingLeads(db, companyId).map((lead) => ({
    leadId: lead.id,
    name: lead.name,
    values: leadToValues(lead),
  }));

  const rows: ImportRowResult[] = sheet.rows.map((row, index) => {
    // +2: the header is row 1, and spreadsheets count from 1.
    const rowNumber = index + 2;
    const values = readRow(row, mapping);

    if (!values) {
      return { rowNumber, status: "error", errors: ["Name is missing."] };
    }

    const duplicate = findDuplicate(values, candidates);
    if (duplicate) {
      return { rowNumber, status: "duplicate", errors: [], values, match: duplicate };
    }

    candidates.push({ leadId: null, rowNumber, name: values.name, values });
    return { rowNumber, status: "valid", errors: [], values };
  });

  const job: Job = {
    id: randomUUID(),
    companyId,
    filename: file.name,
    fileType: file.type,
    mapping,
    rows,
  };
  jobs.set(job.id, job);

  return {
    jobId: job.id,
    filename: file.name,
    headers: sheet.headers,
    mapping,
    rows,
    counts: {
      total: rows.length,
      valid: rows.filter((row) => row.status === "valid").length,
      errors: rows.filter((row) => row.status === "error").length,
      duplicates: rows.filter((row) => row.status === "duplicate").length,
    },
  };
}

function existingLeads(db: Db, companyId: string): Lead[] {
  // Every lead in the company, held in memory for the length of one import.
  // At the scale this app is for - hundreds, not millions - that is cheaper
  // and far clearer than maintaining normalised match columns and indexes.
  const rows = db
    .prepare(`SELECT id FROM leads WHERE company_id = ?`)
    .all(companyId) as { id: string }[];
  return rows.map((row) => findLead(db, row.id)).filter((lead): lead is Lead => lead !== null);
}

function leadToValues(lead: Lead): ImportValues {
  return {
    name: lead.name,
    contactPerson: lead.contactPerson,
    email: lead.email,
    phone: lead.phone,
    altPhone: lead.altPhone,
    location: lead.location,
    city: lead.city,
    pin: lead.pin,
    source: lead.source,
    website: lead.website,
    value: lead.value,
    notes: lead.notes,
  };
}

/* ---- Commit ------------------------------------------------------------- */

/**
 * Applies a preview.
 *
 * One transaction: an import either lands whole or not at all, so a failure
 * halfway through cannot leave the user reconciling a half-imported file by
 * hand.
 */
export function commitImport(
  db: Db,
  jobId: string,
  resolutions: Record<number, Resolution>,
  /**
   * The campaign every lead in this file came from, if it came from one.
   *
   * Batch-wide rather than per row: a spreadsheet of two hundred scraped
   * schools is one push, and asking two hundred times would mean it is never
   * answered at all. Only applied to leads this import CREATES — a lead that
   * already existed came from wherever it came from, and rewriting that would
   * be attributing somebody else's work to this campaign.
   */
  campaignId: string | null = null,
): ImportSummary {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error("That preview has expired. Choose the file again.");
  }

  const batchId = randomUUID();
  const now = new Date().toISOString();
  const beforeImage: Record<string, ImportValues> = {};

  let created = 0;
  let updated = 0;
  let skipped = 0;

  db.transaction(() => {
    // The batch row goes in first, with counts filled at the end. Leads carry
    // a foreign key to it, so stamping one before the batch exists fails the
    // constraint. Both halves are in the same transaction, so a reader never
    // sees the placeholder.
    db.prepare(
      `INSERT INTO import_batches (
         id, company_id, filename, file_type, mapping, row_count,
         created_count, updated_count, skipped_count, before_image, created_at
       ) VALUES (@id, @companyId, @filename, @fileType, @mapping, @rowCount,
                 0, 0, 0, '{}', @now)`,
    ).run({
      id: batchId,
      companyId: job.companyId,
      filename: job.filename,
      fileType: job.fileType,
      mapping: JSON.stringify(job.mapping),
      rowCount: job.rows.length,
      now,
    });

    // Rows created during this commit, so a row that duplicates an earlier row
    // in the same file can update the lead that row just made.
    const madeThisRun = new Map<number, string>();

    for (const row of job.rows) {
      if (row.status === "error" || !row.values) {
        skipped += 1;
        continue;
      }

      if (row.status === "valid") {
        const lead = createLead(db, job.companyId, toLeadInput(row.values, campaignId));
        stampBatch(db, lead.id, batchId);
        madeThisRun.set(row.rowNumber, lead.id);
        created += 1;
        continue;
      }

      const resolution = resolutions[row.rowNumber] ?? "skip";
      if (resolution === "skip") {
        skipped += 1;
        continue;
      }

      if (resolution === "create") {
        const lead = createLead(db, job.companyId, toLeadInput(row.values, campaignId));
        stampBatch(db, lead.id, batchId);
        madeThisRun.set(row.rowNumber, lead.id);
        created += 1;
        continue;
      }

      const targetId =
        row.match?.leadId ??
        (row.match?.rowNumber !== undefined
          ? madeThisRun.get(row.match.rowNumber)
          : undefined);

      const target = targetId ? findLead(db, targetId) : null;
      if (!target) {
        // The lead went away between preview and commit. Skipping is safer
        // than inventing a replacement the user did not ask for.
        skipped += 1;
        continue;
      }

      if (!beforeImage[target.id]) beforeImage[target.id] = leadToValues(target);
      applyMerge(db, target, row.values, resolution === "overwrite");
      updated += 1;
    }

    db.prepare(
      `UPDATE import_batches SET
         created_count = @created, updated_count = @updated,
         skipped_count = @skipped, before_image = @beforeImage
       WHERE id = @id`,
    ).run({
      id: batchId,
      created,
      updated,
      skipped,
      beforeImage: JSON.stringify(beforeImage),
    });
  })();

  jobs.delete(jobId);
  return { batchId, created, updated, skipped };
}

function stampBatch(db: Db, leadId: string, batchId: string): void {
  db.prepare(`UPDATE leads SET import_batch_id = ? WHERE id = ?`).run(batchId, leadId);
}

const MERGEABLE = [
  "contactPerson",
  "email",
  "phone",
  "altPhone",
  "location",
  "city",
  "pin",
  "source",
  "website",
  "notes",
] as const;

/**
 * Merges a row into an existing lead.
 *
 * `fill` only writes where the lead has nothing. `overwrite` writes wherever
 * the row has something. Neither ever replaces a value with a blank: a column
 * the sheet happens not to carry must not erase what is already known.
 */
function applyMerge(db: Db, target: Lead, values: ImportValues, overwrite: boolean): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: target.id, now: new Date().toISOString() };

  for (const field of MERGEABLE) {
    const incoming = values[field];
    if (incoming === null) continue;
    if (!overwrite && target[field] !== null) continue;
    if (target[field] === incoming) continue;

    sets.push(`${COLUMN[field]} = @${field}`);
    params[field] = incoming;
  }

  // The value is the main deal's; a contact with none gets one to carry it.
  const value = values.value;
  if (value !== null && (overwrite || target.value === null) && target.value !== value) {
    putValue(db, target.id, target.name, value);
  }

  if (sets.length === 0) return;

  db.prepare(`UPDATE leads SET ${sets.join(", ")}, updated_at = @now WHERE id = @id`).run(
    params,
  );
}

const COLUMN: Record<(typeof MERGEABLE)[number], string> = {
  contactPerson: "contact_person",
  email: "email",
  phone: "phone",
  altPhone: "alt_phone",
  location: "location",
  city: "city",
  pin: "pin",
  source: "source",
  website: "website",
  notes: "notes",
};

function putValue(db: Db, leadId: string, name: string, value: number | null): void {
  const deal = mainDeal(db, leadId);
  if (deal) setDealValue(db, deal.id, value, new Date().toISOString());
  else if (value !== null) createDeal(db, leadId, { title: name, stageId: null, value });
}

function toLeadInput(values: ImportValues, campaignId: string | null) {
  return { ...values, stageId: null, campaignId, doNotContact: false, relationship: "prospect" as const };
}

/* ---- Undo --------------------------------------------------------------- */

export function listBatches(db: Db, companyId: string): ImportBatch[] {
  const rows = db
    .prepare(
      `SELECT * FROM import_batches WHERE company_id = ? ORDER BY created_at DESC LIMIT 20`,
    )
    .all(companyId) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row["id"] as string,
    companyId: row["company_id"] as string,
    filename: row["filename"] as string,
    rowCount: row["row_count"] as number,
    createdCount: row["created_count"] as number,
    updatedCount: row["updated_count"] as number,
    skippedCount: row["skipped_count"] as number,
    createdAt: row["created_at"] as string,
    undoneAt: (row["undone_at"] as string | null) ?? null,
  }));
}

/**
 * Reverses a committed import: deletes the leads it created and puts back the
 * values it overwrote.
 *
 * Deleting what a batch created is the easy half. The half that actually
 * saves work is the before-image, because an import that merged into thirty
 * existing leads is otherwise unrecoverable.
 */
export function undoImport(db: Db, batchId: string): { deleted: number; restored: number } {
  const row = db.prepare(`SELECT * FROM import_batches WHERE id = ?`).get(batchId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error("That import is no longer on record.");
  if (row["undone_at"]) throw new Error("That import has already been undone.");

  const beforeImage = JSON.parse(row["before_image"] as string) as Record<string, ImportValues>;

  let deleted = 0;
  let restored = 0;

  db.transaction(() => {
    const created = db
      .prepare(`SELECT id FROM leads WHERE import_batch_id = ?`)
      .all(batchId) as { id: string }[];

    for (const lead of created) {
      deleteLead(db, lead.id);
      deleted += 1;
    }

    for (const [leadId, values] of Object.entries(beforeImage)) {
      const existing = findLead(db, leadId);
      // A lead the user deleted since the import stays deleted; undo reverses
      // this import, it does not resurrect anything.
      if (!existing) continue;

      db.prepare(
        `UPDATE leads SET
           contact_person = @contactPerson, email = @email, phone = @phone,
           alt_phone = @altPhone, location = @location, city = @city, pin = @pin,
           source = @source, website = @website, notes = @notes,
           updated_at = @now
         WHERE id = @id`,
      ).run({ ...values, id: leadId, now: new Date().toISOString() });
      if (existing.value !== values.value) putValue(db, leadId, existing.name, values.value);
      restored += 1;
    }

    db.prepare(`UPDATE import_batches SET undone_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      batchId,
    );
  })();

  return { deleted, restored };
}

/* ---- Template ----------------------------------------------------------- */

/**
 * Builds the spreadsheet offered for download.
 *
 * Generated from the same column list the parser validates against, so the
 * file the user downloads cannot drift from the file Caulder expects.
 */
export async function buildTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Caulder";
  const sheet = workbook.addWorksheet("Leads");

  sheet.columns = TEMPLATE_COLUMNS.map((column) => ({
    header: column,
    key: column,
    width: Math.max(14, column.length + 6),
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.eachCell((cell, index) => {
    const column = TEMPLATE_COLUMNS[index - 1];
    if (column && isRequired(column)) {
      cell.note = "Required. Every other column can be left empty.";
    }
  });

  // One example row, so the shape is obvious without reading instructions.
  sheet.addRow({
    Name: "Bengaluru Public School",
    "Contact Person": "Priya Nair",
    Email: "office@example.com",
    Phone: "9480004094",
    Location: "Bannerghatta Road, Bengaluru - 560083",
    City: "Bengaluru",
    Source: "Directory listing",
    Value: 45000,
  });

  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
}
