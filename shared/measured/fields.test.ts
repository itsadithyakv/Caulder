import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readCapture, type Known } from "../capture";
import { weekdayOf } from "../dates";
import { readEdit } from "../edits";
import { usualOf, yourDay } from "../habitual";
import type { OpenTask, Timed } from "../lines";
import { parseQuick } from "../quickadd";
import { readQuestion } from "../questions";
import { together } from "../together";

/**
 * How much of a line the quick line reads right - every field of it, not only
 * where it goes (PLAN.md, part twelve, phase 45). The held-out sets in
 * electron/main/understand count the kind; these count the day, the time, the
 * length, the repeat, the contact, the amount, what an edit touches and what a
 * question asks.
 *
 *  - **`lines-2026-10-a.json` has been looked at.** Eighty-four lines typed
 *    the way people type, written on 14 October and read, misses and all, to
 *    plan part twelve. It shows how far the changes went.
 *  - **`lines-2026-10-b.json` is held out.** Sixty lines for another founder
 *    - a photographer, another clock, other contacts - written the same day
 *    before any rule was changed, and never read since. Its misses are not
 *    printed. It is the number to believe.
 *
 * The same two rules as the kind sets: a line is not edited to make it pass,
 * and a held-out set whose misses are read is looked at from then on.
 *
 * Each set is read with what the app would know: the contacts, the open
 * tasks, and eight weeks of the person's own timed blocks - the day the line
 * is now allowed to lean on. The readers run in the order the line runs them
 * (src/features/today/QuickAdd.tsx): a question, an edit, the kind, two
 * things in one line, then the task's own reading.
 *
 * The floors are what was last measured. Before part twelve changed
 * anything, on 14 October: 59 of 84 and 39 of 60. After phases 46 and 47,
 * the same day: 72 of 84 and 49 of 60. After the whole of part twelve: 84 of
 * 84 and 58 of 60. They catch a change that makes the line worse; they are
 * not a target. CAULDER_EVAL=1 prints the totals, and
 * the looked-at set's misses.
 */

type Want = Partial<Record<Field, string | number | null>>;
type Field = "kind" | "contact" | "day" | "time" | "minutes" | "repeat" | "amount" | "ask" | "do" | "task" | "then" | "logged" | "parts" | "title";
type Row = { group: string; line: string; want: Want };
type Setting = { clock: { today: string; now: number }; known: Known; open: OpenTask[]; timed: Timed[] };

const load = (file: string) => JSON.parse(readFileSync(join(import.meta.dirname, file), "utf8")) as Row[];

/** Weekdays from `from` to the day before `to`, each given the blocks `day(weekday)` says. */
function history(from: string, to: string, day: (weekday: number) => { title: string; startsAt: string; minutes: number }[]): Timed[] {
  const out: Timed[] = [];
  for (let at = new Date(`${from}T12:00:00Z`); at.toISOString().slice(0, 10) < to; at.setUTCDate(at.getUTCDate() + 1)) {
    const weekday = ((at.getUTCDay() + 6) % 7) + 1;
    if (weekday > 5) continue;
    for (const block of day(weekday)) out.push({ ...block, day: at.toISOString().slice(0, 10) });
  }
  return out;
}

