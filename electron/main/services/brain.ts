import type { Db } from "../db/connection";
import {
  ENTITY_TYPES,
  ENTRY_TEMPLATE,
  cleanFields,
  cleanSecret,
  evaluateChecklist,
  isSection,
  maskSecret,
  pageSaveInput,
  quarterLabel,
  templateFits,
  templateOf,
  templateStart,
  type BrainHome,
  type BrainPage,
  type BrainPageSummary,
  type BrainRevision,
  type FieldValue,
} from "@shared/brain";
import type { SearchHit } from "@shared/search";
import { today as todayIn } from "@shared/dates";
import {
  checklistPages,
  countBySection,
  createPage,
  deletePage,
  findPage,
  findPageRow,
  findSingle,
  findStoredRevision,
  listPinnedPages,
  listRecentPages,
  listRevisions,
  listSection,
  pagesOf,
  savePageRow,
  setPageArchived,
  setPagePinned,
  type StoredFields,
} from "../repositories/brain";
import { withHome } from "../repositories/companies";
import { searchEverything } from "../repositories/search";
import { linkLabelsOnly } from "@shared/links";
import type { DecisionEntry } from "@shared/brain";
import { deleteNote } from "../repositories/notes";
import { isSealed, openSecret, sealSecret } from "./secrets";
import { appendToEntry, journalEntry } from "./life";
import { linkToken } from "@shared/links";

/**
 * The company brain, as main sees it: making pages, saving them with their
 * secrets sealed, putting old versions back, and the numbers other parts of
 * the app read - the invoice, the home page.
 */

function pageOr(db: Db, id: string): BrainPage {
  const page = findPage(db, id);
  if (!page) throw new Error("That page no longer exists.");
  return page;
}

export function getPage(db: Db, id: string): BrainPage {
  return pageOr(db, id);
}

/**
 * A new page from a template - or, for a template a company has one of, the
 * one it already has, brought back from the archive if it was there.
 */
export function newPage(
  db: Db,
  companyId: string,
  section: unknown,
  templateId: unknown,
  now: Date,
  presetId?: unknown,
): BrainPage {
  if (!isSection(section)) throw new Error("That is not a section of the brain.");
  const id = typeof templateId === "string" ? templateId : "page";
  if (!templateFits(id, section)) throw new Error("That kind of page does not belong in this section.");

  const template = templateOf(id);
  const at = now.toISOString();

  // The journal has one entry a day: making one opens today's.
  if (template.id === ENTRY_TEMPLATE) return journalEntry(db, companyId, null, now);

  if (template.single) {
    const existing = findSingle(db, companyId, template.id);
    if (existing) {
      if (existing.isArchived) setPageArchived(db, existing.id, false, at);
      return pageOr(db, existing.id);
    }
  }

  const start = templateStart(template.id, typeof presetId === "string" ? presetId : null);
  const pageId = createPage(
    db,
    companyId,
    { section, template: template.id, title: start.title, body: start.body, fields: start.fields },
    at,
  );
  return pageOr(db, pageId);
}

/**
 * Saves an edit. Plain fields are checked against the template; a secret is
 * sealed if it was given, cleared if it was emptied, and kept as it was if
 * the window did not mention it - which is the usual case, because the window
 * never has it.
 */
export function savePage(db: Db, id: string, raw: unknown, now: Date): BrainPage {
  const input = pageSaveInput.parse(raw);
  const row = findPageRow(db, id);
  if (!row) throw new Error("That page no longer exists.");

  const template = templateOf(row.template);
  const next: StoredFields = { ...cleanFields(template, input.fields) };
  // A journal entry's day is set when it is made and kept through every edit.
  if (template.id === ENTRY_TEMPLATE && row.stored["day"] !== undefined) next["day"] = row.stored["day"];

  for (const field of template.fields) {
    if (field.kind !== "secret") continue;
    if (Object.hasOwn(input.secrets, field.key)) {
      const value = cleanSecret(field, input.secrets[field.key] ?? null);
      if (value !== null) next[field.key] = sealSecret(value);
    } else {
      const kept = row.stored[field.key];
      if (isSealed(kept)) next[field.key] = kept;
    }
  }

  savePageRow(db, id, { title: input.title, body: input.body, fields: next }, input.baseRevision, now.toISOString());
  return pageOr(db, id);
}

