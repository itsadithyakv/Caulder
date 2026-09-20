import { z } from "zod";
import { TASK_AREAS } from "./domain";

/**
 * Tune: what the quick-add line was unsure of, asked about when there is time.
 *
 * The line never stops to ask whether "meetining" was a meeting - it reads it
 * as one, says so, and carries on, because the moment a task is being written
 * down is the wrong moment for a quiz. What it guessed is kept instead, and
 * Settings asks later, one plain question at a time, the way a photo library
 * asks whether two faces are the same person:
 *
 *  - **A slip** it mended. "Same thing" and it is read that way from then on
 *    without comment; "leave it" and the word is never touched again.
 *  - **A name** it did not know, once it has come up again - "ms puc",
 *    "unifloe". Which part of life it belongs to becomes one of Your words;
 *    "none of them" and it is not asked about twice.
 *
 * Each answer is one press and every one can be taken back, so answering
 * wrongly costs as little as answering.
 */

export type Guess = {
  id: string;
  kind: "slip" | "name";
  /** As typed, in lowercase. */
  typed: string;
  /** For a slip: what it was read as. */
  meant: string | null;
  /** How many lines it has turned up in. */
  times: number;
};

/** An answer already given, listed so that it can be taken back. */
export type Settled = Guess & { verdict: "same" | "keep" };

export type TuneState = { asking: Guess[]; settled: Settled[] };

const word = z.string().trim().toLowerCase().min(1).max(40);

/** What a line that was just added had in it. */
export const seenInput = z.object({
  slips: z.array(z.object({ typed: word, as: word })).max(20).default([]),
  names: z.array(word).max(20).default([]),
});
export type SeenInput = z.input<typeof seenInput>;

/** "Keep “frida”", pressed under the line: settled on the spot, no question needed. */
export const keepInput = z.object({ typed: word, as: word });

export const answerInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("slip"), id: z.string().min(1), verdict: z.enum(["same", "keep"]) }),
  z.object({ kind: z.literal("name"), id: z.string().min(1), area: z.enum(TASK_AREAS).nullable() }),
]);
export type AnswerInput = z.infer<typeof answerInput>;

/**
 * Whether a guess has earned a question.
 *
 * A slip always has: the line changed what was typed, and that is worth one
 * look. A name has to come up twice - once is a name in passing, and a card
 * that asks about every word ever typed after "for" is a card nobody opens.
 */
export function worthAsking(guess: Pick<Guess, "kind" | "times">): boolean {
  return guess.kind === "slip" || guess.times >= 2;
}