/** A consultant's Monday morning: at work nine to seven, lunch at one, calls in the afternoon. */
const A: Setting = {
  clock: { today: "2026-10-12", now: 10 * 60 },
  known: {
    contacts: [
      { id: "harbour", name: "Harbour Coffee Roasters", person: "Maya Ellis" },
      { id: "kettle", name: "Kettle & Crumb Bakery", person: "Priya Nair" },
      { id: "oak", name: "Oakridge International School", person: null },
      { id: "field", name: "Fieldnote Books", person: "Sam Okafor" },
      { id: "nord", name: "Nordlys Design", person: "Jonas Berg" },
    ],
    pages: [{ id: "p1", title: "Pricing", section: "plan" }],
  },
  open: [
    { id: "t1", title: "Call with Harbour Coffee", dueOn: "2026-10-12", time: "15:00", minutes: 30, leadId: "harbour", leadName: "Harbour Coffee Roasters" },
    { id: "t2", title: "Gym", dueOn: "2026-10-13", time: "18:00", minutes: 60, leadId: null, leadName: null },
    { id: "t3", title: "Call priya about the order form", dueOn: "2026-10-12", time: null, minutes: null, leadId: "kettle", leadName: "Kettle & Crumb Bakery" },
  ],
  timed: history("2026-08-17", "2026-10-12", (weekday) => [
    { title: "Deep work", startsAt: "09:00", minutes: 120 },
    ...(weekday === 2 || weekday === 4 ? [{ title: "Client call", startsAt: "11:30", minutes: 30 }] : []),
    { title: "Lunch", startsAt: "13:00", minutes: 60 },
    { title: weekday % 2 ? "Call with Kettle & Crumb" : "Call with Harbour Coffee", startsAt: "15:00", minutes: 30 },
    ...(weekday % 2 ? [{ title: "Gym", startsAt: "18:00", minutes: 60 }] : []),
  ]),
};

/** A photographer's Thursday afternoon in Lisbon: ten to six, a late lunch, shoots after it. */
const B: Setting = {
  clock: { today: "2026-10-22", now: 15 * 60 + 30 },
  known: {
    contacts: [
      { id: "casa", name: "Casa Lumen", person: "Rita Sousa" },
      { id: "fern", name: "Blue Fern Studio", person: "Tom Hale" },
      { id: "mercado", name: "Mercado Verde", person: null },
      { id: "oduya", name: "Oduya Events", person: "Kemi Oduya" },
      { id: "pine", name: "Pinewood Hotel", person: "Arjun Rao" },
    ],
    pages: [{ id: "q1", title: "Rates", section: "plan" }],
  },
  open: [
    { id: "b1", title: "Call Rita about the contract", dueOn: "2026-10-22", time: "16:00", minutes: 30, leadId: "casa", leadName: "Casa Lumen" },
    { id: "b2", title: "Shoot at Pinewood", dueOn: "2026-10-23", time: "11:00", minutes: 60, leadId: "pine", leadName: "Pinewood Hotel" },
    { id: "b3", title: "Send Tom the invoice", dueOn: "2026-10-23", time: null, minutes: null, leadId: "fern", leadName: "Blue Fern Studio" },
  ],
  timed: history("2026-08-27", "2026-10-22", (weekday) => [
    { title: "Emails", startsAt: "10:00", minutes: 30 },
    ...(weekday === 2 || weekday === 4 ? [{ title: "Call with Rita", startsAt: "10:30", minutes: 30 }] : []),
    { title: "Editing", startsAt: "11:00", minutes: 120 },
    { title: "Lunch", startsAt: "14:00", minutes: 60 },
    ...(weekday % 2 ? [{ title: "Shoot", startsAt: "16:00", minutes: 120 }] : []),
  ]),
};

const SETS = [
  { file: "lines-2026-10-a.json", name: "The looked-at set", heldOut: false, setting: A, floor: 84 },
  { file: "lines-2026-10-b.json", name: "The held-out set", heldOut: true, setting: B, floor: 58 },
].map((set) => ({ ...set, rows: load(set.file) }));

/**
 * A repeat, said the one way the sets say it: "weekdays", "daily", "weekly:5",
 * "weekly:1,3,5", "fortnightly:3" (a weekday), "monthly:1" (a day of the
 * month), "yearly:05-03".
 */
function sayRepeat(task: { day: string | null; repeat: { weekdays: readonly number[]; every?: 2 } | null; every: string | null }): string | null {
  if (task.every && task.day) {
    if (task.every === "monthly") return `monthly:${Number(task.day.slice(8))}`;
    if (task.every === "yearly") return `yearly:${task.day.slice(5)}`;
    return `fortnightly:${weekdayOf(task.day)}`;
  }
  const repeat = task.repeat;
  if (!repeat) return null;
  const days = [...repeat.weekdays].sort();
  if (repeat.every === 2) return `fortnightly:${days.join(",")}`;
  if (days.join() === "1,2,3,4,5") return "weekdays";
  if (days.length === 7) return "daily";
  return `weekly:${days.join(",")}`;
}