/** One secret, readable, for the moment somebody asked to see or copy it. */
export function revealSecret(db: Db, id: string, key: unknown): string {
  const row = findPageRow(db, id);
  if (!row) throw new Error("That page no longer exists.");
  const field = templateOf(row.template).fields.find((candidate) => candidate.key === key);
  if (!field || field.kind !== "secret") throw new Error("That field is not a secret.");
  const sealed = row.stored[field.key];
  if (!isSealed(sealed)) throw new Error(`No ${field.label} is saved on this page.`);
  const value = openSecret(sealed);
  if (value === null) {
    throw new Error(
      `This ${field.label} was saved by another Windows account or before the machine's keys were reset, so it cannot be read here. Type it in again.`,
    );
  }
  return value;
}

/** An old version, put back as the newest - so putting it back is itself in the history. */
export function restoreRevision(db: Db, id: string, revision: unknown, now: Date): BrainPage {
  if (typeof revision !== "number" || !Number.isInteger(revision)) throw new Error("Missing revision.");
  const row = findPageRow(db, id);
  if (!row) throw new Error("That page no longer exists.");
  const old = findStoredRevision(db, id, revision);
  if (!old) throw new Error("That version is no longer kept.");
  // Never folded into the version before it: that is the one being put aside.
  savePageRow(db, id, old, row.revision, now.toISOString(), false);
  return pageOr(db, id);
}

export function pinPage(db: Db, id: string, pinned: boolean): BrainPage {
  pageOr(db, id);
  setPagePinned(db, id, pinned);
  return pageOr(db, id);
}

export function archivePage(db: Db, id: string, archived: boolean, now: Date): BrainPage {
  pageOr(db, id);
  setPageArchived(db, id, archived, now.toISOString());
  return pageOr(db, id);
}

export function removePage(db: Db, id: string): void {
  pageOr(db, id);
  deletePage(db, id);
}

export function sectionPages(db: Db, companyId: string, section: unknown, archived: boolean): BrainPageSummary[] {
  if (!isSection(section)) throw new Error("That is not a section of the brain.");
  return listSection(db, companyId, section, archived);
}

export function pageRevisions(db: Db, id: string): BrainRevision[] {
  pageOr(db, id);
  return listRevisions(db, id);
}

const HOME_RECENT = 6;

