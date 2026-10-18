/**
 * What Caulder says when it is not reporting anything: hello, by the hour, and
 * an example in an empty line.
 *
 * Pure, like everything it sits beside. One plain line each. There were jokes,
 * quotations and sixty ways of saying hello here once; they were taken out on
 * 10 October 2026 (PLAN.md, part seven). A tool a company is run from says
 * good morning and gets out of the way.
 */

/** Morning from five, afternoon from twelve, evening from five - and the small hours are still the evening before. */
function hourOf(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Hello, in one short line. The first name is all that is used: nobody is
 * greeted by their surname, and without a name the line reads whole.
 */
export function greet(hour: number, name: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first ? `${hourOf(hour)}, ${first}.` : `${hourOf(hour)}.`;
}

/**
 * What the quick window shows in its empty line: a task, the way somebody
 * would really type one. Each is an example of something the line reads -
 * a time, a day, a repeat, a short form, a length - so the placeholder teaches
 * by being different every time, where a paragraph of hints was not read once.
 * voice.test.ts reads every one of them, so none can promise what does not work.
 */
const TASKS: string[] = [
  "Send the proposal at 4pm today",
  "call the supplier tmrw 11am",
  "team standup every mon wed fri 10am until dec",
  "mtg w rahul nxt wk",
  "client review on the 23rd at 10am",
  "pay the office rent on the 1st",
  "draft the pitch deck tonight",
  "email kiran about the renewal asap",
  "submit the report by fri, not urgent",
  "bank visit sat 11am",
  "prepare the investor update monday 5pm for 2h",
  "order business cards today",
  "renew the domain next month",
  "review the pipeline every monday 9am until dec",
  "pricing review at 3pm for 30 min",
  "file the returns b4 friday",
  "lunch with priya tomorrow 1pm",
  "send invoice to unifloe today",
];

export function taskExample(seen: string[], seed: number): { key: string; says: string } {
  const says = fresh(TASKS, (each) => each, seen, seed);
  return { key: says, says };
}

/** What has been shown, with this added: most recent last, shown twice kept once, and not for ever. */
export function remembered(seen: string[], key: string): string[] {
  return [...seen.filter((each) => each !== key), key].slice(-600);
}

/**
 * One from the pool that has not been shown; failing that, the one shown
 * longest ago. `seen` is oldest first, so that is the lowest index.
 */
function fresh<T>(pool: T[], keyOf: (each: T) => string, seen: string[], seed: number): T {
  const unsaid = pool.filter((each) => !seen.includes(keyOf(each)));
  if (unsaid.length > 0) return unsaid[Math.abs(Math.trunc(seed)) % unsaid.length] as T;
  return [...pool].sort((a, b) => seen.lastIndexOf(keyOf(a)) - seen.lastIndexOf(keyOf(b)))[0] as T;
}
