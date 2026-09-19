import type { BrainSectionId } from "./brain";

/**
 * One result of searching everything (Ctrl+K).
 *
 * `detail` is a snippet of the matched text with the matched words between
 * \u0002 and \u0003, which the window turns into highlights.
 */
export type SearchHit = {
  kind: "page" | "contact" | "note" | "history" | "invoice" | "person";
  id: string;
  title: string;
  detail: string;
  /** For a page: its section. For a person: People. */
  section: BrainSectionId | null;
  /** For a contact, a history entry or an invoice: the contact it opens. */
  leadId: string | null;
};

/** The marks round matched words in `detail`: control characters nobody types. */
export const MARK_OPEN = "\u0002";
export const MARK_CLOSE = "\u0003";

export const SEARCH_KIND_LABEL: Record<SearchHit["kind"], string> = {
  page: "Brain",
  contact: "Contact",
  note: "Note",
  history: "History",
  invoice: "Invoice",
  person: "Person",
};
