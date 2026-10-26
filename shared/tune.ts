import { z } from "zod";

/**
 * Tune: what the quick-add line was unsure of, asked about when there is time.
 *
 * The line never stops to ask whether "meetining" was a meeting - it reads it
 * as one, says so, and carries on, because the moment a task is being written
 * down is the wrong moment for a quiz. What it guessed is kept instead, and
 * Settings asks later, one plain question at a time, the way a photo library
 * asks whether two faces are the same person: "same thing", and it is read
 * that way from then on without comment; "leave it", and the word is never
 * touched again.
 *
 * Each answer is one press and every one can be taken back, so answering
 * wrongly costs as little as answering.
 *
 * It used to ask about names it did not know as well, to learn which part of
 * life each belonged to. A task has no area now (PLAN.md, phase 32); rows of
 * that kind stay in `line_guesses`, unread.
 */

export type Guess = {
  id: string;
  /** As typed, in lowercase. */
  typed: string;
  /** What it was read as. */
  meant: string;
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
});
export type SeenInput = z.input<typeof seenInput>;

/** "Keep “frida”", pressed under the line: settled on the spot, no question needed. */
export const keepInput = z.object({ typed: word, as: word });

export const answerInput = z.object({ id: z.string().min(1), verdict: z.enum(["same", "keep"]) });

/**
 * Who a word means, kept from an answer the line was given: "which Priya?",
 * "is that Priya?" (PLAN.md, part twelve, phase 48). Per company.
 */
export type NameKept = { id: string; said: string; leadId: string; leadName: string };

export const nameInput = z.object({ said: word, leadId: z.string().min(1).max(80) });
export type NameInput = z.infer<typeof nameInput>;
export type AnswerInput = z.infer<typeof answerInput>;

