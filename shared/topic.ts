/**
 * A brief about one topic, written to be pasted into somebody else's AI.
 *
 * Caulder already sends what it knows to the AI it is connected to, in two
 * shapes: the dossier, which is the whole company within a budget, and the
 * handful of things a typed question points at. This is a third, and the
 * difference is where it goes - the clipboard, and from there into a chat
 * window Caulder has never heard of.
 *
 * That changes two things about it:
 *
 *  1. **It has to explain itself.** The connected AI is given instructions
 *     every time it is asked; a stranger's chat window is given nothing. So
 *     the brief opens by saying what Caulder is, whose notes these are, and
 *     that they were not written for a reader.
 *  2. **It has to say what it left out.** An AI handed a brief will treat
 *     silence as absence and answer confidently about a gap. Locked journal
 *     days, private lines and masked numbers are all real gaps, and the foot
 *     of the brief names them so neither the model nor the person reads the
 *     brief as the whole truth.
 *
 * Nothing here touches a database. What goes in is decided in
 * `services/topic.ts`; this decides how it reads and what it admits to.
 */

export type TopicPieceKind =
  | "page"
  | "under"
  | "journal"
  | "note"
  | "contact"
  | "logged"
  | "hours"
  | "task";

/** One heading in the brief, with the italic line under it and its body. */
export type TopicPiece = {
  kind: TopicPieceKind;
  title: string;
  /** Where it sits, or what the group is. Null when there is nothing to say. */
  note: string | null;
  lines: string[];
};

export type TopicBrief = {
  topic: string;
  markdown: string;
  /** What it costs to paste, so nobody finds out by pasting it. */
  chars: number;
  /** One phrase per kind that went in: "3 pages", "6 pages under them". */
  went: string[];
  /** Whether anything was cut to fit. */
  cut: boolean;
};

/**
 * The most a brief runs to. Generous, because the whole point is completeness
 * and a page of somebody's own notes is short - but not unbounded, because a
 * paste nobody can send is worse than one that says where it stopped.
 */
const TOPIC_BUDGET = 120_000;

/**
 * What the window is told about a brief that has just gone on the clipboard.
 *
 * The words themselves never cross the bridge. They are a person's journal
 * and their contacts' phone numbers, and the renderer has no use for them -
 * the same reason `copySecret` puts a revealed number on the clipboard from
 * main rather than handing it to the screen to copy.
 */
export type TopicCopied = Omit<TopicBrief, "markdown">;

/** The most any one page contributes, so a single long page cannot crowd out the rest. */
export const PIECE_BUDGET = 8_000;

const CUT_HERE = "*(Cut here: the rest was too long to fit in one paste.)*";

/**
 * The words that are the topic, out of the sentence somebody typed.
 *
 * Nobody types "unifloe pricing" into a line they have been talking to all
 * week. They type "give me context about unifloe pricing", and the index
 * joins words with AND, so "give" and "context" would between them find
 * nothing at all. These are the words that are never the subject of a brief:
 * short, closed-class, and safe to drop because no page is about them.
 *
 * Deliberately small. A stop list that grows starts throwing away words that
 * matter - "it" in an exam paper, "read" in a reading habit - and the cost of
 * a word too many is one poor brief, while the cost of a word too few is a
 * topic that can never be asked about.
 */
const STOP = new Set([
  "give", "get", "show", "tell", "find", "fetch", "pull", "copy", "grab",
  "me", "my", "mine", "us", "our", "your", "you",
  "the", "a", "an", "all", "any", "some", "every", "everything", "anything",
  "about", "on", "for", "of", "in", "to", "from", "with", "into", "re",
  "and", "or", "but",
  "context", "brief", "info", "information", "details", "notes", "note",
  "what", "whats", "which", "who", "when", "where", "why", "how",
  "is", "are", "was", "were", "do", "does", "did", "have", "has", "had",
  "please", "can", "could", "would", "should", "know", "knows",
]);

