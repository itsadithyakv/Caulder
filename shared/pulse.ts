/**
 * How somebody has been, read from what they already told Caulder.
 *
 * Not a diagnosis and not a score. Four plain observations, each one
 * arithmetic over the person's own history and each said as what it is:
 *
 *  - **Load**: the hours this week against their own usual week. Never against
 *    anybody else's, or against a number somebody decided is healthy.
 *  - **Mood**: the journal's own faces, this week against the weeks before.
 *  - **Quiet days**: days with nothing on them at all. One is a day off. The
 *    day after one, Caulder asks what it was - rested, scrolled, unwell - and
 *    that answer, over months, is what makes the rest of this worth reading.
 *  - **Their limit**: the weeks that came before their flat ones, and how
 *    heavy those were. Learnt, never assumed: it says nothing until it has
 *    seen it happen twice.
 *
 * What it will not do. It never reads the private lines - they are sealed,
 * and a feature that watches somebody is the last thing that should have a way
 * round that. It never says "burnout" as a finding, only what the weeks look
 * like. It says nothing at all until there is enough to go on, because a
 * confident reading of four days is worse than none. And it can be switched
 * off in one press, which hides it rather than nagging about being hidden.
 */

export const CHECKINS = ["rested", "scrolled", "unwell", "elsewhere", "off"] as const;
export type Checkin = (typeof CHECKINS)[number];

export const CHECKIN_LABEL: Record<Checkin, string> = {
  rested: "Rested, on purpose",
  scrolled: "Doomscrolled",
  unwell: "Was unwell",
  elsewhere: "Busy with life",
  off: "Just an off day",
};

/** One day, as far as this is concerned. Mood is one to five, rough to great. */
export type DayFacts = {
  day: string;
  /** Minutes kept on the Calendar: set aside and not skipped. */
  minutes: number;
  /** Tasks finished. */
  done: number;
  mood: number | null;
  /** Anything else that says the day was lived in Caulder: a habit ticked, something logged, the journal written. */
  other: number;
  checkin: Checkin | null;
};

export type Pulse = {
  /** False until there is enough history to say anything; the card then says that instead. */
  enough: boolean;
  level: "fine" | "heavy" | "low";
  /** The one thing worth saying, in a sentence. */
  says: string;
  /** What it is going on, each as a sentence; empty when `enough` is false. */
  notes: string[];
  /** A quiet day to ask about - yesterday - or null. */
  ask: string | null;
  /** What they give time to and are better for. */
  loves: string[];
};

const WEEK = 7;
const WEEKS = 12;

const active = (day: DayFacts) => day.minutes > 0 || day.done > 0 || day.other > 0;
const mean = (values: number[]) => (values.length === 0 ? null : values.reduce((sum, each) => sum + each, 0) / values.length);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length === 0 ? null : sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
};
const hours = (minutes: number) => `${Math.round(minutes / 6) / 10} h`;
const one = (value: number) => value.toFixed(1);

type Week = { minutes: number; quiet: number; mood: number | null; days: DayFacts[] };

/**
 * `days` is every day from the oldest wanted to today, in order, with nothing
 * missing - a day with nothing on it is a row of noughts, which is the point.
 * `hobbies` is, for each hobby, the days it got time.
 */
