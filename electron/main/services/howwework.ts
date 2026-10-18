import { z } from "zod";
import type { Db } from "../db/connection";
import type { BrainPage } from "@shared/brain";
import type { RulesShown } from "@shared/ipc";
import { namedContact } from "@shared/capture";
import { leadInput } from "@shared/domain";
import { memoriesOf } from "@shared/memories";
import { RULES_SECTION, RULES_TEMPLATE, RULE_PAGES, isRulePage, sortLines, type Sorted } from "@shared/rules";
import { findLead, listLeads, updateLead } from "../repositories/leads";
import { getPage, newPage, savePage } from "./brain";
import { forgetMemory, moveMemories } from "./memories";

/**
 * How we work, beside the records (PLAN.md, part eleven): the rules on a
 * subject, read back where they are used; and a page of what was remembered
 * sorted - each line offered a better home, and moved only on a yes.
 *
 * Nothing here decides what a rule is or where it belongs: that is
 * shared/rules.ts. This finds the pages, and moves lines through the ways
 * lines are already moved (services/memories.ts) - so a page's history has
 * what it said before, whichever way a line left it.
 */

function titled(db: Db, companyId: string, title: string): string | null {
  const row = db
    .prepare(
      `SELECT id FROM brain_pages
        WHERE company_id = ? AND is_archived = 0 AND LOWER(TRIM(title)) = LOWER(TRIM(?))
        ORDER BY (section = ?) DESC, created_at LIMIT 1`,
    )
    .get(companyId, title, RULES_SECTION) as { id: string } | undefined;
  return row?.id ?? null;
}

const subjectInput = z.string().refine((title) => isRulePage(title), "That is not a subject Caulder keeps rules on.");

/** The rules that stand on a subject, the newest first. */
export function rulesOn(db: Db, companyId: string, subject: unknown, most = 4): RulesShown {
  const title = RULE_PAGES.find((page) => page.toLowerCase() === subjectInput.parse(subject).trim().toLowerCase()) ?? "";
  const pageId = titled(db, companyId, title);
  if (!pageId) return { pageId: null, title, rules: [], total: 0 };
  const page = getPage(db, pageId);
  const standing = memoriesOf({ id: page.id, title: page.title, section: page.section, body: page.body })
    .filter((memory) => memory.current)
    .sort((a, b) => b.day.localeCompare(a.day));
  return {
    pageId,
    title: page.title,
    rules: standing.slice(0, most).map((memory) => ({ says: memory.says, fact: memory.fact, day: memory.day })),
    total: standing.length,
  };
}

/** A subject's page: the one there is, or one started for it in How we work. */
function rulePage(db: Db, companyId: string, subject: string, now: Date): BrainPage {
  const existing = titled(db, companyId, subject);
  if (existing) return getPage(db, existing);
  const made = newPage(db, companyId, RULES_SECTION, RULES_TEMPLATE, now);
  return savePage(db, made.id, { title: subject, body: "", fields: made.fields, secrets: {}, baseRevision: made.revision }, now);
}

type SortPlan = { pageId: string; title: string; lines: Sorted[] };

function pageIn(db: Db, companyId: string, pageId: string): BrainPage {
  const page = getPage(db, pageId);
  if (page.companyId !== companyId) throw new Error("That page belongs to another company.");
  return page;
}

/**
 * Where each remembered line on a page would be better kept, by what this
 * machine can check: it is a rule, it names a contact, it is there twice.
 * Proposes, and changes nothing.
 */
export function sortPlan(db: Db, companyId: string, pageId: string): SortPlan {
  const page = pageIn(db, companyId, pageId);
  const contacts = listLeads(db, { companyId, sort: "name", direction: "asc" }).map((lead) => ({
    id: lead.id,
    name: lead.name,
    person: lead.contactPerson,
  }));
  const lines = memoriesOf({ id: page.id, title: page.title, section: page.section, body: page.body });
  return {
    pageId: page.id,
    title: page.title,
    lines: sortLines(lines, (said) => namedContact(said, contacts), { title: page.title, rules: page.section === RULES_SECTION }),
  };
}

const home = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rule"), subject: z.string().trim().min(1).max(120) }),
  z.object({ kind: z.literal("contact"), id: z.string().min(1), name: z.string() }),
  z.object({ kind: z.literal("twice"), as: z.string() }),
]);

const sortInput = z.object({
  pageId: z.string().min(1),
  moves: z.array(z.object({ raw: z.string().min(1).max(4000), to: home })).min(1, "Nothing was chosen to move.").max(200),
});

/**
 * The moves that were said yes to, made: a rule to its subject's page -
 * started in How we work when it is the first there - a line about a
 * contact to their Keep in mind, with its day, and a line said twice let
 * go. One transaction: all of them, or none.
 */
export function applySort(db: Db, companyId: string, raw: unknown, now: Date = new Date()): { moved: number } {
  const input = sortInput.parse(raw);
  return db.transaction(() => {
    const page = pageIn(db, companyId, input.pageId);
    const lines = new Map(memoriesOf({ id: page.id, title: page.title, section: page.section, body: page.body }).map((memory) => [memory.raw, memory]));
    let moved = 0;

    // Rules, a subject at a time, so each page is saved once.
    const bySubject = new Map<string, string[]>();
    for (const move of input.moves) {
      if (move.to.kind !== "rule" || !lines.has(move.raw)) continue;
      // Only ever to a subject's page, or one somebody made in How we work: never to a page elsewhere by its title.
      bySubject.set(move.to.subject, [...(bySubject.get(move.to.subject) ?? []), move.raw]);
    }
    for (const [subject, raws] of bySubject) {
      const target = rulePage(db, companyId, subject, now);
      if (target.section !== RULES_SECTION) throw new Error(`“${subject}” is not a page in How we work.`);
      moveMemories(db, { to: target.id, lines: raws.map((each) => ({ pageId: page.id, raw: each })) }, now);
      moved += raws.length;
    }

    for (const move of input.moves) {
      const line = lines.get(move.raw);
      if (!line || move.to.kind === "rule") continue;
      if (move.to.kind === "contact") {
        const lead = findLead(db, move.to.id);
        if (!lead || lead.companyId !== companyId) throw new Error(`${move.to.name} is not a contact any more.`);
        const note = `${line.fact ? `${line.fact}: ` : ""}${line.says} (${line.day})`;
        const parsed = leadInput.safeParse({ ...lead, notes: [lead.notes, note].filter(Boolean).join("\n") });
        if (!parsed.success) throw new Error(`That will not fit under ${lead.name}'s Keep in mind: ${parsed.error.issues[0]?.message ?? "it is too long."}`);
        updateLead(db, lead.id, parsed.data);
      }
      // Moved to the contact, or said twice: off this page either way, and in its history.
      forgetMemory(db, { pageId: page.id, raw: move.raw }, now);
      moved += 1;
    }
    return { moved };
  })();
}
