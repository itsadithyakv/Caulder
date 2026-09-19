import { isDay, shiftDay } from "./dates";

/**
 * Steps written in a page, and the tasks they become.
 *
 * A step is a `- [ ]` line. Three things can be written at its end and are
 * read off it: `@Asha`, who does it; `(day 7)`, how many days after the start
 * it is due; `(by 2026-10-02)`, the day it is due. What is left is the step.
 * The same lines are ticked while a page is read, so a playbook can be
 * followed with the page open and also run as tasks.
 *
 * Three places read them: onboarding (phase 10), a meeting's action items and
 * a playbook run (phase 11).
 */

export type PageStep = {
  /** The line it is on, counted from 0, as the tick box counts. */
  line: number;
  title: string;
  ticked: boolean;
  /** "(day 7)": days after the start. */
  day: number | null;
  /** "(by 2026-10-02)": a day. */
  by: string | null;
  /** "@Asha": who does it, as written. */
  owner: string | null;
};

const STEP = /^\s*[-*]\s+\[([ xX])\]\s+(.*?)\s*$/;
const DAY = /\s*\(day\s+(\d{1,3})\)\s*$/i;
const BY = /\s*\(by\s+(\d{4}-\d{2}-\d{2})\)\s*$/i;
const OWNER = /(?:^|\s)@([\p{L}][\p{L}\p{N}._-]*)/u;

/** Every step in a page's text, in order, at most forty. */
export function pageSteps(body: string): PageStep[] {
  const steps: PageStep[] = [];
  body.split(/\r?\n/).forEach((text, line) => {
    const match = STEP.exec(text);
    if (!match) return;
    let rest = match[2] ?? "";
    let day: number | null = null;
    let by: string | null = null;
    // Either order: "(by …)" then "(day …)" is as good as the other way round.
    for (let pass = 0; pass < 2; pass += 1) {
      const dayMatch = DAY.exec(rest);
      if (dayMatch) {
        day = Number(dayMatch[1]);
        rest = rest.slice(0, dayMatch.index);
      }
      const byMatch = BY.exec(rest);
      if (byMatch && isDay(byMatch[1])) {
        by = byMatch[1] ?? null;
        rest = rest.slice(0, byMatch.index);
      }
    }
    const ownerMatch = OWNER.exec(rest);
    const owner = ownerMatch?.[1] ?? null;
    if (ownerMatch) rest = `${rest.slice(0, ownerMatch.index)} ${rest.slice(ownerMatch.index + ownerMatch[0].length)}`;
    const title = rest.replace(/\s+/g, " ").trim().slice(0, 160);
    if (title) steps.push({ line, title, ticked: match[1] !== " ", day, by, owner });
  });
  return steps.slice(0, 40);
}

/**
 * When a step falls due: its own day if it names one, else that many days
 * after the start - or `fallbackDays` after it - and never before today.
 */
export function dueOfStep(step: Pick<PageStep, "day" | "by">, start: string, today: string, fallbackDays = 0): string {
  const due = step.by ?? shiftDay(start, step.day ?? fallbackDays);
  return due < today ? today : due;
}

/** A person's name matched by what was written after the @: their first name, or all of it run together. */
export function matchesOwner(name: string, written: string): boolean {
  const wanted = written.toLowerCase();
  const full = name.toLowerCase();
  return full.split(/\s+/)[0] === wanted || full.replace(/\s+/g, "") === wanted;
}

/** What a meeting's action items or a playbook's steps are, as tasks. */
export type StepTask = {
  step: PageStep;
  /** Its task, when it has become one. */
  task: { id: string; dueOn: string; done: boolean } | null;
};

export type PageTasks = {
  /** "actions" for a meeting: each item once. "run" for a playbook: all of it, as often as it is run. */
  mode: "actions" | "run";
  steps: StepTask[];
  /** Every task the page has made, and how many of them are still open. */
  runs: { tasks: number; open: number };
};
