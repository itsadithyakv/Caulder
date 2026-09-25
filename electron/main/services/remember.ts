import { z } from "zod";
import type { Db } from "../db/connection";
import { BRAIN_SECTIONS } from "@shared/brain";
import type { Remembered } from "@shared/branches";
import { linkToken } from "@shared/links";
import { homeCompanyId } from "../repositories/companies";
import { getPage, newPage, savePage } from "./brain";

/**
 * Keeping what the line was told to remember: one dated line, on the page it
 * is about, with every page above that page in place.
 *
 * shared/branches.ts works out the chain - Me, Hobbies, Reading, the series -
 * and this makes it real. Each level is found by its title or started, and a
 * page started here says what it is part of in its first line, which is the
 * link the map draws. It is one transaction: a memory is never kept on a page
 * that was left hanging half way down.
 *
 * A page the brain already has is left where its owner put it. Only one that
 * hangs off nothing at all is hung - a book remembered before this existed
 * joins the web the next time something is said about it - and one that says
 * "Part of" anything, anywhere, is never touched.
 */

const step = z.object({
  title: z.string().trim().min(1).max(120),
  section: z.enum(BRAIN_SECTIONS),
  template: z.enum(["page", "hobby"]),
});

const rememberInput = z.object({
  /** The page it is about, when the brain has one. */
  pageId: z.string().min(1).nullable(),
  /** Otherwise what to call the page that is started for it. */
  topic: z.string().trim().min(1).max(120).nullable(),
  section: z.enum(BRAIN_SECTIONS),
  /** The chain above it, outermost first. */
  trail: z.array(step).max(8),
  said: z.string().trim().min(1).max(2000),
  /** What leads the line: a lift's numbers. */
  fact: z.string().trim().max(200).nullable(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Said about somebody who is a contact: their page links to them, once. */
  about: z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(160) }).nullable().default(null),
});

const PART_OF = /^\s*Part of \[\[/im;

/** What a page started only to hold others says, so an empty one does not look forgotten. */
const HOLDS = "What is part of this is listed under **Linked here**, and drawn on the map.";

function titled(db: Db, companyId: string, title: string): string | null {
  // The journal is never a level of anything, and its pages are not the line's to write on.
  const row = db
    .prepare(
      `SELECT id FROM brain_pages
        WHERE company_id = ? AND is_archived = 0 AND section <> 'journal' AND LOWER(TRIM(title)) = LOWER(TRIM(?))
        ORDER BY created_at LIMIT 1`,
    )
    .get(companyId, title) as { id: string } | undefined;
  return row?.id ?? null;
}

export function remember(db: Db, raw: unknown, now: Date): Remembered {
  const input = rememberInput.parse(raw);
  const companyId = homeCompanyId(db);
  if (!companyId) throw new Error("There is no workspace to remember this in yet.");

  return db.transaction((): Remembered => {
    const started: string[] = [];
    let above: { id: string; title: string } | null = null;

    const start = (title: string, section: (typeof BRAIN_SECTIONS)[number], template: string, body: string) => {
      const made = newPage(db, companyId, section, template, now);
      const part = above ? `Part of [[${above.title}|page:${above.id}]].` : "";
      savePage(
        db,
        made.id,
        { title, body: [part, body].filter(Boolean).join("\n\n") + "\n", fields: made.fields, secrets: {}, baseRevision: made.revision },
        now,
      );
      started.push(title);
      return { id: made.id, title };
    };

    // A level is only started above levels that are not there yet. The series
    // already hangs off Reading when a later line mentions its genre: a genre
    // page started then would have nothing under it, and the series is not moved
    // to give it something - where a page hangs is its owner's to change.
    const there = input.trail.map((level) => titled(db, companyId, level.title));
    for (const [at, level] of input.trail.entries()) {
      const found = there[at];
      if (found) above = { id: found, title: getPage(db, found).title };
      else if (!there.slice(at + 1).some(Boolean)) above = start(level.title, level.section, level.template, HOLDS);
    }

    const line = `- ${input.fact ? `**${input.fact}** · ` : ""}${input.said} _(${input.day})_`;
    // Whatever it was handed, never a page of the journal: those can be sealed, and are not the line's to write on.
    const handed = input.pageId ? getPage(db, input.pageId) : null;
    if (handed && handed.companyId !== companyId) throw new Error("That page is not one of yours.");
    const wanted = handed?.section === "journal" ? null : handed;
    const topic = input.topic ?? handed?.title ?? null;
    const existing = wanted?.id ?? (topic ? titled(db, companyId, topic) : null);
    // A person who is a contact: their page says so, once, and the contact's
    // own page lists it under Linked here.
    const about = (body: string) =>
      input.about && !body.includes(`contact:${input.about.id}]]`)
        ? `About ${linkToken(input.about.name, { kind: "contact", id: input.about.id })}.`
        : "";
    if (!existing) {
      const made = start(topic ?? "Untitled", input.section, "page", [about(""), line].filter(Boolean).join("\n\n"));
      return { pageId: made.id, title: made.title, trail: input.trail.map((each) => each.title), started };
    }

    const page = wanted ?? getPage(db, existing);
    // Hung where it belongs only if it hangs nowhere: what its owner wrote about where it goes stands.
    const hang = above && above.id !== page.id && !PART_OF.test(page.body) ? `Part of [[${above.title}|page:${above.id}]].\n\n` : "";
    const whose = about(page.body);
    // Straight under the last memory, and a blank line clear of anything that is not one.
    const written = page.body.trimEnd();
    const gap = written === "" ? "" : /(^|\n)\s*- [^\n]*$/.test(written) ? "\n" : "\n\n";
    const body = `${hang}${whose ? `${whose}\n\n` : ""}${written}${gap}${line}\n`;
    savePage(db, page.id, { title: page.title, body, fields: page.fields, secrets: {}, baseRevision: page.revision }, now);
    return { pageId: page.id, title: page.title, trail: input.trail.map((each) => each.title), started };
  })();
}
