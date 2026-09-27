import type { LessonKind } from "./lessons";

/**
 * The line's second opinion (PLAN.md, part five, phase 20): what the model on
 * this machine makes of a line the rules were only guessing at.
 *
 * Main finds the things nearest the line in meaning - the person's own filed
 * lines, and the seeds for a machine with none (shared/understand-seeds.ts) -
 * and this decides, with no model in it, so it is tested like the rest of the
 * line and every threshold is here and nowhere else:
 *
 * - **Only a guess is doubted.** A reading the rules were sure of (a prefix,
 *   a contact, a command, a named page, a verb) is never changed; only one
 *   marked `soft` by readCapture is.
 * - **The near count far more than the middling.** Each example votes with
 *   its closeness cubed, and the person's own lines half as much again as a
 *   seed: what they have filed is the best teacher.
 * - **A change needs a clear majority and one close example.** Less when the
 *   rules had fallen all the way to "note", which is not an answer so much as
 *   the absence of one.
 * - **Where a memory goes** is only ever one of the person's own pages, and
 *   only a close one; seeds have no pages.
 *
 * The numbers were set by the measuring stick (electron/main/understand/
 * eval.test.ts): it must move wrong answers to right ones and no right answer
 * to a wrong one.
 */

export type Example = {
  /** What it was filed as. Null for a page, which says where rather than what. */
  kind: LessonKind | null;
  /** How alike it is to the line, from -1 to 1. */
  score: number;
  /** The page it is kept on - a memory's page, or the page itself. */
  page?: { id: string; title: string } | null;
  /** Filed by the person, rather than a seed. */
  own: boolean;
  /** For one of the person's tasks: the area it was filed under. */
  area?: string | null;
};

type Opinion = {
  /** The kind it should be instead; null when the reading stands. */
  kind: LessonKind | null;
  /** For a memory with nowhere yet: the page it belongs on. */
  page: { id: string; title: string } | null;
  /** Why, in a few words, for under the line. */
  because: string | null;
};

/**
 * Set by the measuring stick on 26 September 2026. Short lines score low
 * against each other with this model - the right page for a memory is
 * usually 0.35 to 0.6 alike, the wrong ones under 0.3 - so the bars are
 * lower than they look.
 */
export const OPINION = {
  /** Anything less alike than this is not a neighbour at all. */
  floor: 0.3,
  /** How many neighbours vote. */
  most: 8,
  /** The person's own lines, against a seed. */
  own: 1.5,
  /** The share of the vote a different kind needs, and the closeness of its best example. */
  share: 0.6,
  best: 0.5,
  /**
   * The same, when the rules had fallen to "note". 0.36 was tuned on the 89
   * lines it was scored on; on 89 fresh lines (27 September 2026) it turned
   * three right notes into tasks - "trial accounts expire after 14 days" -
   * and its extra wins were only on the tuned lines. At 0.44 the fresh lines
   * score the same and neither set has anything broken.
   */
  shareOverNote: 0.55,
  bestOverNote: 0.44,
  /**
   * The same, over a task the rules read from a when: it has a day or an hour
   * that would be lost, so it takes nearly all the vote and a close example,
   * and the person's pages do not vote against it - "gym mon wed fri 6am" is
   * a session, however near it is to the Gym page.
   */
  shareOverWhen: 0.8,
  bestOverWhen: 0.65,
  /** How close one of the person's own pages must be for a memory to go on it. */
  place: 0.33,
} as const;

const NONE: Opinion = { kind: null, page: null, because: null };

const SAID: Record<LessonKind, string> = {
  task: "something to do",
  journal: "a day in the journal",
  idea: "an idea",
  note: "a note",
  memory: "something to remember",
};

export function secondOpinion(
  reading: { kind: string; soft?: boolean; page: { id: string; title: string } | null },
  examples: readonly Example[],
  numbers: typeof OPINION = OPINION,
): Opinion {
  if (!reading.soft) return NONE;
  const near = examples
    .filter((each) => each.score >= numbers.floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, numbers.most);
  if (near.length === 0) return NONE;

  // The only soft task is one read from a when (readCapture), and it has the most to lose.
  const timed = reading.kind === "task";
  const votes = new Map<LessonKind, { weight: number; best: Example }>();
  let total = 0;
  for (const each of near) {
    // One of the person's own pages near the line says it is something about
    // that page: the pages memories are kept on. Not against a when.
    const said = each.kind ?? (each.own && each.page && !timed ? "memory" : null);
    if (!said) continue;
    const weight = each.score ** 3 * (each.own ? numbers.own : 1);
    total += weight;
    const had = votes.get(said);
    votes.set(said, { weight: (had?.weight ?? 0) + weight, best: had && had.best.score >= each.score ? had.best : each });
  }

  let kind: LessonKind | null = null;
  let because: string | null = null;
  const ranked = [...votes.entries()].sort((a, b) => b[1].weight - a[1].weight);
  const [winner, vote] = ranked[0] ?? [];
  if (winner && vote && total > 0 && winner !== reading.kind) {
    const fallen = reading.kind === "note";
    const share = vote.weight / total;
    const needShare = timed ? numbers.shareOverWhen : fallen ? numbers.shareOverNote : numbers.share;
    const needBest = timed ? numbers.bestOverWhen : fallen ? numbers.bestOverNote : numbers.best;
    if (share >= needShare && vote.best.score >= needBest) {
      kind = winner;
      because = vote.best.own && vote.best.page ? `it sounds like your ${vote.best.page.title} notes` : `it sounds like ${SAID[winner]}`;
    }
  }

  let page: Opinion["page"] = null;
  if ((kind ?? reading.kind) === "memory" && reading.page === null) {
    const home = near.find((each) => each.own && each.page && each.score >= numbers.place);
    if (home?.page) {
      page = home.page;
      because = `it belongs with ${home.page.title}`;
    }
  }
  return { kind, page, because };
}

/** How much of the vote an area needs, and how alike its nearest task must be. */
export const AREA = { share: 0.6, best: 0.45 } as const;

/**
 * The area for a task nothing else put in one - not a #tag, your words, a
 * lesson or the keyword lists (shared/quickadd.ts) - from the areas of the
 * person's own tasks nearest it in meaning: "revise unit 3" goes where the
 * other revising went. Null when they do not agree, and the line falls back
 * to Personal or Company as it always has.
 */
export function areaOpinion(examples: readonly Example[], numbers: typeof AREA = AREA): string | null {
  const tasks = examples
    .filter((each) => each.own && each.kind === "task" && each.area && each.score >= OPINION.floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, OPINION.most);
  const votes = new Map<string, { weight: number; best: number }>();
  let total = 0;
  for (const each of tasks) {
    const weight = each.score ** 3;
    total += weight;
    const had = votes.get(each.area as string);
    votes.set(each.area as string, { weight: (had?.weight ?? 0) + weight, best: Math.max(had?.best ?? 0, each.score) });
  }
  const [winner] = [...votes.entries()].sort((a, b) => b[1].weight - a[1].weight);
  if (!winner || total === 0) return null;
  const [area, vote] = winner;
  return vote.weight / total >= numbers.share && vote.best >= numbers.best ? area : null;
}
