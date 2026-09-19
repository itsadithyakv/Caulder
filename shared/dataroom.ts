import { z } from "zod";
import type { BrainSectionId } from "./brain";
import type { DocumentCategory } from "./deadlines";

/**
 * The data room and the company handbook (PLAN.md, phase 13): the brain
 * handed to somebody who is not a founder.
 *
 * A data room is for an investor or an acquirer doing their homework - the
 * company on paper, its numbers, its filings and its documents, zipped with
 * an index that opens in any browser. A handbook is for somebody joining - who
 * we are, how things are done here, what we use - printed as one PDF through
 * the same printer the invoices use.
 *
 * Both are chosen, never everything by default: a page is included because
 * the founder ticked its section. Registration and account numbers are
 * masked unless asked for.
 */

/** What there is to choose from, with how much of each. */
export type RoomChoices = {
  company: string;
  sections: { id: BrainSectionId; label: string; pages: number }[];
  categories: { id: DocumentCategory; label: string; files: number; written: number }[];
  /** The rows that are not pages, and how many of each. */
  extras: Record<RoomExtra, number>;
};

export const ROOM_EXTRAS = ["people", "products", "metrics", "filings"] as const;
export type RoomExtra = (typeof ROOM_EXTRAS)[number];

export const ROOM_EXTRA_LABEL: Record<RoomExtra, string> = {
  people: "People and equity",
  products: "Products and prices",
  metrics: "Metrics, the last six months",
  filings: "The filing calendar",
};

/** What an investor asks for first. Pitch decks and statements, not the founders' ID cards. */
export const ROOM_DEFAULTS: { sections: BrainSectionId[]; categories: DocumentCategory[]; extras: RoomExtra[] } = {
  sections: ["company", "plan", "money", "tax", "legal", "decisions"],
  categories: ["certificate", "contract", "agreement", "pitch-deck", "statement"],
  extras: ["people", "products", "metrics", "filings"],
};

/** What somebody joining needs in their first week. */
export const HANDBOOK_DEFAULTS: { sections: BrainSectionId[]; extras: RoomExtra[] } = {
  sections: ["company", "plan", "customers", "playbooks", "tools", "decisions"],
  extras: ["people", "products"],
};

/** The extras a handbook can carry: the rest are for a data room. */
export const HANDBOOK_EXTRAS: readonly RoomExtra[] = ["people", "products"];

const extras = z.array(z.enum(ROOM_EXTRAS)).max(ROOM_EXTRAS.length).default([]);

export const roomInput = z.object({
  sections: z.array(z.string()).max(40).default([]),
  categories: z.array(z.string()).max(20).default([]),
  extras,
  secrets: z.boolean().default(false),
});
export type RoomInput = z.input<typeof roomInput>;

export const handbookInput = z.object({
  sections: z.array(z.string()).max(40).default([]),
  extras,
  secrets: z.boolean().default(false),
});
export type HandbookInput = z.input<typeof handbookInput>;

export type RoomOutcome = {
  /** The file's name, for the sentence that says where it went. */
  file: string;
  pages: number;
  documents: number;
  /** Stored documents whose file could not be found on this machine, listed in the index instead. */
  missing: number;
  bytes: number;
};

export type HandbookOutcome = { file: string; pages: number };
