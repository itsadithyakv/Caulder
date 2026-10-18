/**
 * Your contacts as a Google Sheet (PLAN.md, part seven).
 *
 * A row a contact, in a spreadsheet in the person's own Drive, so the list can
 * be read and edited on a phone. Caulder is the record; the sheet is a way
 * in. Each time they are brought in step:
 *
 *  1. the sheet is read;
 *  2. what was changed there since Caulder last wrote it is taken in;
 *  3. the whole list is written back.
 *
 * Pure: the columns, a contact as a row and a row as a contact, and the one
 * rule for which side is right. The script that fetches and stores is
 * resources/appsscript/Caulder.gs; the reading and writing is
 * electron/main/services/sheetsync.ts.
 *
 * **Which side is right, a cell at a time.** Caulder keeps what it last wrote
 * to each row (the *base*). A cell that differs from the base was edited in
 * the sheet, and the sheet's word is taken; a cell that matches it was not,
 * and Caulder's stands - so an edit made here and an edit made there to
 * different cells of one contact both survive. When both sides changed the
 * same cell, the sheet wins: it is the edit somebody went out of their way
 * to make. Nothing is ever deleted by the sheet: a row removed there comes
 * back, because taking a contact and its history away is done in Caulder,
 * on purpose.
 */

/** What can be changed from the sheet. Everything else on a row is Caulder's to say. */
export const SHEET_FIELDS = ["name", "contactPerson", "email", "phone", "city", "linkedin", "instagram", "website", "source", "notes"] as const;
export type SheetField = (typeof SHEET_FIELDS)[number];

/** A contact's cells that the sheet may change, as text; an empty cell is null. */
export type SheetValues = Record<SheetField, string | null>;

/** What Caulder shows on a row and overwrites every time: where the deal stands, and what is next. */
export type SheetShown = { stage: string | null; value: string | null; next: string | null; lastContacted: string | null };

const FIELD_HEADING: Record<SheetField, string> = {
  name: "Name",
  contactPerson: "Contact person",
  email: "Email",
  phone: "Phone",
  city: "City",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  website: "Website",
  source: "Source",
  notes: "Notes",
};

/**
 * The headings, in order. The first column is Caulder's own id for the row,
 * which the script hides; the last four are written by Caulder and say so.
 */
export const SHEET_HEADER: readonly string[] = [
  "Caulder ID",
  ...SHEET_FIELDS.map((field) => FIELD_HEADING[field]),
  "Stage (from Caulder)",
  "Value (from Caulder)",
  "Next step (from Caulder)",
  "Last contacted (from Caulder)",
];

/** The most a cell is given: a note longer than this is cut in the sheet, never in Caulder. */
const CELL_MOST = 4000;

/**
 * A cell that a spreadsheet would run as a formula - it opens with =, +, - or
 * @ - is written with an apostrophe in front, which Sheets takes as "this is
 * text" and does not show. A phone number written +91… is the common one.
 */
