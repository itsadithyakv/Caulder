import { z } from "zod";
import type { Db } from "../db/connection";
import { memoriesOf, type Remembered } from "@shared/memories";
import { RULES_SECTION, RULES_TEMPLATE, alike, isRulePage } from "@shared/rules";
import { getPage, newPage, savePage } from "./brain";

/**
 * Keeping what the line was told to remember: one dated line, on the page it
 * is about, in the company's brain.
 *
 * The page is the one the line named, one with the title given, or one
 * started for it in Remembered. That is all: a memory used to be hung on a
 * chain of pages worked out from what it was - Me, Hobbies, Reading, the
 * series - and that chain went with the personal half of the app (PLAN.md,
 * part seven). A company's pages are put where their owner puts them.
 *
 * A rule the company keeps is the one kind of line with a home of its own:
 * its subject's page in How we work (shared/rules.ts), started there when
 * it is the first rule on that subject. And when a rule already on the page
 * is about the same thing, that one is handed back - to be asked about,
 * never let go here.
 *
 * One transaction, through `savePage`, so the page's history has what it said
 * before and its links and search follow.
 */

const rememberInput = z.object({
  companyId: z.string().min(1),
  /** The page it is about, when the brain has one. */
  pageId: z.string().min(1).nullable(),
  /** Otherwise what to call the page that is found or started for it. */
  topic: z.string().trim().min(1).max(120).nullable(),
  said: z.string().trim().min(1, "Say what to remember.").max(2000),
  /** What leads the line: "GST number: 29ABCDE1234F1Z5". */
  fact: z.string().trim().max(200).nullable(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function titled(db: Db, companyId: string, title: string): string | null {
  const row = db
    .prepare(
      `SELECT id FROM brain_pages
        WHERE company_id = ? AND is_archived = 0 AND LOWER(TRIM(title)) = LOWER(TRIM(?))
        ORDER BY created_at LIMIT 1`,
    )
    .get(companyId, title) as { id: string } | undefined;
  return row?.id ?? null;
}

export function remember(db: Db, raw: unknown, now: Date): Remembered {
  const input = rememberInput.parse(raw);
  if (!db.prepare(`SELECT 1 FROM companies WHERE id = ?`).get(input.companyId)) throw new Error("That company no longer exists.");

  return db.transaction((): Remembered => {
    // One line, whatever was typed: a memory is a line.
    const one = (text: string) => text.replace(/\s*\r?\n\s*/g, " ");
    const line = `- ${input.fact ? `**${one(input.fact)}** · ` : ""}${one(input.said)} _(${input.day})_`;

    const handed = input.pageId ? getPage(db, input.pageId) : null;
    if (handed && handed.companyId !== input.companyId) throw new Error("That page belongs to another company.");
    const topic = input.topic ?? handed?.title ?? null;
    const existing = handed?.id ?? (topic ? titled(db, input.companyId, topic) : null);

    if (!existing) {
      const rules = isRulePage(topic);
      const made = rules ? newPage(db, input.companyId, RULES_SECTION, RULES_TEMPLATE, now) : newPage(db, input.companyId, "remembered", "page", now);
      const title = topic ?? "Things to remember";
      savePage(db, made.id, { title, body: `${line}\n`, fields: made.fields, secrets: {}, baseRevision: made.revision }, now);
      return { pageId: made.id, title, started: [title] };
    }

    const page = handed ?? getPage(db, existing);
    // On a page of rules, one that says the same thing another way may be meant instead of it.
    const like =
      page.section === RULES_SECTION
        ? (memoriesOf({ id: page.id, title: page.title, section: page.section, body: page.body })
            .filter((memory) => memory.current && memory.says.trim() !== input.said.trim())
            .find((memory) => alike(memory.says, input.said)) ?? null)
        : null;
    // Straight under the last memory, and a blank line clear of anything that is not one.
    const written = page.body.trimEnd();
    const gap = written === "" ? "" : /(^|\n)\s*- [^\n]*$/.test(written) ? "\n" : "\n\n";
    savePage(db, page.id, { title: page.title, body: `${written}${gap}${line}\n`, fields: page.fields, secrets: {}, baseRevision: page.revision }, now);
    return { pageId: page.id, title: page.title, started: [], like: like ? { raw: like.raw, says: like.says } : null };
  })();
}
