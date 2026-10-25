import { coreOf } from "./habitual";
import { expand } from "./slang";
import { readWhen } from "./questions";
import { daysBetween, shiftDay } from "./dates";
import type { LastLine, OpenTask } from "./lines";

/**
 * A line that changes something already there instead of adding another:
 * "push gym to tomorrow", "move dentist to 5", "cancel the call with rahul",
 * "rename deck to pitch deck" - and, straight after adding something,
 * "actually 6pm", "make that friday", "scratch that".
 *
 * **Only a task that is there.** Every word said about it has to be in its
 * title - "the dentist" is "Dentist appointment", "gym membership" is not "Go
 * to gym" - and when nothing open is it, the line is not an edit, and "cancel netflix" goes on
 * being the task it was. A task that is itself a cancelling - "Cancel the
 * gym membership" - is never what "cancel gym membership" cancels.
 */

export type Edit =
  | { do: "move"; task: OpenTask; day: string; time: string | null; minutes: number | null }
  | { do: "cancel"; task: OpenTask }
  | { do: "rename"; task: OpenTask; title: string }
  /** Ticked off from the line: "done call priya", "the deck is done" (PLAN.md, part twelve, phase 50). */
  | { do: "done"; task: OpenTask };

type Clock = { today: string; now: number };
type Around = Clock & { open: readonly OpenTask[]; last: LastLine | null };

const THAT = /^(?:it|that|this|the\s+last\s+one|that\s+one|the\s+one\s+i\s+just\s+added)$/i;