/**
 * The words to look for, the same way the search index splits them: every
 * word counts, punctuation is not one, and eight is as many as anybody types.
 * Two characters is the floor - "up" and "vs" match everything and mean
 * nothing, and a one-letter word matches every row in the database.
 *
 * If dropping the closed-class words would leave nothing, they are kept: a
 * brief about "how" is a strange brief, but refusing to make one because
 * every word was on a list is worse than making a poor one.
 */
export function topicWords(text: string): string[] {
  const all = text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2);
  const kept = all.filter((word) => !STOP.has(word));
  return (kept.length > 0 ? kept : all).slice(0, 8);
}

/** The topic as it should be titled: the sentence with the asking words taken off. */
export function topicName(text: string): string {
  const words = topicWords(text);
  return words.length > 0 ? words.join(" ") : text.trim();
}

/**
 * Whether a page is about all of the words, counting the pages above it.
 *
 * This is the reason a brief finds more than the search box does, and the
 * reason is narrower than it first looks - measured, not assumed:
 *
 * The index joins words with AND against one row, so "unifloe pricing" finds
 * only rows carrying both. A page called **Pricing** filed directly under
 * **Unifloe** *is* found, because the line it carries - `Part of [[Unifloe]]`
 * - puts the parent's name in its own indexed body. One level down looks
 * after itself.
 *
 * **Two levels down does not.** A page of tiers under Pricing under Unifloe
 * says `Part of [[Pricing]]` and never says Unifloe at all, so "unifloe
 * tiers" returns nothing whatsoever. And two levels is not the exotic case:
 * the whole point of the brain is chains like Me › Hobbies › Reading › Sci-fi
 * › Red Rising series › Red Rising, where everything worth reading is three
 * or four levels below the word anybody would search for.
 *
 * So a word is covered when the page itself matched it, or when any page
 * above it - all the way up, not just its parent - is named with it. Every
 * word has to be covered by one or the other.
 */
export function coveredBy(words: readonly string[], own: ReadonlySet<string>, trail: readonly string[]): boolean {
  if (words.length === 0) return false;
  const above = trail.join(" ").toLowerCase();
  return words.every((word) => own.has(word) || above.includes(word));
}

const LABEL: Record<TopicPieceKind, [string, string]> = {
  page: ["page", "pages"],
  under: ["page under them", "pages under them"],
  journal: ["journal day", "journal days"],
  note: ["note", "notes"],
  contact: ["contact", "contacts"],
  logged: ["thing logged", "things logged"],
  hours: ["run of hours", "runs of hours"],
  task: ["task", "tasks"],
};

/** The order they are written in, and the order they are counted in. */
const ORDER: readonly TopicPieceKind[] = ["page", "under", "contact", "logged", "hours", "task", "journal", "note"];

/**
 * What went in, counted from the pieces themselves rather than tallied
 * alongside them. A summary kept separately is a summary that can disagree
 * with the thing it summarises.
 */
export function wentIn(pieces: readonly TopicPiece[]): string[] {
  return ORDER.flatMap((kind) => {
    const n = pieces.filter((piece) => piece.kind === kind).length;
    if (n === 0) return [];
    const [one, many] = LABEL[kind];
    return [`${n} ${n === 1 ? one : many}`];
  });
}

/** Pieces in the order they are written, longest-serving kinds first. */
export function orderPieces(pieces: readonly TopicPiece[]): TopicPiece[] {
  return ORDER.flatMap((kind) => pieces.filter((piece) => piece.kind === kind));
}

/**
 * Cuts to fit, longest piece first, so trimming one enormous page does not
 * cost every short one its place. Each piece keeps at least its heading, so
 * the brief still says the thing exists even when it could not carry it.
 */
