import type { Db } from "../db/connection";
import { ENTRY_TEMPLATE, sectionOf, templateOf, type BrainSectionId } from "@shared/brain";
import { sayTrail } from "@shared/branches";
import { today as todayIn } from "@shared/dates";
import { linkLabelsOnly } from "@shared/links";
import { trailsOf, underOf } from "@shared/memories";
import { MARK_CLOSE, MARK_OPEN } from "@shared/search";
import { briefMarkdown, coveredBy, PIECE_BUDGET, topicName, topicWords, type TopicBrief, type TopicPiece } from "@shared/topic";
import { pagesOf } from "../repositories/brain";
import { searchEverything } from "../repositories/search";
import { describeValue } from "./brain";
import { isSealed } from "./journal-lock";

/**
 * Everything Caulder holds about one topic, as one block of Markdown to paste
 * into an AI that is not Caulder's.
 *
 * **Why this is not the search results.** Search answers "where is the word";
 * a brief answers "what is known". Those differ most where the app is most
 * useful: a page called Riptide, filed under Guitar, never contains the word
 * *guitar*, and a search for guitar will never show it. So the spine is the
 * index - it is the thing that already knows how to find anything - and then
 * every page it found drags in everything hanging beneath it, which is what
 * `underOf` reads off the "Part of" line each page carries.
 *
 * **Why the journal is pulled out of the page hits.** A journal day is a
 * brain page like any other, so the index returns it as one. It must not be
 * written out as one: a locked day has to be checked for, and a day reads as
 * a day rather than as a page. Routing it by template rather than by section
 * is deliberate - the section is where a page is filed and can be changed;
 * the template is what the page is.
 *
 * **What never comes near this file.** `journal_private` is not queried,
 * imported or joined to, the way `yours.ts` does not query it: the lines in
 * it are plain text until a passcode exists, so a guard phrased as "skip the
 * private ones" would be a guard that has already read them. Secrets are
 * masked by `describeValue`, and the search index does not hold them at all.
 */

/** Hits to start from. More than the palette shows, because this is not a list to read. */
const HITS = 40;

/** The most pages one match drags in beneath it, so a hobby with a hundred songs stays a paste. */
const UNDER_MOST = 40;

/** The most pages the trail rule adds on its own, so "unifloe" does not mean the whole brain. */
const TRAIL_MOST = 25;

/** Rows of the day-to-day: enough to see a shape, not the whole history. */
const ROWS_MOST = 40;

/** How much of a contact's history goes with it. */
const HISTORY_MOST = 15;

type Page = ReturnType<typeof pagesOf>[number];

/**
 * A LIKE clause per word, all of which must match. The index does its own
 * matching; this is for the three tables it does not cover - the calendar,
 * what the line logged, and tasks - and there every word typed has to appear
 * or "guitar" pulls in every hour ever set aside for anything.
 */
function allWords(columns: readonly string[], words: readonly string[]): { sql: string; args: string[] } {
  const per = columns.map((column) => `LOWER(COALESCE(${column}, '')) LIKE ?`).join(" OR ");
  return {
    sql: words.map(() => `(${per})`).join(" AND "),
    args: words.flatMap((word) => columns.map(() => `%${word}%`)),
  };
}

/** A page's own fields, as the export writes them: masked, and only the ones filled in. */
function fieldLines(page: Page): string[] {
  const template = templateOf(page.template);
  const out: string[] = [];
  for (const field of template.fields) {
    const value = describeValue(field.kind, page.stored[field.key], field.options, false);
    if (value !== null) out.push(`- **${field.label}:** ${value.replace(/\n/g, ", ")}`);
  }
  return out;
}

/** What a page is and where it sits: "Hobby · Me › Hobbies". */
function placeOf(page: Page, trail: readonly string[]): string {
  const what = templateOf(page.template).name;
  const where = sayTrail(trail.map((title) => ({ title })));
  return where.length > 0 ? `${what} · ${where}` : `${what} · ${sectionOf(page.section as BrainSectionId).label}`;
}

function pagePiece(page: Page, trail: readonly string[], kind: "page" | "under"): TopicPiece {
  const body = linkLabelsOnly(page.body).trim().slice(0, PIECE_BUDGET);
  const fields = fieldLines(page);
  return {
    kind,
    title: page.title,
    note: placeOf(page, trail),
    lines: [...(fields.length > 0 ? [...fields, ""] : []), body],
  };
}

/** The words of a snippet, with the marks the palette draws its highlights from taken off. */
function plain(detail: string): string {
  return detail.split(MARK_OPEN).join("").split(MARK_CLOSE).join("");
}