function safeCell(text: string | null): string {
  const value = (text ?? "").replace(/\r?\n/g, " ").slice(0, CELL_MOST);
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/** A cell as it was read back: trimmed, an apostrophe that was only there to say "text" taken off, empty as null. */
function readCell(cell: unknown): string | null {
  const text = String(cell ?? "").replace(/^'(?=[=+\-@])/, "").trim();
  return text.length > 0 ? text : null;
}

/** The cells of one contact that the sheet may change. */
export function valuesOf(contact: Record<SheetField, string | null>): SheetValues {
  const values = {} as SheetValues;
  // Through the same cut and tidy a cell gets, so what is compared later is what was written.
  for (const field of SHEET_FIELDS) values[field] = readCell(safeCell(contact[field]));
  return values;
}

/** One contact as a row, under SHEET_HEADER. */
export function rowOf(id: string, values: SheetValues, shown: SheetShown): string[] {
  return [
    id,
    ...SHEET_FIELDS.map((field) => safeCell(values[field])),
    safeCell(shown.stage),
    safeCell(shown.value),
    safeCell(shown.next),
    safeCell(shown.lastContacted),
  ];
}

export type SheetRow = { id: string | null; values: SheetValues };

/** One row as it was read, or null for a row with nothing on it that is anybody's. */
export function readRow(cells: readonly unknown[]): SheetRow | null {
  const id = readCell(cells[0]);
  const values = {} as SheetValues;
  SHEET_FIELDS.forEach((field, at) => {
    values[field] = readCell(cells[at + 1]);
  });
  if (id === null && SHEET_FIELDS.every((field) => values[field] === null)) return null;
  return { id, values };
}

type SheetPlan = {
  /** Contacts the sheet changed: only the cells that differ from what Caulder has. */
  updates: { id: string; changes: Partial<SheetValues> }[];
  /** Rows typed into the sheet with no id: contacts to make. `row` is its place in the sheet, counting from 2. */
  creates: { row: number; values: SheetValues }[];
  /** Said to the person afterwards: a row that could not be read as a contact. */
  problems: string[];
};

const same = (a: string | null, b: string | null) => (a ?? "") === (b ?? "");

/**
 * What the sheet asks of Caulder.
 *
 * `local` is every contact as Caulder has it now; `base` is what Caulder last
 * wrote for each, by id (none for a contact never written); `sheet` is the
 * rows as read, in order.
 */
export function planSheet(
  local: ReadonlyMap<string, SheetValues>,
  base: ReadonlyMap<string, SheetValues>,
  sheet: readonly (SheetRow | null)[],
): SheetPlan {
  const plan: SheetPlan = { updates: [], creates: [], problems: [] };
  const seen = new Set<string>();
  /** Names Caulder already has, for a row typed in twice or one whose id was lost. */
  const byName = new Map<string, string>();
  for (const [id, values] of local) {
    const name = (values.name ?? "").toLowerCase();
    if (name && !byName.has(name)) byName.set(name, id);
  }
  const inSheet = new Set(sheet.flatMap((row) => (row?.id ? [row.id] : [])));

  sheet.forEach((row, at) => {
    if (!row) return;
    const line = at + 2;
    let id = row.id;

    if (id !== null && !local.has(id)) {
      // An id Caulder does not know: the contact was deleted here since. The
      // row goes when the list is written back; nothing is made from it.
      return;
    }
    if (id === null) {
      if (row.values.name === null) {
        plan.problems.push(`Row ${line} has no name, so it was not made a contact.`);
        return;
      }
      // The same name as a contact that is not in the sheet: that contact,
      // not a second one. An id lost from the sheet must not double the list.
      const known = byName.get(row.values.name.toLowerCase());
      if (known && !inSheet.has(known) && !seen.has(known)) id = known;
      else {
        plan.creates.push({ row: line, values: row.values });
        return;
      }
    }
    if (seen.has(id)) {
      plan.problems.push(`Row ${line} repeats a contact that is already in the sheet, so it was left out.`);
      return;
    }
    seen.add(id);

    const mine = local.get(id) as SheetValues;
    // Never written before: nothing to compare against, so the sheet has changed nothing.
    const was = base.get(id) ?? mine;
    const changes: Partial<SheetValues> = {};
    for (const field of SHEET_FIELDS) {
      const theirs = row.values[field];
      if (same(theirs, was[field]) || same(theirs, mine[field])) continue;
      // A name cannot be taken away: a contact without one is not a contact.
      if (field === "name" && theirs === null) continue;
      changes[field] = theirs;
    }
    if (Object.keys(changes).length > 0) plan.updates.push({ id, changes });
  });

  return plan;
}

/** Whether a link Caulder is about to open is a Google spreadsheet, and nothing else. */
export function isSheetUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+(?:\/[\w?=&#.%/-]*)?$/.test(url);
}

/** Where the sync stands for one company, for the card in Settings. */
export type SheetState = {
  /** Whether this company's contacts are kept in a sheet. */
  linked: boolean;
  /** Why it cannot be, or null when it can: Google not connected, or a script too old. */
  blocked: string | null;
  syncedAt: string | null;
  /** How many contacts were in the last write. */
  count: number;
  /** What went wrong the last time, in a sentence; null when it went. */
  error: string | null;
  /** What the last sync could not take in from the sheet, a row at a time. */
  problems: string[];
  /** What the last sync took in: contacts changed and contacts made. */
  changed: number;
  made: number;
};
