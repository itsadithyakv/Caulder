import { minutesOf } from "./dates";

/**
 * Saying something before a block starts.
 *
 * A timetable that never speaks is a picture of a plan. This decides which
 * blocks are owed a word right now, and it is deliberately small — the whole
 * feature is one arithmetic comparison and four refusals.
 *
 * The refusals are the part worth reading:
 *
 *  1. **The workspace switch is a master switch.** Off means off, whatever an
 *     individual block says. A control that keeps acting after you turned it
 *     off is how a setting goes stale, and this app has already been bitten by
 *     one (the hidden sample-data checkbox that carried on seeding).
 *  2. **Nothing is said about a block that has already started.** "Your
 *     lecture starts in minus twenty minutes" is noise, and the Now line is
 *     already the answer to what is happening this minute.
 *  3. **Nothing is said twice.** A block carries the time it was mentioned.
 *  4. **Nothing is said about a block you have already written off.** Marking
 *     it skipped is you saying it is not happening; knocking about it after
 *     that is the app arguing.
 */

/**
 * "Never remind me about this one."
 *
 * A value rather than a second column. "Follow the workspace" and
 * "specifically not" are two answers to one question, and splitting them
 * across two fields makes a third, meaningless state possible — set to never
 * and also following the default.
 */
export const REMIND_NEVER = -1;

/** What a workspace starts at when reminders are switched on. */
export const DEFAULT_LEAD = 10;

/** The lead times a workspace can be set to. */
export const LEAD_CHOICES: readonly number[] = [0, 5, 10, 15, 30, 60];

/** The same list on a block, plus the two answers only a block can give. */
export const REMIND_CHOICES: readonly { value: number | null; label: string }[] = [
  { value: null, label: "However the workspace is set" },
  ...LEAD_CHOICES.map((lead) => ({ value: lead, label: leadLabel(lead) })),
  { value: REMIND_NEVER, label: "Never, for this one" },
];

/** "10 minutes before" — the phrase used wherever a lead time is chosen. */
export function leadLabel(lead: number): string {
  if (lead === 0) return "As it starts";
  if (lead === 60) return "An hour before";
  return `${lead} minutes before`;
}

/**
 * "starts in 10 minutes" — the phrase used when the reminder arrives.
 *
 * Takes the real distance to the start, never the configured lead time. The
 * two are usually the same and sometimes are not: a machine asleep through
 * 08:50 wakes at 08:57, and telling you a nine o'clock lecture starts in ten
 * minutes would be repeating a setting back at you instead of saying
 * something true.
 */
export function startsWording(minutes: number): string {
  if (minutes <= 0) return "starts now";
  if (minutes === 1) return "starts in a minute";
  if (minutes === 60) return "starts in an hour";
  return `starts in ${minutes} minutes`;
}

/**
 * How long before this block to say something, or null for nothing.
 *
 * The workspace decides whether anything is said at all; the block decides how
 * early, and may opt out.
 */
function leadFor(block: Remindable, workspaceLead: number | null): number | null {
  if (workspaceLead === null) return null;
  if (block.remindMinutes === null) return workspaceLead;
  if (block.remindMinutes < 0) return null;
  return block.remindMinutes;
}

/** The least this file needs to know about a block. */
export type Remindable = {
  id: string;
  startsAt: string;
  outcome: string | null;
  /** Null follows the workspace; a negative number means never. */
  remindMinutes: number | null;
  /** When it was already mentioned, so it is mentioned once. */
  remindedAt: string | null;
};

/**
 * Which blocks are owed a word, given the minute it is now.
 *
 * `now` is minutes since midnight, in the workspace's own timezone, and the
 * window is closed at the start rather than open: a reminder set to arrive as
 * the block starts has to have a minute it can land in, and one set for ten
 * minutes before has a last chance rather than being silently missed because
 * the machine was asleep at 08:50.
 *
 * The window is not allowed to reach back into yesterday. A block at 00:05
 * with an hour's lead is mentioned from midnight, not at 23:05 the night
 * before — the same rule the rest of the time-of-day layer follows, where
 * everything clamps and nothing wraps.
 */
export function dueReminders<T extends Remindable>(
  blocks: readonly T[],
  now: number,
  workspaceLead: number | null,
): { block: T; inMinutes: number }[] {
  const due: { block: T; inMinutes: number }[] = [];

  for (const block of blocks) {
    if (block.remindedAt !== null) continue;
    if (block.outcome !== null) continue;

    const lead = leadFor(block, workspaceLead);
    if (lead === null) continue;

    const start = minutesOf(block.startsAt);
    const opens = Math.max(0, start - lead);
    if (now < opens || now > start) continue;

    // How far off it actually is, not how far off it was set to be.
    due.push({ block, inMinutes: start - now });
  }

  // Earliest first, so two arriving in the same tick arrive in the order the
  // day has them rather than the order the rows came back.
  return due.sort((a, b) => minutesOf(a.block.startsAt) - minutesOf(b.block.startsAt));
}