function hours(db: Db, companyId: string, words: readonly string[]): TopicPiece | null {
  const where = allWords(["title", "notes"], words);
  const rows = db
    .prepare(
      `SELECT day, starts_at, minutes, title FROM blocks
        WHERE company_id = ? AND ${where.sql} ORDER BY day DESC, starts_at DESC LIMIT ?`,
    )
    .all(companyId, ...where.args, ROWS_MOST) as { day: string; starts_at: string; minutes: number; title: string }[];
  if (rows.length === 0) return null;

  const total = db
    .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(minutes), 0) AS m FROM blocks WHERE company_id = ? AND ${where.sql}`)
    .get(companyId, ...where.args) as { n: number; m: number };
  const spent = total.m >= 60 ? `${Math.round((total.m / 60) * 10) / 10} hours` : `${total.m} minutes`;

  return {
    kind: "hours",
    title: "Hours set aside for it",
    // The count is over everything; the list is the most recent. Said, so a
    // reader does not add the list up and get a different answer.
    note: `${spent} across ${total.n} ${total.n === 1 ? "block" : "blocks"} in the calendar. The most recent ${Math.min(rows.length, ROWS_MOST)}:`,
    lines: rows.map((row) => `- ${row.day} ${row.starts_at}, ${row.minutes} minutes: ${row.title}`),
  };
}

function logged(db: Db, companyId: string, words: readonly string[]): TopicPiece | null {
  const where = allWords(["topic", "metric"], words);
  const rows = db
    .prepare(
      `SELECT day, topic, metric, value, unit, reps, best FROM hobby_logs
        WHERE company_id = ? AND ${where.sql} ORDER BY day DESC LIMIT ?`,
    )
    .all(companyId, ...where.args, ROWS_MOST) as {
    day: string;
    topic: string;
    metric: string;
    value: number;
    unit: string;
    reps: number | null;
    best: number;
  }[];
  if (rows.length === 0) return null;
  return {
    kind: "logged",
    title: "What was logged about it",
    note: "Numbers the owner told Caulder in a sentence, newest first. A best is the best so far at the time it was set.",
    lines: rows.map(
      (row) =>
        `- ${row.day}: ${row.topic} ${row.metric} ${row.value}${row.unit}${row.reps ? ` x ${row.reps}` : ""}${row.best === 1 ? " (best)" : ""}`,
    ),
  };
}

function tasks(db: Db, companyId: string, words: readonly string[]): TopicPiece | null {
  const where = allWords(["title", "notes"], words);
  const rows = db
    .prepare(
      `SELECT title, due_on, status, area FROM tasks
        WHERE company_id = ? AND ${where.sql} ORDER BY status, due_on DESC LIMIT ?`,
    )
    .all(companyId, ...where.args, ROWS_MOST) as { title: string; due_on: string; status: string; area: string | null }[];
  if (rows.length === 0) return null;
  return {
    kind: "task",
    title: "Tasks about it",
    note: "Open ones first.",
    lines: rows.map(
      (row) => `- [${row.status === "done" ? "x" : " "}] ${row.title}${row.area ? ` (${row.area})` : ""} - ${row.due_on}`,
    ),
  };
}

/** A contact, with what has happened to it: the brief is about a topic, and a person can be one. */
function contact(db: Db, companyId: string, leadId: string): TopicPiece | null {
  const lead = db
    .prepare(
      `SELECT l.name, l.contact_person, l.email, l.phone, l.city, l.website, l.value, l.notes, l.do_not_contact,
              s.name AS stage
         FROM leads l LEFT JOIN pipeline_stages s ON s.id = l.stage_id
        WHERE l.id = ? AND l.company_id = ?`,
    )
    .get(leadId, companyId) as
    | {
        name: string;
        contact_person: string | null;
        email: string | null;
        phone: string | null;
        city: string | null;
        website: string | null;
        value: number | null;
        notes: string | null;
        do_not_contact: number;
        stage: string | null;
      }
    | undefined;
  if (!lead) return null;

  const facts: [string, string | null][] = [
    ["Contact", lead.contact_person],
    ["Email", lead.email],
    ["Phone", lead.phone],
    ["City", lead.city],
    ["Website", lead.website],
    ["Stage", lead.stage],
    ["Worth", lead.value === null ? null : String(lead.value)],
  ];
  const lines = facts.filter(([, value]) => value).map(([label, value]) => `- **${label}:** ${value}`);
  if (lead.do_not_contact === 1) lines.push("- **Do not contact:** yes");
  if (lead.notes?.trim()) lines.push("", lead.notes.trim());

  const history = db
    .prepare(
      `SELECT kind, body, occurred_at FROM activities
        WHERE lead_id = ? ORDER BY occurred_at DESC, created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(leadId, HISTORY_MOST) as { kind: string; body: string | null; occurred_at: string }[];
  if (history.length > 0) {
    lines.push("", "History, newest first:");
    for (const entry of history) {
      lines.push(`- ${entry.occurred_at.slice(0, 10)} ${entry.kind}${entry.body ? `: ${entry.body}` : ""}`);
    }
  }
  return { kind: "contact", title: lead.name, note: "A contact in the pipeline", lines };
}