export function brainHome(db: Db, companyId: string, now: Date): BrainHome {
  const company = db.prepare(`SELECT name, timezone FROM companies WHERE id = ?`).get(companyId) as
    | { name: string; timezone: string }
    | undefined;
  if (!company) throw new Error("That company no longer exists.");

  const profile = findSingle(db, companyId, "profile");
  const text = (key: string): string | null => {
    const value = profile?.fields[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  const numbers: { label: string; value: string }[] = [];
  for (const field of templateOf("profile").fields) {
    if (!["cin", "pan", "tan", "gstin", "udyam"].includes(field.key)) continue;
    const shown = field.kind === "secret" ? profile?.secrets[field.key] : text(field.key);
    if (shown) numbers.push({ label: field.label, value: shown });
  }

  const entity = text("entityType");

  // The rail counts what a section holds. Three hold more than pages: Tax has
  // the filing calendar, Documents is the documents themselves, and People
  // the people and the roles being hired for.
  const counts = countBySection(db, companyId);
  const rows = (sql: string) => (db.prepare(sql).get(companyId) as { n: number }).n;
  counts.tax += rows(`SELECT COUNT(*) AS n FROM obligations WHERE company_id = ?`);
  counts.documents += rows(`SELECT COUNT(*) AS n FROM documents WHERE company_id = ?`);
  counts.metrics += rows(`SELECT COUNT(*) AS n FROM metrics WHERE company_id = ?`);
  counts.people +=
    rows(`SELECT COUNT(*) AS n FROM people WHERE company_id = ?`) + rows(`SELECT COUNT(*) AS n FROM openings WHERE company_id = ?`);

  return {
    company: {
      name: text("tradingName") ?? text("legalName") ?? company.name,
      profileId: profile && !profile.isArchived ? profile.id : null,
      oneLiner: text("oneLiner"),
      entityType: ENTITY_TYPES.find((option) => option.value === entity)?.label ?? null,
      numbers,
    },
    checklist: evaluateChecklist(checklistPages(db, companyId), todayIn(company.timezone, now), {
      founders: db
        .prepare(
          `SELECT COUNT(*) AS count,
                  COUNT(NULLIF(TRIM(COALESCE(owns, '')), '')) AS withOwns,
                  COUNT(CASE WHEN equity > 0 THEN 1 END) AS withEquity
             FROM people WHERE company_id = ? AND kind = 'founder'`,
        )
        .get(companyId) as { count: number; withOwns: number; withEquity: number },
      pricedProducts: (
        db
          .prepare(
            `SELECT COUNT(DISTINCT p.id) AS n FROM products p
               JOIN prices r ON r.product_id = p.id
              WHERE p.company_id = ?`,
          )
          .get(companyId) as { n: number }
      ).n,
    }),
    recent: listRecentPages(db, companyId, HOME_RECENT),
    pinned: listPinnedPages(db, companyId),
    counts,
  };
}

/** A heading's text, up to the next heading, as plain words. */
function underHeading(body: string, heading: RegExp): string | null {
  const lines = body.split(/\r?\n/);
  const at = lines.findIndex((line) => /^#{1,6}\s/.test(line) && heading.test(line));
  if (at === -1) return null;
  const rest: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    rest.push(line);
  }
  const text = rest.join(" ").replace(/\s+/g, " ").trim();
  return text || null;
}

/**
 * The decision log: every decision page, newest first by the day it was
 * decided, each with what was decided in a line. The pages stay pages - a
 * decision is prose with links and a history - and this is how they are read
 * as a log.
 */
export function decisionLog(db: Db, companyId: string): DecisionEntry[] {
  const rows = db
    .prepare(
      `SELECT id, title, body, fields, created_at FROM brain_pages
        WHERE company_id = ? AND section = 'decisions' AND is_archived = 0`,
    )
    .all(companyId) as { id: string; title: string; body: string; fields: string; created_at: string }[];
  const day = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
  const words = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  return rows
    .map((row) => {
      let fields: Record<string, unknown> = {};
      try {
        fields = JSON.parse(row.fields) as Record<string, unknown>;
      } catch {
        fields = {};
      }
      const plain = linkLabelsOnly(row.body);
      const decided = underHeading(plain, /what we decided/i);
      const first = plain
        .split(/\r?\n/)
        .filter((line) => line.trim() && !/^#{1,6}\s/.test(line))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const summary = (decided ?? first).replace(/[*_`>]/g, "").replace(/^-\s*/, "");
      return {
        entry: {
          id: row.id,
          title: row.title,
          decidedOn: day(fields["decidedOn"]),
          decidedBy: words(fields["decidedBy"]),
          revisitOn: day(fields["revisitOn"]),
          summary: summary.length > 280 ? `${summary.slice(0, 279)}…` : summary,
        },
        sortOn: day(fields["decidedOn"]) ?? row.created_at.slice(0, 10),
      };
    })
    .sort((a, b) => b.sortOn.localeCompare(a.sortOn) || a.entry.title.localeCompare(b.entry.title))
    .map(({ entry }) => entry);
}

/** Search everything; with nothing typed, the pages most recently written. */
export function search(db: Db, companyId: string, text: unknown): SearchHit[] {
  const query = typeof text === "string" ? text.slice(0, 200) : "";
  if (query.trim().length === 0) {
    return listRecentPages(db, companyId, 8).map((page) => ({
      kind: "page",
      id: page.id,
      title: page.title,
      detail: page.excerpt,
      section: page.section,
      leadId: null,
    }));
  }
  // Your own pages - the journal, Life - are found whichever company is chosen.
  return searchEverything(db, withHome(db, companyId), query);
}

/**
 * A caught note, filed as a page. The page is written before the note goes,
 * in one transaction, so filing never loses the thought. Filed into the
 * journal, it joins the entry for the day it was caught.
 */
export function fileNote(db: Db, noteId: unknown, section: unknown, now: Date): BrainPage {
  if (typeof noteId !== "string") throw new Error("Missing note id.");
  if (!isSection(section)) throw new Error("That is not a section of the brain.");
  const note = db.prepare(`SELECT id, company_id, body, day FROM notes WHERE id = ?`).get(noteId) as
    | { id: string; company_id: string; body: string; day: string }
    | undefined;
  if (!note) throw new Error("That note no longer exists.");

  if (section === "journal") {
    return db.transaction(() => {
      const entry = appendToEntry(db, note.company_id, note.day, note.body, now);
      deleteNote(db, note.id);
      return entry;
    })();
  }

  const first = note.body.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "Note";
  const title = first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first;
  const template = section === "ideas" ? "idea" : "page";

  let pageId = "";
  db.transaction(() => {
    pageId = createPage(db, note.company_id, { section, template, title, body: note.body }, now.toISOString());
    deleteNote(db, note.id);
  })();
  return pageOr(db, pageId);
}

/**
 * A page made from another and linked back to it: an exam from its course,
 * class notes from theirs. The link is what the course reads its exams by.
 */
export function newLinkedPage(db: Db, fromId: unknown, templateId: unknown, now: Date): BrainPage {
  if (typeof fromId !== "string") throw new Error("Missing the page it is for.");
  const from = findPageRow(db, fromId);
  if (!from) throw new Error("That page no longer exists.");
  const template = templateOf(typeof templateId === "string" ? templateId : "page");
  if (template.section !== from.section || template.single || template.id === ENTRY_TEMPLATE) {
    throw new Error("That kind of page cannot be made from this one.");
  }
  const title = `${template.title}: ${from.title}`.slice(0, 160);
  const body = `For ${linkToken(from.title, { kind: "page", id: from.id })}.\n\n${template.body}`;
  const id = createPage(db, from.company_id, { section: template.section, template: template.id, title, body }, now.toISOString());
  return pageOr(db, id);
}

/** What an invoice prints about the company that sends it. */
type InvoiceIssuer = {
  name: string;
  address: string | null;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  payTo: string[];
};

export function invoiceIssuer(db: Db, companyId: string, fallbackName: string): InvoiceIssuer {
  const profile = pagesOf(db, companyId, "profile")[0]?.stored ?? {};
  const text = (fields: StoredFields, key: string): string | null => {
    const value = fields[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  };

  // The account marked for invoices; failing that, nothing - printing the
  // wrong account is worse than printing none.
  const bank = pagesOf(db, companyId, "bank").find((page) => page.stored["onInvoices"] === true)?.stored;
  const payTo: string[] = [];
  if (bank) {
    const sealed = bank["number"];
    const number = isSealed(sealed) ? openSecret(sealed) : null;
    const line = (label: string, value: string | null) => {
      if (value) payTo.push(`${label}: ${value}`);
    };
    line("Bank", text(bank, "bankName"));
    line("Account name", text(bank, "holder"));
    line("Account number", number);
    line("IFSC", text(bank, "ifsc"));
    line("UPI", text(bank, "upi"));
  }

  return {
    name: text(profile, "legalName") ?? fallbackName,
    address: text(profile, "registeredAddress") ?? text(profile, "workingAddress"),
    gstin: text(profile, "gstin"),
    email: text(profile, "email"),
    phone: text(profile, "phone"),
    payTo,
  };
}

/** A stored value as words, for the export. Secrets masked unless asked for. */
export function describeValue(
  kind: string,
  value: StoredFields[string] | undefined,
  options: readonly { value: string; label: string }[] | undefined,
  secrets: boolean,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (isSealed(value)) {
    if (!secrets) return maskSecret(value.last4);
    return openSecret(value) ?? `${maskSecret(value.last4)} (cannot be read on this machine)`;
  }
  const plain = value as FieldValue;
  if (kind === "check") return plain === true ? "Yes" : null;
  if (kind === "quarter") return quarterLabel(String(plain));
  if (kind === "choice") return options?.find((option) => option.value === plain)?.label ?? String(plain);
  return String(plain);
}