export function fitPieces(pieces: readonly TopicPiece[], budget = TOPIC_BUDGET): { pieces: TopicPiece[]; cut: boolean } {
  const weigh = (piece: TopicPiece) => piece.title.length + (piece.note?.length ?? 0) + piece.lines.join("\n").length;
  let total = pieces.reduce((sum, piece) => sum + weigh(piece), 0);
  if (total <= budget) return { pieces: [...pieces], cut: false };

  const out = pieces.map((piece) => ({ ...piece, lines: [...piece.lines] }));
  // Longest first: one page of ninety thousand characters is the usual reason
  // a brief does not fit, and cutting it alone leaves everything else whole.
  const order = out.map((piece, at) => ({ at, size: weigh(piece) })).sort((a, b) => b.size - a.size);
  for (const { at } of order) {
    if (total <= budget) break;
    const piece = out[at];
    if (!piece) continue;
    const body = piece.lines.join("\n");
    const spare = Math.max(0, body.length - (total - budget) - CUT_HERE.length - 2);
    const kept = body.slice(0, spare).trimEnd();
    piece.lines = kept.length > 0 ? [kept, "", CUT_HERE] : [CUT_HERE];
    total -= body.length - piece.lines.join("\n").length;
  }
  return { pieces: out, cut: true };
}

/**
 * What Caulder is, for a reader that has never heard of it.
 *
 * The connected AI gets instructions with every question. A chat window
 * somewhere else gets whatever is pasted into it and nothing more, so the
 * brief carries its own.
 */
function opening(topic: string, workspace: string, day: string): string[] {
  return [
    `# ${topic}`,
    "",
    `Everything Caulder holds about **${topic}**, as of ${day}.`,
    "",
    "Caulder is a desktop app its owner keeps their work and their life in: contacts and deals, a calendar, a journal, habits and hobbies, and pages they write themselves. " +
      `This is from their workspace **${workspace}**.`,
    "",
    "None of it was written for a reader. It is one person's own notes, so it is uneven, abbreviated, sometimes out of date and sometimes at odds with itself. Dates are the day a thing was written or done.",
    "",
    "Treat it as what is known and no more. Where it does not say, say so rather than filling the gap - and do not read silence as absence, because some of it was deliberately held back. What was held back is named at the foot.",
    "",
    "---",
    "",
  ];
}

/**
 * The foot: what went in, and what did not.
 *
 * The second half is the load-bearing one. The first three are the same two
 * rules `yours.ts` enforces for the connected AI plus the masking the dossier
 * does, and a brief that did not name them would read as complete.
 */
function closing(went: readonly string[], cut: boolean, chars: number): string[] {
  const lines = [
    "---",
    "",
    `**What went in:** ${went.length > 0 ? went.join(", ") : "nothing - Caulder holds no record of this"}.`,
    "",
    "**What did not:** journal days that are locked, anything written to the line as private, and registration and account numbers, which are masked. " +
      "Readings the app takes of its owner's day never leave their computer at all. So this is not everything about the topic - it is everything Caulder was willing to say about it.",
    "",
  ];
  if (cut) {
    lines.push(
      `**It did not all fit.** The longest pages were cut where they say so. The brief is ${chars.toLocaleString("en-GB")} characters as it stands.`,
      "",
    );
  }
  return lines;
}

/** One piece, as its heading, its italic line, and its body. */
function written(piece: TopicPiece): string[] {
  const lines = [`## ${piece.title}`, ""];
  if (piece.note) lines.push(`*${piece.note}*`, "");
  const body = piece.lines.join("\n").trimEnd();
  lines.push(body.length > 0 ? body : "*(Nothing written on it yet.)*", "");
  return lines;
}

export function briefMarkdown(input: {
  topic: string;
  workspace: string;
  day: string;
  pieces: readonly TopicPiece[];
}): TopicBrief {
  const { pieces, cut } = fitPieces(orderPieces(input.pieces));
  const went = wentIn(pieces);
  const body = pieces.flatMap(written);
  // Written twice: the length in the foot is the length of the finished
  // thing, and the foot is part of it. Close enough is not a character count.
  const draft = [...opening(input.topic, input.workspace, input.day), ...body, ...closing(went, cut, 0)].join("\n");
  const markdown = [...opening(input.topic, input.workspace, input.day), ...body, ...closing(went, cut, draft.length)].join("\n");
  return { topic: input.topic, markdown, chars: markdown.length, went, cut };
}
