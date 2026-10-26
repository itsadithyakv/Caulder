import { TASK_KINDS, TASK_KIND_GROUP, type Task } from "@shared/domain";
import { PRIORITIES } from "@shared/priority";

/**
 * How "Due today" is divided into headings: by kind - calls together, emails
 * together. Ten calls are one sitting with the phone, and a list that
 * interleaves them with emails makes you switch between the two ten times.
 *
 * It used to switch to headings by area - college, the company, yourself,
 * your health - on a day that spanned more than one. A task has no area now
 * (PLAN.md, phase 32), and a company's day is divided by what is to be done.
 *
 * **Inside every heading, what has to happen comes first.** Priority orders
 * the rows and never the headings: the headings are where you left them, and
 * a group that jumped up the screen because one task in it was urgent would
 * be a screen that rearranged itself under you.
 */

type Group = { key: string; title: string; tasks: Task[] };

export function groupDue(tasks: readonly Task[]): Group[] {
  return TASK_KINDS.map((kind) => ({
    key: `kind-${kind}`,
    title: TASK_KIND_GROUP[kind],
    tasks: byPriority(tasks.filter((task) => task.kind === kind)),
  })).filter((group) => group.tasks.length > 0);
}

/**
 * Has to happen, then should, then if there is time. A task nobody set reads
 * as "should" - the middle - rather than last, because not having said is not
 * the same as having said it can wait.
 *
 * Stable, so tasks of equal weight keep the order they arrived in.
 */
function byPriority(tasks: readonly Task[]): Task[] {
  const rank = (task: Task) => {
    const found = (PRIORITIES as readonly string[]).indexOf(task.priority ?? "should");
    return found === -1 ? 1 : found;
  };
  return [...tasks].sort((a, b) => rank(a) - rank(b));
}