export function readPulse(days: readonly DayFacts[], hobbies: ReadonlyMap<string, readonly string[]> = new Map()): Pulse {
  const recent = days.slice(-WEEK * WEEKS);
  const weeks: Week[] = [];
  // Counted back from today in sevens: week 0 is the last seven days, not the calendar's week, so a Monday is not always "a light week".
  for (let end = recent.length; end > 0 && weeks.length < WEEKS; end -= WEEK) {
    const slice = recent.slice(Math.max(0, end - WEEK), end);
    if (slice.length < WEEK) break;
    weeks.push({
      minutes: slice.reduce((sum, day) => sum + day.minutes, 0),
      quiet: slice.filter((day) => !active(day)).length,
      mood: mean(slice.flatMap((day) => (day.mood === null ? [] : [day.mood]))),
      days: slice,
    });
  }

  const lived = recent.filter(active).length;
  const yesterday = recent[recent.length - 2];
  // Asked only of somebody who uses this most days: for anyone else a quiet day is just a day.
  const ask = yesterday && !active(yesterday) && yesterday.checkin === null && lived >= 10 ? yesterday.day : null;

  const before = weeks.slice(1).filter((week) => week.quiet < WEEK);
  if (weeks.length < 4 || before.length < 3) {
    return {
      enough: false,
      level: "fine",
      says: "Not enough yet to say how you have been. A few weeks of days, and it will.",
      notes: [],
      ask,
      loves: [],
    };
  }

  const now = weeks[0] as Week;
  const usual = median(before.map((week) => week.minutes)) ?? 0;
  const notes: string[] = [];

  // Load, against their own usual.
  const over = usual > 0 ? now.minutes / usual : 1;
  const heavyRun = weeks.slice(0, 3).filter((week) => usual > 0 && week.minutes >= usual * 1.25).length;
  const heavy = usual > 0 && (heavyRun >= 2 || over >= 1.5);
  if (usual > 0) {
    notes.push(
      over >= 1.25
        ? `${hours(now.minutes)} this week, against your usual ${hours(usual)}${heavyRun >= 2 ? ` - and ${heavyRun === 3 ? "the third" : "the second"} heavy week running` : ""}.`
        : over <= 0.6
          ? `${hours(now.minutes)} this week, well under your usual ${hours(usual)}.`
          : `${hours(now.minutes)} this week, about your usual ${hours(usual)}.`,
    );
  }

  // Mood, against the weeks before.
  const moodBefore = mean(before.slice(0, 4).flatMap((week) => week.days.flatMap((day) => (day.mood === null ? [] : [day.mood]))));
  const moods = now.days.filter((day) => day.mood !== null).length;
  const lowMood = now.mood !== null && moods >= 3 && ((moodBefore !== null && now.mood <= moodBefore - 0.6) || now.mood < 2.6);
  if (now.mood !== null && moods >= 3 && moodBefore !== null) {
    notes.push(
      lowMood
        ? `Your days have felt lower than they were: ${one(now.mood)} of 5 this week, ${one(moodBefore)} before.`
        : now.mood >= moodBefore + 0.6
          ? `Your days have felt better than they were: ${one(now.mood)} of 5 this week, ${one(moodBefore)} before.`
          : `Your days have felt much as they have: ${one(now.mood)} of 5.`,
    );
  }

  // Quiet days, against how many there usually are.
  const usualQuiet = median(before.map((week) => week.quiet)) ?? 0;
  const quietRising = now.quiet >= 3 && now.quiet > usualQuiet + 1;
  if (quietRising) notes.push(`${now.quiet} days this week with nothing on them; usually it is ${Math.round(usualQuiet)}.`);

  // What the quiet days turned out to be.
  const answered = recent.slice(-60).filter((day) => day.checkin !== null);
  const scrolled = answered.filter((day) => day.checkin === "scrolled");
  if (scrolled.length >= 3) {
    const loads = recent.filter((day) => day.minutes > 0).map((day) => day.minutes).sort((a, b) => a - b);
    const heavyDay = loads[Math.floor(loads.length * 0.75)] ?? Infinity;
    const after = scrolled.filter((day) => (recent[recent.findIndex((each) => each.day === day.day) - 1]?.minutes ?? 0) >= heavyDay).length;
    notes.push(
      `${scrolled.length} of your quiet days lately went to scrolling${after >= 2 ? `, ${after} of them the day after one of your heaviest` : ""}.`,
    );
  }

  // Their limit: learnt from the weeks that came before the flat ones.
  const flat = (week: Week) => week.quiet >= 3 || (week.mood !== null && week.mood <= 2.5);
  const led: number[] = [];
  for (let index = 1; index < weeks.length - 1; index += 1) {
    if (flat(weeks[index] as Week) && !flat(weeks[index + 1] as Week)) led.push((weeks[index + 1] as Week).minutes);
  }
  const limit = led.length >= 2 ? Math.min(...led) : null;
  const nearLimit = limit !== null && usual > 0 && limit > usual && now.minutes >= limit * 0.9;
  if (limit !== null && limit > usual) {
    notes.push(`Your flat weeks have come after weeks of ${hours(limit)} or more${nearLimit ? ", which is about where this one is" : ""}.`);
  }

  const level: Pulse["level"] = (heavy && (lowMood || quietRising)) || (lowMood && quietRising) || (nearLimit && lowMood) ? "low" : heavy || nearLimit ? "heavy" : "fine";
  const says =
    level === "low"
      ? "You have been carrying a lot and it is starting to show. An easier few days would not be wasted."
      : level === "heavy"
        ? "It has been a heavy stretch. You are holding up - and it is worth deciding now when it eases."
        : lowMood
          ? "The work looks ordinary, but the days have felt lower. Worth noticing what changed."
          : over <= 0.6 && now.quiet >= 3
            ? "A quiet week. If that was rest, good; if it was not, a small day tomorrow counts."
            : "You have been steady: about your usual weeks, feeling about as you usually do.";

  // What they give time to, and are better for.
  const moodOf = new Map(recent.flatMap((day) => (day.mood === null ? [] : [[day.day, day.mood] as const])));
  const window = new Set(recent.slice(-WEEK * 8).map((day) => day.day));
  const loves = [...hobbies.entries()]
    .map(([title, given]) => {
      const on = given.filter((day) => window.has(day));
      const withIt = mean(on.flatMap((day) => (moodOf.has(day) ? [moodOf.get(day) as number] : [])));
      const without = mean([...moodOf.entries()].filter(([day]) => window.has(day) && !on.includes(day)).map(([, mood]) => mood));
      const counted = on.filter((day) => moodOf.has(day)).length;
      const better = withIt !== null && without !== null && counted >= 4 && withIt >= without + 0.4;
      return { title, days: on.length, better, says: better ? `${title}: ${on.length} days in eight weeks, and your days with it are better than your days without (${one(withIt as number)} against ${one(without as number)}).` : `${title}: ${on.length} days in eight weeks.` };
    })
    .filter((each) => each.days >= 4)
    .sort((a, b) => Number(b.better) - Number(a.better) || b.days - a.days)
    .slice(0, 3)
    .map((each) => each.says);

  return { enough: true, level, says, notes, ask, loves };
}
