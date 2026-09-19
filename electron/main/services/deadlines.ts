import type { Db } from "../db/connection";
import { companyCountry } from "../repositories/companies";
import {
  OBLIGATION_KIND_LABEL,
  PRESET_SETS,
  daysLeftOf,
  occurrences,
  offerPresets,
  openOccurrences,
  periodOf,
  type Deadline,
  type DeadlinesOverview,
  type PresetOffer,
  type PresetSetId,
} from "@shared/deadlines";
import { addMonths, shiftDay, today as todayIn } from "@shared/dates";
import {
  addPresets,
  addedPresets,
  createObligation,
  deleteObligation,
  doneByObligation,
  listObligations,
  markDone,
  undoDone,
  updateObligation,
} from "../repositories/obligations";

/**
 * Everything with a date, in one list: the obligations' occurrences, the dates
 * already written on brain pages - a contract's notice day and end, a
 * registration's or trademark's renewal, an exam - when a document expires, and when
 * somebody's time here ends or their vesting cliff arrives. Today
 * shows what is due soon, the Calendar shows each day's, and the daily
 * notification counts what is due today or late.
 *
 * Page dates are read, not copied: change the date on the contract and the
 * deadline moves, with nothing to keep in step.
 */

/** How far ahead a date written on a page is worth seeing, and how long after it has passed. */
const PAGE_AHEAD = 30;
const PAGE_BEHIND = 7;

function companyOf(db: Db, companyId: string): { timezone: string; currency: string } {
  const row = db.prepare(`SELECT timezone, currency FROM companies WHERE id = ?`).get(companyId) as
    | { timezone: string; currency: string }
    | undefined;
  if (!row) throw new Error("That company no longer exists.");
  return row;
}

type DatedPage = { id: string; title: string; template: string; fields: string };

