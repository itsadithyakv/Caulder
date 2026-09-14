import type { Db } from "../db/connection";
import { listBlocks, listBlocksBetween } from "../repositories/blocks";
import { listNotesOn } from "../repositories/notes";
import { listDueOn } from "../repositories/tasks";
import { layOut, spentByKind, elapsedMinutes } from "@shared/day";
import {
  DAY_MINUTES,
  minutesOf,
  shiftDay,
  startOfWeek,
  timeNow,
  today as todayIn,
} from "@shared/dates";
import type { DayPlan, WeekPlan } from "@shared/domain";

/**
 * One day, assembled.
 *
 * The same discipline as buildForecast and buildToday: this gathers rows and
 * hands them to shared/day.ts, which does the arithmetic. Nothing here decides
 * how a day is laid out or what counts as spent.
 */

function companyTimezone(db: Db, companyId: string): string {
  const row = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as
    | { timezone: string }
    | undefined;
  return row?.timezone ?? "UTC";
}

export function buildDay(db: Db, companyId: string, day: string, now = new Date()): DayPlan {
  const timezone = companyTimezone(db, companyId);
  const blocks = listBlocks(db, companyId, day);

  // How far through the day being looked at we are. A day already gone is
  // entirely spent and one still ahead entirely unspent; only today has a
  // cursor part-way along it, and it is the clock where the company is rather
  // than where the machine is.
  const currentDay = todayIn(timezone, now);
  const cursor =
    day < currentDay ? DAY_MINUTES : day > currentDay ? 0 : minutesOf(timeNow(timezone, now));

  return {
    day,
    blocks: layOut(blocks),
    tasks: listDueOn(db, companyId, day),
    notes: listNotesOn(db, companyId, day),
    spent: spentByKind(blocks),
    planned: blocks.reduce((total, block) => total + block.minutes, 0),
    elapsed: elapsedMinutes(blocks, cursor),
  };
}

/**
 * The week a day falls in, as seven laid-out days.
 *
 * Laid out per day rather than across the week, which is the only sensible
 * reading: two blocks on Tuesday and Wednesday at the same hour are not
 * competing for anything, and treating them as an overlap would halve the
 * width of both for no reason.
 *
 * One read of the whole span rather than seven of one day each — the same
 * shape as every other builder here: gather rows, hand them to shared/.
 */
export function buildWeek(db: Db, companyId: string, day: string): WeekPlan {
  const from = startOfWeek(day);
  const days = Array.from({ length: 7 }, (_, index) => shiftDay(from, index));
  const blocks = listBlocksBetween(db, companyId, from, days[6] ?? from);

  return {
    from,
    days: days.map((each) => {
      const mine = blocks.filter((block) => block.day === each);
      return {
        day: each,
        blocks: layOut(mine),
        planned: mine.reduce((total, block) => total + block.minutes, 0),
      };
    }),
  };
}
