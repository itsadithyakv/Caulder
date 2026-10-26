import type { Db } from "../db/connection";
import { ACTIVITY_LABEL, type ActivityKind } from "@shared/domain";
import { findInvoice } from "./money";
import type { SearchHit } from "@shared/search";
import type { BrainSectionId } from "@shared/brain";
import { linkLabelsOnly } from "@shared/links";

/**
 * Search over everything, from the FTS5 index migration 20 keeps.
 *
 * The index holds pages, contacts, notes, history entries, invoices and
 * people; the triggers that fill it are in migrations.ts. Here the typed words become an
 * FTS query - every word, each as a prefix, so "oak sch" finds "Oakridge
 * School" - and each result is filled in from its own table.
 */

/** Pages and contacts first when the text matches as well. */
const KIND_PENALTY: Record<SearchHit["kind"], number> = {
  page: 0,
  contact: 0,
  invoice: 0.5,
  note: 1,
  history: 2,
};

/**
 * What was typed, as an FTS5 query. Each word is quoted, so nothing typed can
 * be read as the query language, and made a prefix. Null when there is no
 * word to look for.
 */
function ftsQuery(text: string): string | null {
  const words = text
    .normalize("NFKC")
    .split(/[\s"]+/)
    // Control characters out: nobody types them, and the snippet marks are two.
    .map((word) => [...word].filter((ch) => ch.charCodeAt(0) >= 32).join("").trim())
    .filter((word) => /[\p{L}\p{N}]/u.test(word))
    .slice(0, 8);
  if (words.length === 0) return null;
  return words.map((word) => `"${word}"*`).join(" ");
}

type HitRow = { kind: SearchHit["kind"]; ref_id: string; score: number; title: string; snip: string };

export function searchEverything(db: Db, companyIds: string | readonly string[], text: string, limit = 30): SearchHit[] {
  const query = ftsQuery(text);
  if (!query) return [];
  const ids = typeof companyIds === "string" ? [companyIds] : [...companyIds];

  let rows: HitRow[];
  try {
    rows = db
      .prepare(
        `SELECT m.kind, m.ref_id, bm25(brain_search, 8.0, 1.0) AS score,
                brain_search.title AS title,
                snippet(brain_search, 1, char(2), char(3), '…', 12) AS snip
         FROM brain_search
         JOIN search_map m ON m.id = brain_search.rowid
         WHERE brain_search MATCH ? AND m.company_id IN (${ids.map(() => "?").join(", ")})
         ORDER BY score
         LIMIT 200`,
      )
      .all(query, ...ids) as HitRow[];
  } catch {
    // A query FTS5 still cannot parse is a query with no answer, not a fault.
    return [];
  }

  return rows
    .map((row) => ({ row, rank: row.score + KIND_PENALTY[row.kind] }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ row }) => describe(db, row))
    .filter((hit): hit is SearchHit => hit !== null);
}

/**
 * A page's snippet without its markup. The index holds the text as written,
 * so a match inside a playbook arrives as "## Steps - [x] Send the..."; what
 * a person wants to read is the words.
 */
function tidyMarkdown(snippet: string): string {
  return linkLabelsOnly(snippet)
    // A snippet is cut mid-text, so a link can arrive as half a token: keep
    // its words, drop the rest of it.
    .replace(/\[\[([^\]|\n]*)(?:\|[a-z]*:?[0-9a-f-]*\]{0,2})?/g, "$1")
    .replace(/\|(?:page|contact):[0-9a-f-]*\]{0,2}/g, "")
    .replace(/#{1,6}\s+/g, "")
    .replace(/(^|\s)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/g, "$1")
    .replace(/\*\*|__|`/g, "")
    // A remembered line's day, "_(2026-09-24)_", as a day; and italics as plain words.
    .replace(/_\((\d{4}-\d{2}-\d{2})\)_/g, "($1)")
    .replace(/(^|[\s(])[_*]([^_*\n]+)[_*](?=[\s.,;:)]|$)/g, "$1$2");
}

function describe(db: Db, row: HitRow): SearchHit | null {
  const raw = row.kind === "page" ? tidyMarkdown(row.snip) : row.snip;
  const detail = raw.replace(/\s+/g, " ").trim();
  switch (row.kind) {
    case "page": {
      const page = db
        .prepare(`SELECT id, title, section FROM brain_pages WHERE id = ?`)
        .get(row.ref_id) as { id: string; title: string; section: string } | undefined;
      // The section column is checked against the list by the table itself.
      return page
        ? { kind: "page", id: page.id, title: page.title, detail, section: page.section as BrainSectionId, leadId: null }
        : null;
    }
    case "contact": {
      const lead = db.prepare(`SELECT id, name FROM leads WHERE id = ?`).get(row.ref_id) as
        | { id: string; name: string }
        | undefined;
      return lead
        ? { kind: "contact", id: lead.id, title: lead.name, detail, section: null, leadId: lead.id }
        : null;
    }
    case "note": {
      const note = db.prepare(`SELECT id, body FROM notes WHERE id = ?`).get(row.ref_id) as
        | { id: string; body: string }
        | undefined;
      if (!note) return null;
      const first = note.body.split("\n")[0]?.trim() ?? "";
      return {
        kind: "note",
        id: note.id,
        title: first.length > 80 ? `${first.slice(0, 80)}…` : first,
        detail,
        section: null,
        leadId: null,
      };
    }
    case "history": {
      const entry = db
        .prepare(
          `SELECT a.id, a.kind, a.lead_id, l.name FROM activities a
           JOIN leads l ON l.id = a.lead_id WHERE a.id = ?`,
        )
        .get(row.ref_id) as { id: string; kind: ActivityKind; lead_id: string; name: string } | undefined;
      return entry
        ? {
            kind: "history",
            id: entry.id,
            title: `${entry.name} · ${ACTIVITY_LABEL[entry.kind] ?? "History"}`,
            detail,
            section: null,
            leadId: entry.lead_id,
          }
        : null;
    }
    case "invoice": {
      // As the company writes its numbers, so a search for "PK/26-27" finds them as printed.
      const invoice = findInvoice(db, row.ref_id);
      return invoice
        ? {
            kind: "invoice",
            id: invoice.id,
            title: `${invoice.label} · ${invoice.leadName}`,
            detail,
            section: null,
            leadId: invoice.leadId,
          }
        : null;
    }
  }
}