function field(fields: string, key: string): unknown {
  try {
    return (JSON.parse(fields) as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function asDay(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Every date written on a page that something should happen by, in a window. */
function pageDates(db: Db, companyId: string, from: string, through: string, today: string): Deadline[] {
  const pages = db
    .prepare(
      `SELECT id, title, template, fields FROM brain_pages
        WHERE company_id = ? AND is_archived = 0 AND template IN ('contract', 'registration', 'trademark', 'decision', 'exam')`,
    )
    .all(companyId) as DatedPage[];

  const out: Deadline[] = [];
  const add = (page: DatedPage, part: string, what: string, dueOn: string | null, title = page.title) => {
    if (!dueOn || dueOn < from || dueOn > through) return;
    out.push({
      key: `page:${page.id}:${part}`,
      source: "page",
      id: page.id,
      title,
      what,
      dueOn,
      daysLeft: daysLeftOf(dueOn, today),
      period: null,
      amount: null,
      doneOn: null,
    });
  };

  for (const page of pages) {
    if (page.template === "contract") {
      const ends = asDay(field(page.fields, "endsOn"));
      const notice = field(page.fields, "noticeDays");
      const party = field(page.fields, "party");
      const title = typeof party === "string" && party.trim() && !page.title.includes(party.trim())
        ? `${page.title} with ${party.trim()}`
        : page.title;
      if (ends && typeof notice === "number" && notice > 0) {
        add(page, "notice", "Give notice, or it carries on", shiftDay(ends, -notice), title);
      }
      add(page, "ends", "Contract ends", ends, title);
    } else if (page.template === "decision") {
      add(page, "revisit", "Look at the decision again", asDay(field(page.fields, "revisitOn")));
    } else if (page.template === "exam") {
      const at = field(page.fields, "at");
      add(page, "exam", typeof at === "string" && at.trim() ? `Exam, ${at.trim()}` : "Exam", asDay(field(page.fields, "examOn")));
    } else {
      add(page, "renews", page.template === "trademark" ? "Trademark renews" : "Registration renews", asDay(field(page.fields, "renewsOn")));
    }
  }
  return out;
}

function documentDates(db: Db, companyId: string, from: string, through: string, today: string): Deadline[] {
  const rows = db
    .prepare(
      `SELECT id, name, expires_on FROM documents
        WHERE company_id = ? AND expires_on IS NOT NULL AND expires_on BETWEEN ? AND ?`,
    )
    .all(companyId, from, through) as { id: string; name: string; expires_on: string }[];
  return rows.map((row) => ({
    key: `document:${row.id}`,
    source: "document" as const,
    id: row.id,
    title: row.name,
    what: "Expires",
    dueOn: row.expires_on,
    daysLeft: daysLeftOf(row.expires_on, today),
    period: null,
    amount: null,
    doneOn: null,
  }));
}

/**
 * A person's dates: the day a freelancer's contract, an internship or a job
 * ends, and a vesting cliff - the day equity first arrives, which is also the
 * last day to part ways before it does.
 */
function personDates(db: Db, companyId: string, from: string, through: string, today: string): Deadline[] {
  const rows = db
    .prepare(
      `SELECT id, name, kind, starts_on, ends_on, equity, cliff_months FROM people
        WHERE company_id = ? AND kind != 'candidate'`,
    )
    .all(companyId) as {
    id: string;
    name: string;
    kind: string;
    starts_on: string | null;
    ends_on: string | null;
    equity: number | null;
    cliff_months: number | null;
  }[];

  const out: Deadline[] = [];
  const add = (row: (typeof rows)[number], part: string, what: string, dueOn: string | null) => {
    if (!dueOn || dueOn < from || dueOn > through) return;
    out.push({
      key: `person:${row.id}:${part}`,
      source: "person",
      id: row.id,
      title: row.name,
      what,
      dueOn,
      daysLeft: daysLeftOf(dueOn, today),
      period: null,
      amount: null,
      doneOn: null,
    });
  };
  for (const row of rows) {
    add(
      row,
      "ends",
      row.kind === "freelancer" ? "Contract ends" : row.kind === "intern" ? "Internship ends" : "Last day",
      row.ends_on,
    );
    if (row.starts_on && (row.equity ?? 0) > 0 && (row.cliff_months ?? 0) > 0) {
      add(row, "cliff", "Vesting cliff", addMonths(row.starts_on, row.cliff_months ?? 0));
    }
  }
  return out;
}

function sorted(deadlines: Deadline[]): Deadline[] {
  return deadlines.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.title.localeCompare(b.title));
}

/**
 * What needs doing soon, for Today: every obligation occurrence not done,
 * from when it started to its own notice ahead of today, and page and document
 * dates from a week ago to a month ahead.
 */
export function dueSoon(db: Db, companyId: string, today: string): Deadline[] {
  const done = doneByObligation(db, companyId);
  const out: Deadline[] = [];
  for (const obligation of listObligations(db, companyId, today)) {
    const doneDays = new Set((done.get(obligation.id) ?? []).map((entry) => entry.dueOn));
    for (const dueOn of openOccurrences(obligation, doneDays, shiftDay(today, obligation.remindDays))) {
      out.push({
        key: `obligation:${obligation.id}:${dueOn}`,
        source: "obligation",
        id: obligation.id,
        title: obligation.title,
        what: OBLIGATION_KIND_LABEL[obligation.kind],
        dueOn,
        daysLeft: daysLeftOf(dueOn, today),
        period: periodOf(obligation.period, dueOn),
        amount: obligation.amount,
        doneOn: null,
      });
    }
  }
  const from = shiftDay(today, -PAGE_BEHIND);
  const through = shiftDay(today, PAGE_AHEAD);
  out.push(
    ...pageDates(db, companyId, from, through, today),
    ...documentDates(db, companyId, from, through, today),
    ...personDates(db, companyId, from, through, today),
  );
  // An exam that has happened is not late: it goes from Today the day after.
  return sorted(out.filter((deadline) => !(deadline.key.endsWith(":exam") && deadline.daysLeft < 0)));
}

/** Every deadline falling in a span, done or not, for the Calendar. */
export function deadlinesBetween(db: Db, companyId: string, from: string, through: string, today: string): Deadline[] {
  const done = doneByObligation(db, companyId);
  const out: Deadline[] = [];
  for (const obligation of listObligations(db, companyId, today)) {
    if (!obligation.active) continue;
    const doneOn = new Map((done.get(obligation.id) ?? []).map((entry) => [entry.dueOn, entry.doneOn]));
    const until = obligation.endsOn && obligation.endsOn < through ? obligation.endsOn : through;
    const start = obligation.startsOn > from ? obligation.startsOn : from;
    for (const dueOn of occurrences(obligation.rule, start, until)) {
      out.push({
        key: `obligation:${obligation.id}:${dueOn}`,
        source: "obligation",
        id: obligation.id,
        title: obligation.title,
        what: OBLIGATION_KIND_LABEL[obligation.kind],
        dueOn,
        daysLeft: daysLeftOf(dueOn, today),
        period: periodOf(obligation.period, dueOn),
        amount: obligation.amount,
        doneOn: doneOn.get(dueOn) ?? null,
      });
    }
  }
  out.push(
    ...pageDates(db, companyId, from, through, today),
    ...documentDates(db, companyId, from, through, today),
    ...personDates(db, companyId, from, through, today),
  );
  return sorted(out);
}

/**
 * What the daily notification counts: a filing due today or late and not
 * done, and a contract's or document's date on the day itself. Today keeps
 * showing a passed date for a week; the notification says it once.
 */
export function dueNowCount(db: Db, companyId: string, today: string): number {
  return dueSoon(db, companyId, today).filter((deadline) =>
    deadline.source === "obligation" ? deadline.daysLeft <= 0 : deadline.daysLeft === 0,
  ).length;
}

/** The profile's entity type and GST scheme, which decide which presets fit. */
function profileOf(db: Db, companyId: string): { entityType: string | null; gstStatus: string | null } {
  const row = db
    .prepare(`SELECT fields FROM brain_pages WHERE company_id = ? AND template = 'profile' ORDER BY created_at LIMIT 1`)
    .get(companyId) as { fields: string } | undefined;
  const entity = row ? field(row.fields, "entityType") : null;
  const gst = row ? field(row.fields, "gstStatus") : null;
  return {
    entityType: typeof entity === "string" && entity ? entity : null,
    gstStatus: typeof gst === "string" && gst ? gst : null,
  };
}

/** The filing calendar, for the brain's Tax and compliance section. */
export function buildDeadlines(db: Db, companyId: string, now: Date = new Date()): DeadlinesOverview {
  const company = companyOf(db, companyId);
  const today = todayIn(company.timezone, now);
  const profile = profileOf(db, companyId);
  const added = addedPresets(db, companyId);
  const offers = Object.fromEntries(
    PRESET_SETS.map((set) => [set.id, offerPresets(set.id, profile, added)]),
  ) as Record<PresetSetId, PresetOffer[]>;
  return {
    day: today,
    currency: company.currency,
    deadlines: dueSoon(db, companyId, today),
    obligations: listObligations(db, companyId, today),
    profile,
    // The country the company chose, or India for one made before countries whose money or clock says so.
    presetSet: companyCountry(db, companyId) === "IN" ? "india" : "generic",
    offers,
  };
}

/* ---- Changes, each handing back the whole calendar ------------------------ */

function obligationCompany(db: Db, id: string): string {
  const row = db.prepare(`SELECT company_id FROM obligations WHERE id = ?`).get(id) as { company_id: string } | undefined;
  if (!row) throw new Error("That deadline no longer exists.");
  return row.company_id;
}

function todayOf(db: Db, companyId: string, now: Date): string {
  return todayIn(companyOf(db, companyId).timezone, now);
}

export function addDeadline(db: Db, companyId: string, raw: unknown, now: Date = new Date()): DeadlinesOverview {
  createObligation(db, companyId, raw, todayOf(db, companyId, now), now);
  return buildDeadlines(db, companyId, now);
}

export function editDeadline(db: Db, id: string, raw: unknown, now: Date = new Date()): DeadlinesOverview {
  const companyId = obligationCompany(db, id);
  updateObligation(db, id, raw, todayOf(db, companyId, now), now);
  return buildDeadlines(db, companyId, now);
}

export function removeDeadline(db: Db, id: string, now: Date = new Date()): DeadlinesOverview {
  const companyId = obligationCompany(db, id);
  deleteObligation(db, id);
  return buildDeadlines(db, companyId, now);
}

/** One occurrence, done today. The due day says which: GSTR-1 for September is the one due on 11 October. */
export function markDeadlineDone(db: Db, id: string, dueOn: string, now: Date = new Date()): DeadlinesOverview {
  const companyId = obligationCompany(db, id);
  markDone(db, id, dueOn, todayOf(db, companyId, now), {}, now);
  return buildDeadlines(db, companyId, now);
}

export function undoDeadline(db: Db, id: string, dueOn: string, now: Date = new Date()): DeadlinesOverview {
  const companyId = obligationCompany(db, id);
  undoDone(db, id, dueOn);
  return buildDeadlines(db, companyId, now);
}

export function addPresetDeadlines(
  db: Db,
  companyId: string,
  ids: readonly string[],
  now: Date = new Date(),
): DeadlinesOverview {
  addPresets(db, companyId, ids, todayOf(db, companyId, now), now);
  return buildDeadlines(db, companyId, now);
}
