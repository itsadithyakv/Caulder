import { z } from "zod";
import type { Mood } from "./brain";

/**
 * The founder's own half of the brain (PLAN.md, part four): studies, hobbies,
 * goals and the journal, as the screens read them. The pages are ordinary
 * brain pages; these are the shapes worked out from them - an average from
 * grade points, the hours a hobby actually got, what happened on a day.
 */

/* ---- The journal ---------------------------------------------------------- */

export type JournalDay = {
  day: string;
  pageId: string;
  mood: Mood | null;
  /** The first words written, headings left out. Empty while the day is locked. */
  excerpt: string;
  /** Sealed behind the passcode, and the journal is locked. */
  locked?: boolean;
};

/** Whether the journal has a passcode, and whether it is open right now. */
export type JournalLockState = { set: boolean; open: boolean };

export type JournalMonth = {
  /** "2026-09". */
  month: string;
  today: string;
  entries: JournalDay[];
  /** Days in a row with an entry, ending today or yesterday. Shown, never pressed. */
  run: number;
  /** The same day a week, a month and a year ago, when there was an entry. */
  onThisDay: { label: string; entry: JournalDay }[];
};

/** What Caulder saw happen on a day: the facts beside an entry, so the entry is the reflection. */
export type DayRecord = {
  day: string;
  currency: string;
  tasksDone: { id: string; title: string; area: string | null }[];
  calls: { leadId: string; name: string; spoke: boolean }[];
  /** Hours kept, by what they were: planned blocks on the day that were not skipped. */
  kept: { kind: string; minutes: number }[];
  notes: { id: string; body: string }[];
  paidIn: { amount: number; from: string }[];
  /** Pages written or changed that day, the entry itself left out. */
  pages: { id: string; title: string; section: string }[];
  contactsAdded: number;
};

/* ---- Studies, hobbies, goals ---------------------------------------------- */

export type CourseRow = {
  id: string;
  title: string;
  code: string | null;
  term: string | null;
  credits: number | null;
  status: string | null;
  grade: string | null;
  gradePoints: number | null;
  nextExam: { id: string; title: string; on: string; daysLeft: number } | null;
  /** Study time kept in the four weeks before today, in minutes. */
  keptMinutes: number;
};

export type ExamRow = {
  id: string;
  title: string;
  on: string;
  at: string | null;
  daysLeft: number;
  course: { id: string; title: string } | null;
};

export type StudiesOverview = {
  today: string;
  courses: CourseRow[];
  /** From today on, soonest first. */
  exams: ExamRow[];
  /** Grade points weighted by credits, over the courses that have both. */
  average: { value: number; credits: number; courses: number } | null;
};

export type HobbyRow = {
  id: string;
  title: string;
  status: string | null;
  goal: string | null;
  hoursWanted: number | null;
  /** Kept in the four weeks before today, in minutes. */
  keptMinutes: number;
  /** Set aside from today to a week on. */
  plannedMinutes: number;
};

export type GoalRow = {
  id: string;
  title: string;
  area: string | null;
  byOn: string | null;
  daysLeft: number | null;
  target: number | null;
  progress: number | null;
  unit: string | null;
  done: boolean;
  /** How far along, 0 to 100, when there is a target to be far along towards. */
  percent: number | null;
};

/* ---- Time for a page ------------------------------------------------------- */

export type PageTime = {
  today: string;
  series: {
    id: string;
    weekdays: number[];
    startsAt: string;
    minutes: number;
    fromDay: string;
    untilDay: string;
    /** Still has a session that has not started. */
    active: boolean;
  }[];
  next: { day: string; startsAt: string; minutes: number } | null;
  /** The four weeks before today: minutes set aside, and minutes of it that were not skipped. */
  planned: number;
  kept: number;
  /** A hobby's hours a week, as minutes, to set the kept time against. */
  wantedWeekly: number | null;
};

export const timeInput = z.object({
  weekdays: z.array(z.number().int().min(1).max(7)).min(1, "Pick at least one day.").max(7),
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "That is not a time."),
  minutes: z.number().int().min(15, "A quarter of an hour at least.").max(600, "Ten hours at most."),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the last day."),
});

export type TimeInput = z.input<typeof timeInput>;

/** "Mon, Wed and Fri". */
export function describeWeekdays(weekdays: readonly number[]): string {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const sorted = [...new Set(weekdays)].sort((a, b) => a - b);
  if (sorted.length === 7) return "Every day";
  if (sorted.join(",") === "1,2,3,4,5") return "Weekdays";
  const words = sorted.map((day) => names[day - 1] ?? "");
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/**
 * The average of grade points weighted by credits. A course without credits
 * counts once, so a list with no credits written is a plain average.
 */
export function gradeAverage(
  courses: readonly { gradePoints: number | null; credits: number | null }[],
): { value: number; credits: number; courses: number } | null {
  const counted = courses.filter((course) => course.gradePoints !== null);
  if (counted.length === 0) return null;
  const weight = (course: { credits: number | null }) => (course.credits !== null && course.credits > 0 ? course.credits : 1);
  const total = counted.reduce((sum, course) => sum + weight(course), 0);
  const value = counted.reduce((sum, course) => sum + (course.gradePoints ?? 0) * weight(course), 0) / total;
  return {
    value: Math.round(value * 100) / 100,
    credits: counted.reduce((sum, course) => sum + (course.credits ?? 0), 0),
    courses: counted.length,
  };
}

/** How far a goal is along, 0 to 100: done is 100, and a target is needed for anything in between. */
export function goalPercent(goal: { target: number | null; progress: number | null; done: boolean }): number | null {
  if (goal.done) return 100;
  if (goal.target === null || goal.target <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(((goal.progress ?? 0) / goal.target) * 100)));
}

/**
 * Days in a row with an entry. A run still counts while today has no entry
 * yet - the evening is when people write - and ends on the first gap.
 */
export function journalRun(days: ReadonlySet<string>, today: string, shift: (day: string, by: number) => string): number {
  let at = days.has(today) ? today : shift(today, -1);
  let run = 0;
  while (days.has(at)) {
    run += 1;
    at = shift(at, -1);
  }
  return run;
}
