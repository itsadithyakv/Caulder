/**
 * The import contract.
 *
 * The column list is declared once, here. The downloadable template is
 * generated from it, header validation checks against it, and the mapping UI
 * offers it. That is what stops the file the user downloads drifting from the
 * file the parser expects.
 */

export const REQUIRED_COLUMNS = ["Name"] as const;

const OPTIONAL_COLUMNS = [
  "Contact Person",
  "Email",
  "Phone",
  "Alt Phone",
  "Location",
  "City",
  "Source",
  "Value",
  "Website",
  "Notes",
] as const;

export const TEMPLATE_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS] as const;

export type TemplateColumn = (typeof TEMPLATE_COLUMNS)[number];

/**
 * Only the name is required. The real source file has rows carrying nothing
 * but a school name, and refusing those would mean refusing most of the file.
 */
export function isRequired(column: TemplateColumn): boolean {
  return (REQUIRED_COLUMNS as readonly string[]).includes(column);
}

/**
 * Header text the mapper recognises without being told, keyed by the column it
 * maps to. Drawn from the headers the actual file uses ("School name",
 * "Phone number") plus the obvious synonyms, so the common case needs no
 * mapping at all.
 */
const ALIASES: Record<TemplateColumn, string[]> = {
  Name: ["name", "school name", "company", "company name", "organisation", "organization", "lead", "lead name", "school"],
  "Contact Person": ["contact person", "contact", "contact name", "person", "owner", "principal"],
  Email: ["email", "e-mail", "email address", "mail", "email id"],
  Phone: ["phone", "phone number", "mobile", "contact number", "number", "telephone", "mobile number"],
  "Alt Phone": ["alt phone", "alternate phone", "alternative phone", "phone 2", "secondary phone", "other phone"],
  Location: ["location", "address", "full address"],
  City: ["city", "town"],
  Source: ["source", "lead source", "listing", "referred by"],
  Value: ["value", "deal value", "amount", "worth", "budget"],
  Website: ["website", "site", "url", "web"],
  Notes: ["notes", "note", "remarks", "comments", "description"],
};

/** Loose match: case, spacing and punctuation should not decide a mapping. */
function fold(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Best guess at which column a spreadsheet header means. Returns null when
 * nothing fits, which leaves the user to map it or ignore it.
 */
export function guessColumn(header: string): TemplateColumn | null {
  const folded = fold(header);
  if (folded === "") return null;

  for (const column of TEMPLATE_COLUMNS) {
    if (ALIASES[column].some((alias) => fold(alias) === folded)) return column;
  }
  // Fall back to containment so "Contact phone number" still finds Phone.
  for (const column of TEMPLATE_COLUMNS) {
    if (ALIASES[column].some((alias) => folded.includes(fold(alias)))) return column;
  }
  return null;
}

/**
 * Which spreadsheet column feeds which field. Keyed by the column's index in
 * the sheet, because headers repeat and are not reliable keys.
 */
export type ColumnMapping = Record<number, TemplateColumn | null>;

/** Limits, matching Unifloe's importer. Both far above this user's volume. */
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 5000;

/* ---- Preview results ---------------------------------------------------- */

/**
 * What the preview says about one row. Reused from Unifloe's importer, which
 * settled on exactly this shape.
 */
export type ImportRowResult = {
  rowNumber: number;
  status: "valid" | "error" | "duplicate";
  errors: string[];
  /** What the row became after normalisation. Absent when it could not parse. */
  values?: ImportValues;
  /** Set when status is "duplicate": the lead it matched, and why. */
  match?: DuplicateMatch;
};

export type ImportValues = {
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  altPhone: string | null;
  location: string | null;
  city: string | null;
  pin: string | null;
  source: string | null;
  website: string | null;
  value: number | null;
  notes: string | null;
};

export type DuplicateMatch = {
  /** Null when the match is an earlier row in this same file. */
  leadId: string | null;
  leadName: string;
  /** Set when leadId is null: the row in this file that this one repeats. */
  rowNumber?: number;
  /** Which rule matched, in the order the rules are tried. */
  on: "email+name" | "phone" | "name+city";
  /** Fields where the incoming row and the existing lead disagree. */
  conflicts: FieldConflict[];
};

export type FieldConflict = {
  field: keyof ImportValues;
  label: string;
  existing: string | null;
  incoming: string | null;
};

/**
 * What to do with a duplicate row.
 *
 * The plan asked for a per-field choice on every conflict. Two update modes
 * turned out to cover the same ground: the question a user is really asking is
 * "is the sheet or the app more current", and that answer is the same for
 * every field in the row. Twenty conflicting rows become twenty clicks, not
 * a hundred, and the conflicting values are still shown either way.
 *
 * - `skip`      leave the existing lead untouched. The default: doing nothing is safe.
 * - `fill`      add only what the existing lead is missing; never overwrite.
 * - `overwrite` take the imported values wherever the row has one.
 * - `create`    a genuinely different lead that happens to look similar.
 */
export type Resolution = "skip" | "fill" | "overwrite" | "create";

export const RESOLUTION_LABEL: Record<Resolution, string> = {
  skip: "Skip",
  fill: "Fill in blanks",
  overwrite: "Use imported",
  create: "Add as new",
};

export type ImportPreview = {
  jobId: string;
  filename: string;
  headers: string[];
  mapping: ColumnMapping;
  rows: ImportRowResult[];
  counts: { total: number; valid: number; errors: number; duplicates: number };
};

/** A file the user has picked, described well enough to map its columns. */
export type ChosenFile = {
  fileId: string;
  filename: string;
  headers: string[];
  mapping: ColumnMapping;
  /** A few rows so the mapping screen can show what each column holds. */
  sample: string[][];
  rowCount: number;
};

export type ImportSummary = {
  batchId: string;
  created: number;
  updated: number;
  skipped: number;
};

/** A committed import, as offered back for undo. */
export type ImportBatch = {
  id: string;
  companyId: string;
  filename: string;
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  createdAt: string;
  undoneAt: string | null;
};