type Got = Partial<Record<Field, string | number | null>>;

/** The line, read the way the quick line reads it. */
function readAll(line: string, s: Setting): Got {
  const question = readQuestion(line, s.clock) as (Record<string, unknown> & { ask: string }) | null;
  if (question) {
    return { kind: "question", ask: question.ask, day: (question.day as string) ?? null, time: (question.time as string) ?? null };
  }
  const edit = readEdit(line, { ...s.clock, open: s.open, last: null });
  if (edit) {
    return {
      kind: "edit",
      do: edit.do,
      task: edit.task.id,
      day: edit.do === "move" ? edit.day : null,
      time: edit.do === "move" ? edit.time : null,
    };
  }
  const reading = readCapture(line, s.known, s.clock);
  if (reading.kind === "task") {
    const split = together(line);
    if (split?.split) return { kind: "split", parts: split.split.length };
  }
  const read = parseQuick(reading.text, { ...s.clock, day: yourDay(s.timed, s.clock.today), past: s.timed });
  const task = reading.task ? { ...read.task, ...reading.task } : read.task;
  const usual =
    task.day !== null && !read.task.repeat && (!task.time || read.task.minutes === null) ? usualOf(task.title, read.task.kind, s.timed) : null;
  const ask = reading.ask as (Record<string, unknown> & { do: string }) | null;
  const amount = ask && typeof ask.amount === "number" ? Math.abs(ask.amount) : (reading.spend?.amount ?? null);
  const askContact = ask && typeof ask.contact === "object" && ask.contact ? (ask.contact as { id: string }).id : null;
  return {
    kind: reading.kind,
    contact: reading.contact?.id ?? askContact,
    day: task.day,
    time: task.time ?? usual?.time ?? null,
    minutes: read.task.minutes ?? (task.time || usual?.time ? (usual?.minutes ?? null) : null),
    repeat: sayRepeat(read.task),
    amount,
    ask: ask?.do ?? null,
    then: reading.then?.day ?? null,
    logged: reading.logged,
    title: task.title,
  };
}

function score(row: Row, s: Setting): string[] {
  const got = readAll(row.line, s);
  const misses: string[] = [];
  for (const [field, wanted] of Object.entries(row.want) as [Field, string | number | null][]) {
    const value = got[field] ?? null;
    const same = field === "title" ? String(value ?? "").toLowerCase().includes(String(wanted).toLowerCase()) : value === wanted;
    if (!same) misses.push(`${field}: wanted ${JSON.stringify(wanted)}, read ${JSON.stringify(value)}`);
  }
  return misses;
}

describe("every field of a line, read right", () => {
  for (const set of SETS) {
    it(`${set.name}: no fewer lines read right than last measured`, () => {
      const scored = set.rows.map((row) => ({ row, misses: score(row, set.setting) }));
      const right = scored.filter((each) => each.misses.length === 0).length;
      if (process.env.CAULDER_EVAL) {
        const groups = new Map<string, [number, number]>();
        for (const { row, misses } of scored) {
          const [ok, all] = groups.get(row.group) ?? [0, 0];
          groups.set(row.group, [ok + (misses.length === 0 ? 1 : 0), all + 1]);
        }
        const byGroup = [...groups].map(([group, [ok, all]]) => `${group} ${ok}/${all}`).join(", ");
        console.warn(`${set.name}: ${right}/${set.rows.length} (${byGroup})`);
        if (!set.heldOut) for (const { row, misses } of scored) if (misses.length) console.warn(`  ${row.line}\n    ${misses.join("; ")}`);
      }
      expect(right).toBeGreaterThanOrEqual(set.floor);
    });
  }
});
