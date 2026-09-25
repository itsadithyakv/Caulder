import { z } from "zod";

/**
 * The notifications Caulder sends on its own, and the rules for when.
 *
 * Three kinds, each off until switched on, except the first - which is asked
 * for in the line itself:
 *
 *  - **A reminder you asked for.** "Remind me in 20 mins to check the oven",
 *    "don't let me forget to pay rent tomorrow". Said in the line, so it is
 *    on: at the time it said, or - with a day and no time - at the start of
 *    that day. Once, and never for a task already done.
 *  - **The journal**, at the hour you pick, only on a day with nothing
 *    written yet. A day already written is not nagged about.
 *  - **The morning brief**, at the hour you pick: what matters today - the
 *    must-dos first - in one notification, and nothing on a day with nothing.
 *
 * Pure: the window and main both read these, and the tests read nothing else.
 */

/** A line that asks to be told, not only to be listed. */
export const REMIND_ME =
  /\b(?:remind\s+me|reminder\b|don'?t\s+(?:let\s+me\s+)?forget|do\s+not\s+forget|ping\s+me|alert\s+me|notify\s+me|nudge\s+me|tell\s+me\s+(?:to|when)|set\s+(?:a\s+)?(?:reminder|alarm)|alarm\s+(?:at|for))\b/i;

const TIME = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "That is not a time.")
  .nullable();

export const nudgeInput = z.object({ journalAt: TIME, briefAt: TIME });
export type NudgeSettings = z.infer<typeof nudgeInput>;

/** Where a reminder with a day and no time goes off, when there is no brief to go with it. */
export const MORNING = "09:00";

/** How long after its time a nudge is still worth sending, in minutes: opening the laptop at noon still gets the nine o'clock brief. */
const STILL_WORTH: Record<"journal" | "brief" | "dates", number> = { journal: 4 * 60, brief: 6 * 60, dates: 12 * 60 };

function minutes(time: string): number {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/**
 * Whether a daily nudge is due now: its hour has come, it has not been sent
 * today, and it is not so late that it has stopped being useful. `now` is
 * minutes since midnight where the workspace is.
 */
export function nudgeDue(kind: "journal" | "brief" | "dates", at: string | null, now: number, sentOn: string | null, today: string): boolean {
  if (at === null || sentOn === today) return false;
  const start = minutes(at);
  return now >= start && now <= start + STILL_WORTH[kind];
}

/** A reminder is due at its time, or at the start of its day, or at once when its day has gone. */
export function reminderDue(reminder: { day: string; time: string | null }, today: string, now: number, morning: string): boolean {
  if (reminder.day < today) return true;
  if (reminder.day > today) return false;
  return now >= minutes(reminder.time ?? morning);
}

/** "Check the oven", said the way a reminder is said. */
export function sayReminder(reminder: { title: string; day: string; time: string | null }, today: string, workspace: string): { title: string; body: string } {
  const late = reminder.day < today;
  return {
    title: reminder.title,
    body: late ? `You asked to be reminded on ${reminder.day} · ${workspace}` : reminder.time ? `Now · ${workspace}` : `Today · ${workspace}`,
  };
}

const JOURNAL_LINES = [
  "How was today? One line is enough.",
  "Nothing in the journal yet today. What happened?",
  "A minute for today, before it is gone?",
  "What was the best part of today?",
  "Anything worth remembering from today?",
];

/** The journal nudge. A different line each day, so it is read rather than dismissed. */
export function sayJournal(today: string): { title: string; body: string } {
  const day = Number(today.slice(8, 10)) || 0;
  return { title: "Your journal", body: JOURNAL_LINES[day % JOURNAL_LINES.length] ?? JOURNAL_LINES[0] ?? "" };
}

/** The morning brief: the must-dos by name, then how many more. Null when there is nothing to say. */
export function sayBrief(due: readonly { title: string; must: boolean }[], late: number): { title: string; body: string } | null {
  if (due.length === 0 && late === 0) return null;
  const musts = due.filter((task) => task.must);
  const named = (musts.length > 0 ? musts : due).slice(0, 3).map((task) => task.title);
  const more = due.length - named.length;
  const parts = [
    named.length > 0 ? named.join(" · ") : null,
    more > 0 ? `and ${more} more` : null,
    late > 0 ? `${late} late from before` : null,
  ].filter(Boolean);
  const title = musts.length > 0 ? `Today: ${musts.length === 1 ? "one must-do" : `${musts.length} must-dos`}` : `Today: ${due.length} to do`;
  return { title: due.length === 0 ? `${late} late` : title, body: parts.join(", ") };
}