const MOVE = /^(?:please\s+)?(?:move|push|shift|reschedule|postpone|prepone|bump|change)\s+(.+)$/i;
/** Where the thing ends and the when starts: "move call with rahul at the office to 5" is tried at each. */
const TO = /\s+(?:to|till|until|for|on|at|into)\s+/gi;
const MOVED = /^(.+?)\s+(?:is|got|has\s+been|was|been)\s+(?:moved|pushed|postponed|preponed|rescheduled|shifted)\s+(?:to|till|until|for)\s+(.+)$/i;
const PUSH = /^(?:please\s+)?(?:postpone|push(?:\s+back)?|delay|bump)\s+(.+?)(?:\s+by\s+(a|one|an|\d+)\s+(days?|weeks?))?$/i;
const FIX = /^(?:(?:actually|no|nah|wait|oops|sorry|correction|sorry\s+i\s+meant|i\s+meant)[,.!:\s]+)(?:(?:make|change|move|set|put)\s+(?:that|it)\s+(?:to\s+|for\s+|at\s+|on\s+)?|(?:it'?s|its|it\s+is)\s+(?:on\s+|at\s+)?)?(.+)$/i;
const MAKE_THAT = /^(?:make|change|move|set|put)\s+(?:that|it)\s+(?:to\s+|for\s+|at\s+|on\s+)?(.+)$/i;
const CANCEL = /^(?:please\s+)?(cancel|delete|remove|drop|scrap|scratch|ditch|forget(?:\s+about)?|call\s+off|nvm|never\s*mind|skip)\s+(.+)$/i;
const CANCELLED = /^(.+?)\s+(?:is|got|has\s+been|was)\s+(?:cancel+ed|called\s+off|off|scrapped)$|^(.+?)\s+cancel+ed$/i;
const THAT_GOES = /^(?:undo|cancel\s+that|delete\s+that|remove\s+that|scratch\s+that|forget\s+that|never\s*mind|nvm)$/i;
const RENAME = /^(?:please\s+)?(?:rename|retitle)\s+(.+?)\s+(?:to|as)\s+(.+)$/i;
/** "done call priya", "finished the deck", "✅ gym", "mark the invoice done", "the deck is done". */
const DONE = /^(?:(?:i\s+)?(?:just\s+|have\s+|'ve\s+|ve\s+)?(?:done|finished|completed|complete|ticked\s+off)|✓|✔️?|✅|☑️?)\s*[:-]?\s*(.+)$/iu;
const MARK_DONE = /^mark\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished)$/i;
const IS_DONE = /^(.+?)\s+(?:is\s+|are\s+|was\s+)?(?:done|finished|completed|sorted|ticked\s+off|✓|✔️?|✅)$/iu;
const RENAME_THAT = /^(?:call\s+(?:it|that)|rename\s+(?:it|that)\s+(?:to|as))\s+(.+)$/i;

/** Words that would be cancelling something else if they started a task's title. */
const UNDOING = /^(?:cancel|delete|remove|drop|scrap|scratch|ditch|forget|skip|postpone|move|push|reschedule|rename)\b/i;
/** Said about a place or a person rather than a task: "drop papa at the station" is a lift. */
const ABOUT_WHERE = /\b(?:at|to|off|by|from|into|onto)\b/i;

function lastTask(around: Around): OpenTask | null {
  const id = around.last?.taskId;
  return id ? (around.open.find((task) => task.id === id) ?? null) : null;
}

/**
 * The open task an hour names: "my 3pm", "the 11 o'clock", "tomorrow's 9am" -
 * the one at that hour on that day, today when no day is said, else the
 * soonest still to come at that hour. Only when the phrase is nothing but
 * the when (PLAN.md, part twelve, phase 50).
 */
function taskAt(phrase: string, around: Around): OpenTask | null {
  const said = phrase.trim().replace(/^(?:the|my|our|that|this)\s+/i, "").replace(/'s\b/g, "");
  const when = readWhen(said, around, "it", null, true);
  if (!when?.time) return null;
  const timed = around.open.filter((task) => task.time === when.time);
  if (when.day) return timed.find((task) => task.dueOn === when.day) ?? null;
  return timed.find((task) => task.dueOn === around.today) ?? timed.filter((task) => task.dueOn > around.today).sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0] ?? null;
}

/** The open task a phrase names: "it" for the last one, else the best match, the soonest due first. */
function taskNamed(phrase: string, around: Around): OpenTask | null {
  const said = phrase.trim().replace(/^(?:the|my|our|that|this)\s+/i, "");
  if (THAT.test(said) || THAT.test(phrase.trim())) return lastTask(around);
  const byHour = taskAt(phrase, around);
  if (byHour) return byHour;
  const named = coreOf(said);
  if (named.length === 0) return null;
  // A number said is a number meant: "done invoice 1042" is not the task about invoice 1043, and
  // "completed 3 calls" is not "Call Priya". The words alone leave numbers out.
  const numbers = said.match(/\d+/g) ?? [];
  const candidates = around.open
    .map((task) => ({ task, core: coreOf(task.title) }))
    .filter(
      ({ task, core }) =>
        !UNDOING.test(task.title) &&
        named.every((word) => core.includes(word)) &&
        numbers.every((number) => (task.title.match(/\d+/g) ?? ([] as string[])).includes(number)),
    );
  // The closest title first - fewest words not said - then the soonest still to come, then anything late.
  candidates.sort((a, b) => {
    const ahead = (task: OpenTask) => (task.dueOn >= around.today ? 0 : 1);
    return a.core.length - b.core.length || ahead(a.task) - ahead(b.task) || a.task.dueOn.localeCompare(b.task.dueOn);
  });
  return candidates[0]?.task ?? null;
}

function moveTo(task: OpenTask, phrase: string, around: Around): Edit | null {
  const when = readWhen(phrase, around, task.title, task.time, true);
  if (!when) return null;
  // Said with a time only, it stays on its day - unless that day has gone.
  const day = when.day ?? (task.dueOn < around.today ? around.today : task.dueOn);
  if (day === task.dueOn && (when.time === null || when.time === task.time)) return null;
  return { do: "move", task, day, time: when.time, minutes: when.minutes };
}

/** What the line asks to be changed, or null when it asks for something new. */
export function readEdit(line: string, around: Around): Edit | null {
  const said = expand(line).trim().replace(/[.!]+$/, "");
  if (!said || around.open.length === 0) return null;

  // Straight after adding one: "scratch that", "actually 6pm", "make it friday", "call it pitch deck".
  const last = lastTask(around);
  if (last) {
    if (THAT_GOES.test(said)) return { do: "cancel", task: last };
    const renamed = RENAME_THAT.exec(said);
    if (renamed?.[1]) return { do: "rename", task: last, title: capital(renamed[1]) };
    const fix = FIX.exec(said) ?? MAKE_THAT.exec(said);
    if (fix?.[1]) {
      const moved = moveTo(last, fix[1], around);
      if (moved) return moved;
    }
  }

  const rename = RENAME.exec(said);
  if (rename) {
    const task = taskNamed(rename[1] ?? "", around);
    return task && rename[2] ? { do: "rename", task, title: capital(rename[2]) } : null;
  }

  const move = MOVE.exec(said);
  if (move?.[1]) {
    const rest = move[1];
    for (const at of rest.matchAll(TO)) {
      const task = taskNamed(rest.slice(0, at.index), around);
      const moved = task ? moveTo(task, rest.slice((at.index ?? 0) + at[0].length), around) : null;
      if (moved) return moved;
    }
  }
  const moved = MOVED.exec(said);
  if (moved) {
    const task = taskNamed(moved[1] ?? "", around);
    const to = task ? moveTo(task, moved[2] ?? "", around) : null;
    if (to) return to;
  }

  const push = PUSH.exec(said);
  if (push) {
    const task = taskNamed(push[1] ?? "", around);
    if (task) {
      const count = push[2] ? (/^\d+$/.test(push[2]) ? Number(push[2]) : 1) : 1;
      const days = /^week/i.test(push[3] ?? "") ? count * 7 : count;
      // From its own day, or from today for one already late.
      const from = daysBetween(around.today, task.dueOn) < 0 ? around.today : task.dueOn;
      return { do: "move", task, day: shiftDay(from, days), time: null, minutes: null };
    }
  }

  const cancel = CANCEL.exec(said);
  if (cancel) {
    const verb = (cancel[1] ?? "").toLowerCase();
    const what = cancel[2] ?? "";
    // "drop papa at the station", "remove the stitches from the wound": not a task going.
    if (!/^(?:cancel|call\s+off|delete|scrap|skip)$/.test(verb) && ABOUT_WHERE.test(what)) return null;
    const task = taskNamed(what, around);
    return task ? { do: "cancel", task } : null;
  }

  const cancelled = CANCELLED.exec(said);
  if (cancelled) {
    const task = taskNamed(cancelled[1] ?? cancelled[2] ?? "", around);
    return task ? { do: "cancel", task } : null;
  }

  // Ticked off from the line - only a task that is open and that every word names.
  const done = MARK_DONE.exec(said) ?? DONE.exec(said) ?? IS_DONE.exec(said);
  if (done?.[1]) {
    const task = taskNamed(done[1], around);
    if (task) return { do: "done", task };
  }
  return null;
}

function capital(text: string): string {
  const said = text.trim().replace(/^["“']|["”']$/g, "");
  return said.charAt(0).toUpperCase() + said.slice(1);
}
