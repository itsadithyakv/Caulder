import { TASK_AREAS, type TaskArea } from "./domain";
import { shiftDay, startOfWeek, weekdayOf } from "./dates";

/**
 * Your level, and what earned it (PLAN.md, phase 17).
 *
 * Every point is something the tables already say happened: a task done, an
 * hour kept, a call, a deal won, an invoice paid, an entry written, a habit
 * ticked, a goal reached. Nothing is stored, so nothing can drift out of step
 * with what happened - undo a tick and its five points go with it - and
 * nothing is given for opening the app.
 */

export type HappeningKind = "task" | "time" | "call" | "deal" | "paid" | "entry" | "habit" | "goal";

/** One thing that happened, on a day, with the area it was for when that is known. */
export type Happening = {
  kind: HappeningKind;
  day: string;
  area: TaskArea | null;
  /** Time kept only: how long. */
  minutes?: number;
};

/** What each is worth. Time is by the minute: fifteen an hour. */
const XP_FOR: Record<Exclude<HappeningKind, "time">, number> = {
  task: 10,
  call: 10,
  deal: 100,
  paid: 50,
  entry: 10,
  habit: 5,
  goal: 150,
};

export const HAPPENING_LABEL: Record<HappeningKind, string> = {
  task: "Tasks done",
  time: "Time kept",
  call: "Calls",
  deal: "Deals won",
  paid: "Invoices paid",
  entry: "Journal entries",
  habit: "Habit ticks",
  goal: "Goals reached",
};

export function xpOf(happening: Happening): number {
  if (happening.kind === "time") return Math.round((happening.minutes ?? 0) / 4);
  return XP_FOR[happening.kind];
}

/* ---- Levels ----------------------------------------------------------------- */

/** XP a level starts at: 0, 100, 300, 600, 1,000 - each level a hundred more than the one before. */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export type Level = {
  level: number;
  xp: number;
  /** Where this level started and where the next one does. */
  from: number;
  to: number;
};

export function levelOf(xp: number): Level {
  const total = Math.max(0, Math.floor(xp));
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * total) / 50)) / 2));
  // The square root can land a hair either side of a boundary.
  while (xpForLevel(level + 1) <= total) level += 1;
  while (level > 1 && xpForLevel(level) > total) level -= 1;
  return { level, xp: total, from: xpForLevel(level), to: xpForLevel(level + 1) };
}

/* ---- The week across the four areas ---------------------------------------- */

type AreaWeek = {
  area: TaskArea;
  /** Time kept for it. */
  minutes: number;
  /** Everything else: tasks, calls, ticks, entries and the rest. */
  done: number;
  xp: number;
};

export type Week = {
  /** The last seven days, today among them. */
  from: string;
  to: string;
  areas: AreaWeek[];
  /** The areas nothing happened in: the balance, said rather than drawn. */
  quiet: TaskArea[];
};

export function weekOf(happenings: readonly Happening[], today: string): Week {
  const from = shiftDay(today, -6);
  const areas = new Map<TaskArea, AreaWeek>(TASK_AREAS.map((area) => [area, { area, minutes: 0, done: 0, xp: 0 }]));
  for (const happening of happenings) {
    if (!happening.area || happening.day < from || happening.day > today) continue;
    const row = areas.get(happening.area);
    if (!row) continue;
    if (happening.kind === "time") row.minutes += happening.minutes ?? 0;
    else row.done += 1;
    row.xp += xpOf(happening);
  }
  const rows = [...areas.values()];
  return { from, to: today, areas: rows, quiet: rows.filter((row) => row.minutes === 0 && row.done === 0).map((row) => row.area) };
}

/* ---- Achievements ---------------------------------------------------------- */

export type HabitRun = { weekdays: readonly number[]; days: readonly string[]; since: string };

type Rule =
  | { id: string; title: string; about: string; count: Exclude<HappeningKind, "time">; need: number }
  | { id: string; title: string; about: string; minutes: number }
  | { id: string; title: string; about: string; run: "journal" | "habit"; need: number }
  | { id: string; title: string; about: string; balanced: true };

/** In the order they tend to come: the first of each, then the long ones. */
const RULES: readonly Rule[] = [
  { id: "first-task", title: "Off the list", about: "A task done", count: "task", need: 1 },
  { id: "first-call", title: "First call", about: "A call logged", count: "call", need: 1 },
  { id: "first-entry", title: "Dear diary", about: "A journal entry written", count: "entry", need: 1 },
  { id: "first-paid", title: "First money in", about: "An invoice paid", count: "paid", need: 1 },
  { id: "first-deal", title: "First deal won", about: "A deal moved to won", count: "deal", need: 1 },
  { id: "first-goal", title: "Goal reached", about: "A goal marked done", count: "goal", need: 1 },
  { id: "hours-10", title: "Ten hours kept", about: "Ten hours of time set aside and kept", minutes: 600 },
  { id: "journal-week", title: "A week written", about: "An entry every day for seven days", run: "journal", need: 7 },
  { id: "habit-7", title: "Seven in a row", about: "A habit done on seven of its days in a row", run: "habit", need: 7 },
  { id: "balanced", title: "All of it", about: "Something for college, the company, yourself and your health in one week", balanced: true },
  { id: "calls-50", title: "Fifty calls", about: "Fifty calls logged", count: "call", need: 50 },
  { id: "entries-30", title: "Thirty entries", about: "Thirty days written about", count: "entry", need: 30 },
  { id: "habit-30", title: "Thirty in a row", about: "A habit done on thirty of its days in a row", run: "habit", need: 30 },
  { id: "tasks-100", title: "A hundred done", about: "A hundred tasks done", count: "task", need: 100 },
  { id: "paid-10", title: "Ten paid", about: "Ten invoices paid", count: "paid", need: 10 },
  { id: "hours-100", title: "A hundred hours", about: "A hundred hours of time set aside and kept", minutes: 6000 },
];

