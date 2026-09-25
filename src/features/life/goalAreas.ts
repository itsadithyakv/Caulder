import { TASK_AREAS, TASK_AREA_LABEL, type TaskArea } from "@shared/domain";
import type { BrainPageSummary } from "@shared/brain";

/**
 * How Life's Goals tab lays out what you are aiming at: your own goals under
 * the areas tasks use, and beside them the company's, from its Plan.
 */

type AreaGroup<T> = {
  /** Null for goals with no area, or one this version does not know. */
  area: TaskArea | null;
  label: string;
  goals: T[];
};

const isArea = (value: string | null): value is TaskArea => (TASK_AREAS as readonly string[]).includes(value ?? "");

/**
 * Goals under their areas, in the order tasks list the areas, with the ones
 * that have none last. Each group keeps the order it was given - done ones
 * already sink - and an area with no goals is left out rather than shown empty.
 */
export function goalsByArea<T extends { area: string | null }>(goals: readonly T[]): AreaGroup<T>[] {
  const groups: AreaGroup<T>[] = TASK_AREAS.map((area) => ({
    area,
    label: TASK_AREA_LABEL[area],
    goals: goals.filter((goal) => goal.area === area),
  }));
  groups.push({ area: null, label: "No area", goals: goals.filter((goal) => !isArea(goal.area)) });
  return groups.filter((group) => group.goals.length > 0);
}

/** The kinds of Plan page that are something the company is aiming at. */
const COMPANY_GOAL_TEMPLATES: readonly string[] = ["goal", "milestone"];

/**
 * The company's goals and milestones out of its Plan section: not the
 * one-page plan, the risks or the competitors. Pinned first, then as the
 * section lists them.
 */
export function companyGoals(pages: readonly BrainPageSummary[]): BrainPageSummary[] {
  const goals = pages.filter((page) => page.section === "plan" && !page.isArchived && COMPANY_GOAL_TEMPLATES.includes(page.template));
  return [...goals.filter((page) => page.isPinned), ...goals.filter((page) => !page.isPinned)];
}
