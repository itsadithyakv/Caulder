import {
  TASK_AREAS,
  TASK_AREA_LABEL,
  TASK_KINDS,
  TASK_KIND_GROUP,
  type Task,
  type TaskArea,
} from "@shared/domain";
import { PRIORITIES } from "@shared/priority";

/**
 * How "Due today" is divided into headings.
 *
 * Two groupings, and a rule for when each one earns its place:
 *
 *  - **By kind** - calls together, emails together - is what an outreach day
 *    wants. Ten calls are one sitting with the phone, and a list that
 *    interleaves them with emails makes you switch between the two ten times.
 *  - **By area** - college, the company, yourself, your health - is what a
 *    mixed day wants. "What do I do tonight" is answered by area, not by verb.
 *
 * **The rule: by area as soon as today spans more than one area, by kind
 * otherwise.** A day of nothing but company tasks keeps its call batching; a
 * day with a lecture reading and a client call in it is split the way the day
 * actually is.
 *
 * **Inside every heading, what has to happen comes first.** Priority orders
 * the rows and never the headings: the headings are where you left them, and
 * a group that jumped up the screen because one task in it was urgent would
 * be a screen that rearranged itself under you.
 */

type Group = { key: string; title: string; tasks: Task[] };

export function groupDue(tasks: readonly Task[]): Group[] {
  // A task with no area is not an area of its own. That is what a task
  // pulled in from Google Tasks arrives as, and one of those beside ten
  // company calls should not switch the whole list over and lose the
  // batching. It still gets its own heading when areas are shown.
  const areas = new Set(tasks.map((task) => task.area).filter((area) => !!area));
  const groups = areas.size > 1 ? byArea(tasks) : byKind(tasks);
  return groups.map((group) => ({ ...group, tasks: byPriority(group.tasks) }));
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

function byKind(tasks: readonly Task[]): Group[] {
  return TASK_KINDS.map((kind) => ({
    key: `kind-${kind}`,
    title: TASK_KIND_GROUP[kind],
    tasks: tasks.filter((task) => task.kind === kind),
  })).filter((group) => group.tasks.length > 0);
}

/**
 * College, the company, yourself, your health - in that fixed order, so the
 * headings are always where you left them - then any area typed by hand, then
 * the tasks with none.
 */
function byArea(tasks: readonly Task[]): Group[] {
  const known = TASK_AREAS as readonly string[];
  const typed = [
    ...new Set(tasks.map((task) => task.area).filter((area): area is string => !!area)),
  ].filter((area) => !known.includes(area));

  const groups: Group[] = [...known, ...typed].map((area) => ({
    key: `area-${area}`,
    title: known.includes(area) ? TASK_AREA_LABEL[area as TaskArea] : area,
    tasks: tasks.filter((task) => task.area === area),
  }));
  groups.push({ key: "area-none", title: "No area", tasks: tasks.filter((task) => !task.area) });

  return groups.filter((group) => group.tasks.length > 0);
}
