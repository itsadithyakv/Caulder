import type { BoardColumn } from "@shared/domain";

/**
 * The one line above the board: how many deals are open, what they are worth,
 * and what they are worth weighted by how far along they are.
 *
 * The weight is the stage's place among the open stages, not a win rate. A
 * rate needs closed deals to be learnt from, and a founder with two won and
 * one lost has nothing a rate could honestly be read off. Position is crude,
 * but it is never pretending to know more than the board does.
 *
 * With n open stages the first counts for 1/(n+1) of its value and the last
 * for n/(n+1), so nothing open is ever worth nothing and nothing open is ever
 * as good as won. Won and lost are out of the funnel and count for neither.
 */

type Column = Pick<BoardColumn, "stageId" | "kind" | "total" | "value">;

type DealTotals = {
  /** Open deals, every one of them, not only the cards drawn. */
  count: number;
  /** What the open deals are worth, as typed. */
  value: number;
  /** The same, each column counted at its stage's weight, to the whole unit. */
  weighted: number;
};

/**
 * The weight of the `position`th open stage (from 1) out of `stages`.
 * Strictly between 0 and 1, and rising along the funnel.
 */
export function stageWeight(position: number, stages: number): number {
  const count = Math.max(stages, 1);
  const at = Math.min(Math.max(position, 1), count);
  return at / (count + 1);
}

export function dealTotals(columns: readonly Column[]): DealTotals {
  const open = columns.filter((column) => column.kind === "open");
  // Unstaged is open but has no place in the funnel: its stage was deleted
  // from under it. It counts as far from closing as a deal just begun, which
  // is the cautious reading of not knowing.
  const staged = open.filter((column) => column.stageId !== null);

  let weighted = 0;
  for (const column of open) {
    const position = column.stageId === null ? 1 : staged.indexOf(column) + 1;
    weighted += column.value * stageWeight(position, staged.length);
  }

  return {
    count: open.reduce((sum, column) => sum + column.total, 0),
    value: open.reduce((sum, column) => sum + column.value, 0),
    weighted: Math.round(weighted),
  };
}
