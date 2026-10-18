import { z } from "zod";
import type { AskAnswer } from "./ask";
import type { Sorted } from "./rules";

/**
 * What the AI proposes, for the owner to keep (PLAN.md, part ten, phase 39).
 *
 * Three things, and each is a draft: the company in brief, a page tidied,
 * and what the contacts' history shows that nobody has written down. Nothing
 * here is ever written by the AI. A draft comes back to the window, is read
 * and changed there, and is kept - or not - through the channels that keep
 * anything else: a page is saved as a page, a line on a contact as theirs.
 */

/** What went to make a draft, said with it. */
export type ProposalSent = {
  service: string;
  model: string;
  /** What went, in the words it is said in. */
  parts: string[];
  characters: number;
  usage: AskAnswer["usage"];
};

/** A draft of some text: the brief, or a page's body. */
export type Draft = { text: string; sent: ProposalSent };

/** Something the history shows about a contact, with the entries it came from. */
export type Noticed = { leadId: string; about: string; fact: string; from: string[] };
export type NoticedDraft = { facts: Noticed[]; sent: ProposalSent };

/**
 * A page of what was remembered, with where each line would be better kept
 * (shared/rules.ts). `sent` is what went to an AI for the lines the rules
 * here could not place - null when none was asked.
 */
export type SortDraft = { pageId: string; title: string; lines: Sorted[]; sent: ProposalSent | null };

const placed = z.object({
  n: z.number().int(),
  to: z.enum(["rule", "contact", "stay"]).catch("stay"),
  subject: z.string().trim().max(120).nullish().catch(null),
  contact: z.string().trim().max(200).nullish().catch(null),
});

/** The AI's reply as where it would put each numbered line, dropping what it did not say properly. */
export function parsePlaced(text: string): z.infer<typeof placed>[] {
  const from = text.indexOf("{");
  const to = text.lastIndexOf("}");
  if (from === -1 || to <= from) return [];
  try {
    const parsed = JSON.parse(text.slice(from, to + 1)) as { lines?: unknown };
    if (!Array.isArray(parsed.lines)) return [];
    return parsed.lines.flatMap((each) => {
      const read = placed.safeParse(each);
      return read.success ? [read.data] : [];
    });
  } catch {
    return [];
  }
}

/** The company in brief, as it stands: what goes with every question. */
export type BriefState = {
  text: string;
  /** The page it is kept on, when somebody has written or kept one. */
  pageId: string | null;
  written: boolean;
};

const fact = z.object({
  about: z.string().trim().min(1).max(200),
  fact: z.string().trim().min(1).max(300),
  from: z.array(z.string().trim().max(300)).max(6).catch([]),
});

/** The AI's reply as the facts it noticed, dropping any it did not say properly. */
export function parseNoticed(text: string): z.infer<typeof fact>[] {
  const from = text.indexOf("{");
  const to = text.lastIndexOf("}");
  if (from === -1 || to <= from) return [];
  try {
    const parsed = JSON.parse(text.slice(from, to + 1)) as { facts?: unknown };
    if (!Array.isArray(parsed.facts)) return [];
    return parsed.facts.flatMap((each) => {
      const read = fact.safeParse(each);
      return read.success ? [read.data] : [];
    });
  } catch {
    return [];
  }
}

/** A draft that came back wrapped in a code fence, without it. */
export function unfenced(text: string): string {
  const fence = /^\s*```[a-z]*\s*\n([\s\S]*?)\n```\s*$/i.exec(text);
  return (fence?.[1] ?? text).trim();
}

/** The line a kept draft ends with, so what the AI wrote is marked as such. */
export function draftedBy(service: string, day: string): string {
  return `*Drafted by ${service} on ${day} from this company's records, and kept by hand.*`;
}

/** The line a kept tidying ends with. */
export function tidiedBy(service: string, day: string): string {
  return `*Tidied by ${service} on ${day}; the page as it was is in History.*`;
}

/**
 * A page without the lines that say the AI drafted or tidied it: what is
 * sent to be tidied and what a tidied page is compared with. They are
 * Caulder's own note on the page, not something the page says.
 */
export function unmarked(body: string): string {
  let text = body.trimEnd();
  for (;;) {
    const cut = text.replace(/\n*\*(?:Drafted|Tidied) by [^\n]*\*$/, "").trimEnd();
    if (cut === text) return text;
    text = cut;
  }
}
