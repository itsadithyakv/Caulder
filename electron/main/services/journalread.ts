import type { Db } from "../db/connection";
import { ENTRY_TEMPLATE, isMood } from "@shared/brain";
import type { JournalFound, JournalSearch } from "@shared/life";
import type { ReadDay } from "@shared/lookback";
import { lockState, readPrivateBox, readableBody } from "./journal-lock";

/**
 * Reading the journal back, locked days and all, while it is open.
 *
 * Sealed days are out of the search index on purpose, so finding "the thing
 * I wrote about Dad in March" is done here instead: every entry is opened in
 * memory, looked through and let go. Nothing is written - not an index, not
 * a cache - so locking the journal leaves nothing behind to find.
 */

type EntryRow = { id: string; body: string; day: string | null; mood: string | null };

function entries(db: Db, companyId: string, from: string | null, to: string | null): EntryRow[] {
  return db
    .prepare(
      `SELECT id, body, json_extract(fields, '$.day') AS day, json_extract(fields, '$.mood') AS mood
         FROM brain_pages
        WHERE company_id = ? AND template = ? AND is_archived = 0
          AND (? IS NULL OR json_extract(fields, '$.day') >= ?)
          AND (? IS NULL OR json_extract(fields, '$.day') <= ?)
        ORDER BY day`,
    )
    .all(companyId, ENTRY_TEMPLATE, from, from, to, to) as EntryRow[];
}

/** The written part of an entry: the headings the journal adds on its own are not words anybody wrote. */
function written(body: string): string {
  return body
    .split("\n")
    .filter((line) => !/^##\s+(Today|Grateful for|Tomorrow)\s*$/i.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The entries in a span as they can be read now. `sealed` counts the ones
 * that could not be, because the journal is locked: a reading of the rest
 * would say something untrue about the whole.
 */
export function journalDays(db: Db, companyId: string, from: string | null, to: string): { days: ReadDay[]; sealed: number } {
  const days: ReadDay[] = [];
  let sealed = 0;
  for (const row of entries(db, companyId, from, to)) {
    if (!row.day) continue;
    const { body, locked } = readableBody(db, row.id, row.body);
    if (locked) {
      sealed += 1;
      continue;
    }
    const text = written(body);
    if (text.length > 0) days.push({ day: row.day, mood: isMood(row.mood) ? row.mood : null, text });
  }
  return { days, sealed };
}

/** A few words either side of the first place the words were found. */
function snippet(text: string, at: number, length: number): string {
  const start = Math.max(0, at - 70);
  const end = Math.min(text.length, at + length + 110);
  const flat = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${flat}${end < text.length ? "…" : ""}`;
}

const MOST = 40;

/**
 * The journal searched, every entry and every private line. While it is
 * locked, only what is not sealed is looked through, and the answer says so.
 */
export function searchJournal(db: Db, companyId: string, raw: unknown): JournalSearch {
  const query = typeof raw === "string" ? raw.trim().slice(0, 200) : "";
  if (query.length < 2) return { query, found: [], locked: false };
  const needle = query.toLocaleLowerCase();
  const found: JournalFound[] = [];
  let locked = false;

  for (const row of entries(db, companyId, null, null).reverse()) {
    if (!row.day) continue;
    const { body, locked: sealed } = readableBody(db, row.id, row.body);
    if (sealed) {
      locked = true;
      continue;
    }
    const text = written(body);
    const at = text.toLocaleLowerCase().indexOf(needle);
    if (at >= 0) found.push({ day: row.day, kind: "entry", snippet: snippet(text, at, needle.length) });
    if (found.length >= MOST) break;
  }

  const lines = db
    .prepare(`SELECT day, box, body FROM journal_private WHERE company_id = ? ORDER BY day DESC, created_at DESC`)
    .all(companyId) as { day: string; box: string | null; body: string | null }[];
  for (const line of lines) {
    if (found.length >= MOST) break;
    const stored = line.box === null ? line.body : readPrivateBox(line.box);
    if (stored === null) {
      locked = true;
      continue;
    }
    let text = "";
    try {
      const kept = JSON.parse(stored) as { text?: unknown };
      text = typeof kept.text === "string" ? kept.text : "";
    } catch {
      continue;
    }
    const at = text.toLocaleLowerCase().indexOf(needle);
    if (at >= 0) found.push({ day: line.day, kind: "private", snippet: snippet(text, at, needle.length) });
  }

  found.sort((a, b) => b.day.localeCompare(a.day));
  return { query, found, locked: locked && lockState(db).set };
}
