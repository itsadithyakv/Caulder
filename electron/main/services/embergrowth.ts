import type { Db } from "../db/connection";
import { progressOf } from "@shared/progress";
import { streaksOf, warmthOf, type EmberStats } from "@shared/growth";
import { happeningsOf } from "./progress";

/**
 * How Ember is doing, read from what you have done (shared/growth.ts).
 *
 * Gathered the way your level is: every workspace you have, on the day of
 * the one asked for - your level is yours, and so is she. Nothing is written:
 * untick a habit and she is a marshmallow hungrier, as she should be.
 */
export function emberStats(db: Db, companyId: string, now: Date = new Date()): EmberStats {
  const home = happeningsOf(db, companyId, now);
  const others = (db.prepare(`SELECT id FROM companies WHERE id <> ? AND is_archived = 0`).all(companyId) as { id: string }[]).map(
    (row) => happeningsOf(db, row.id, now),
  );
  const happenings = [...home.happenings, ...others.flatMap((other) => other.happenings)];
  const runs = [...home.habits, ...others.flatMap((other) => other.habits)];
  const { level } = progressOf(happenings, runs, home.today);
  const { best, streak } = streaksOf(runs, home.today);
  return {
    level: level.level,
    xp: level.xp,
    best,
    streak,
    warmth: warmthOf(runs, home.today),
    habits: runs.length,
    keptToday: runs.filter((run) => run.days.includes(home.today)).length,
  };
}