export type Achievement = {
  id: string;
  title: string;
  about: string;
  /** The day it was earned - worked out from when things happened, so it never moves. */
  earnedOn: string | null;
  /** How far along, in its own terms: calls, hours, days in a row, areas in a week. */
  have: number;
  need: number;
  unit: string;
};

/**
 * The day a run of days reached `need`, walking its own days from the start:
 * days it is not for are stepped over, a day missed starts again. And the
 * longest run, for how far along it is.
 */
export function runReached(
  run: HabitRun,
  today: string,
  need: number,
): { on: string | null; best: number } {
  const weekdays = new Set(run.weekdays);
  const done = new Set(run.days);
  let length = 0;
  let best = 0;
  let on: string | null = null;
  // Two years at most: the loop needs an end.
  let at = run.since < shiftDay(today, -731) ? shiftDay(today, -731) : run.since;
  for (; at <= today; at = shiftDay(at, 1)) {
    if (!weekdays.has(weekdayOf(at))) continue;
    if (done.has(at)) {
      length += 1;
      best = Math.max(best, length);
      if (length === need && on === null) on = at;
    } else if (at !== today) {
      length = 0;
    }
  }
  return { on, best };
}

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];

export function achievementsOf(
  happenings: readonly Happening[],
  habits: readonly HabitRun[],
  today: string,
): Achievement[] {
  const byKind = new Map<HappeningKind, Happening[]>();
  for (const happening of [...happenings].sort((a, b) => a.day.localeCompare(b.day))) {
    if (happening.day > today) continue;
    const list = byKind.get(happening.kind) ?? [];
    list.push(happening);
    byKind.set(happening.kind, list);
  }

  const entryDays = [...new Set((byKind.get("entry") ?? []).map((entry) => entry.day))].sort();
  const journal: HabitRun | null = entryDays[0] ? { weekdays: EVERY_DAY, days: entryDays, since: entryDays[0] } : null;

  // Weeks, Monday first: which areas each touched, and the day the last of the four came in.
  const weeks = new Map<string, Set<TaskArea>>();
  let balancedOn: string | null = null;
  let widest = 0;
  for (const happening of [...happenings].filter((each) => each.area && each.day <= today).sort((a, b) => a.day.localeCompare(b.day))) {
    const week = startOfWeek(happening.day);
    const areas = weeks.get(week) ?? new Set<TaskArea>();
    areas.add(happening.area as TaskArea);
    weeks.set(week, areas);
    widest = Math.max(widest, areas.size);
    if (areas.size === TASK_AREAS.length && balancedOn === null) balancedOn = happening.day;
  }

  return RULES.map((rule): Achievement => {
    const base = { id: rule.id, title: rule.title, about: rule.about };
    if ("count" in rule) {
      const list = byKind.get(rule.count) ?? [];
      return { ...base, earnedOn: list[rule.need - 1]?.day ?? null, have: Math.min(list.length, rule.need), need: rule.need, unit: HAPPENING_LABEL[rule.count].toLowerCase() };
    }
    if ("minutes" in rule) {
      let total = 0;
      let on: string | null = null;
      for (const kept of byKind.get("time") ?? []) {
        total += kept.minutes ?? 0;
        if (on === null && total >= rule.minutes) on = kept.day;
      }
      return { ...base, earnedOn: on, have: Math.min(Math.floor(total / 60), rule.minutes / 60), need: rule.minutes / 60, unit: "hours" };
    }
    if ("run" in rule) {
      const runs = rule.run === "journal" ? (journal ? [journal] : []) : habits;
      let on: string | null = null;
      let best = 0;
      for (const run of runs) {
        const reached = runReached(run, today, rule.need);
        best = Math.max(best, reached.best);
        if (reached.on && (on === null || reached.on < on)) on = reached.on;
      }
      return { ...base, earnedOn: on, have: Math.min(best, rule.need), need: rule.need, unit: "days in a row" };
    }
    return { ...base, earnedOn: balancedOn, have: widest, need: TASK_AREAS.length, unit: "areas in a week" };
  });
}

/* ---- All of it ------------------------------------------------------------- */

export type ProgressSource = {
  kind: HappeningKind;
  /** How many - or, for time, minutes. */
  count: number;
  xp: number;
  /** XP from the last seven days. */
  week: number;
};

export type Progress = {
  today: string;
  level: Level;
  /** Where the XP came from, largest first; kinds with nothing yet are left out. */
  sources: ProgressSource[];
  /** XP from the last seven days, all sources. */
  weekXp: number;
  week: Week;
  achievements: Achievement[];
};

export function progressOf(happenings: readonly Happening[], habits: readonly HabitRun[], today: string): Progress {
  const counted = happenings.filter((happening) => happening.day <= today);
  const from = shiftDay(today, -6);
  const sources = new Map<HappeningKind, ProgressSource>();
  let total = 0;
  let weekXp = 0;
  for (const happening of counted) {
    const xp = xpOf(happening);
    const source = sources.get(happening.kind) ?? { kind: happening.kind, count: 0, xp: 0, week: 0 };
    source.count += happening.kind === "time" ? (happening.minutes ?? 0) : 1;
    source.xp += xp;
    if (happening.day >= from) {
      source.week += xp;
      weekXp += xp;
    }
    sources.set(happening.kind, source);
    total += xp;
  }
  return {
    today,
    level: levelOf(total),
    sources: [...sources.values()].filter((source) => source.xp > 0).sort((a, b) => b.xp - a.xp),
    weekXp,
    week: weekOf(counted, today),
    achievements: achievementsOf(counted, habits, today),
  };
}