export function buildTopicBrief(
  db: Db,
  companyId: string,
  raw: unknown,
  now: Date = new Date(),
  /** Pages nearest the topic in meaning, when the model on this machine found any (phase 22). */
  meant: readonly string[] = [],
): TopicBrief {
  const topic = typeof raw === "string" ? raw.trim() : "";
  if (topic.length === 0) throw new Error("Type what the brief should be about.");
  const words = topicWords(topic);
  if (words.length === 0) throw new Error("Type a word or two for the brief to be about.");

  const company = db.prepare(`SELECT name, timezone FROM companies WHERE id = ?`).get(companyId) as
    | { name: string; timezone: string }
    | undefined;
  if (!company) throw new Error("That workspace no longer exists.");

  const pages = pagesOf(db, companyId).filter((page) => page.is_archived === 0);
  const byId = new Map(pages.map((page) => [page.id, page]));
  const trails = trailsOf(pages);
  const hits = searchEverything(db, companyId, topic, HITS);
  const pieces: TopicPiece[] = [];
  const taken = new Set<string>();

  for (const hit of hits) {
    if (hit.kind === "page") {
      const page = byId.get(hit.id);
      if (!page || taken.has(page.id)) continue;
      taken.add(page.id);
      if (page.template === ENTRY_TEMPLATE) {
        // A journal day. Sealing empties the page, and the page is checked as
        // well, because a guard that leans on another function having emptied
        // something is not a guard.
        if (isSealed(db, page.id)) continue;
        const words = linkLabelsOnly(page.body).trim();
        if (words.length === 0) continue;
        pieces.push({ kind: "journal", title: page.title, note: "A day in the journal", lines: [words.slice(0, PIECE_BUDGET)] });
        continue;
      }
      pieces.push(pagePiece(page, trails[page.id] ?? [], "page"));
    } else if (hit.kind === "contact" && hit.leadId) {
      if (taken.has(hit.leadId)) continue;
      taken.add(hit.leadId);
      const piece = contact(db, companyId, hit.leadId);
      if (piece) pieces.push(piece);
    } else if (hit.kind === "note") {
      const note = db.prepare(`SELECT body, day FROM notes WHERE id = ?`).get(hit.id) as
        | { body: string; day: string }
        | undefined;
      if (!note) continue;
      pieces.push({ kind: "note", title: `Note, ${note.day}`, note: null, lines: [note.body.trim()] });
    } else if (hit.kind !== "history" && hit.kind !== "invoice") {
      // A person from People, and anything the index grows later: the words
      // matched, which is more than leaving it out.
      pieces.push({ kind: "note", title: hit.title, note: null, lines: [plain(hit.detail)] });
    }
  }

  // What the topic means, after what its words found: "coffee" brings the page
  // about beans that never says the word. Never a journal page - they are never
  // read for meaning - and before the pages under them are gathered.
  for (const id of meant) {
    const page = byId.get(id);
    if (!page || taken.has(page.id) || page.template === ENTRY_TEMPLATE) continue;
    taken.add(page.id);
    pieces.push(pagePiece(page, trails[page.id] ?? [], "page"));
  }

  // A page the search could not return, because what makes it about the topic
  // is written on the page above it. Each word is asked for on its own, and a
  // page counts when the words it matched plus the names above it cover them
  // all. See `coveredBy`: this is the difference between the search box and a
  // brief, and "unifloe pricing" is the case it exists for.
  if (words.length > 1) {
    const own = new Map<string, Set<string>>();
    for (const word of words) {
      for (const hit of searchEverything(db, companyId, word, 200)) {
        if (hit.kind !== "page") continue;
        const found = own.get(hit.id) ?? new Set<string>();
        found.add(word);
        own.set(hit.id, found);
      }
    }
    let added = 0;
    for (const [id, matched] of own) {
      if (added >= TRAIL_MOST) break;
      if (taken.has(id)) continue;
      const page = byId.get(id);
      if (!page || page.template === ENTRY_TEMPLATE) continue;
      if (!coveredBy(words, matched, trails[id] ?? [])) continue;
      taken.add(id);
      pieces.push(pagePiece(page, trails[id] ?? [], "page"));
      added += 1;
    }
  }

  // Everything hanging beneath a page that matched. This is what makes the
  // brief a brief: the songs under Guitar, the books under Reading, the lifts
  // under the gym, none of which say the word that was searched for.
  const matchedPages = [...taken].filter((id) => byId.has(id));
  const beneath: string[] = [];
  for (const id of matchedPages) {
    for (const child of underOf(pages, id)) {
      if (taken.has(child.id) || beneath.includes(child.id)) continue;
      beneath.push(child.id);
    }
  }
  for (const id of beneath.slice(0, UNDER_MOST)) {
    const page = byId.get(id);
    if (!page || page.template === ENTRY_TEMPLATE) continue;
    pieces.push(pagePiece(page, trails[page.id] ?? [], "under"));
  }

  for (const piece of [logged(db, companyId, words), hours(db, companyId, words), tasks(db, companyId, words)]) {
    if (piece) pieces.push(piece);
  }

  return briefMarkdown({
    // The heading is what the brief is about, not the sentence that asked for
    // it: "give me context about unifloe pricing" is titled "unifloe pricing".
    topic: topicName(topic),
    workspace: company.name,
    day: todayIn(company.timezone, now),
    pieces,
  });
}
