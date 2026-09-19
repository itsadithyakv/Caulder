import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { Term } from "@shared/domain";

/**
 * Terms: the span a timetable belongs to.
 *
 * A semester's worth of classes is one thing that starts and ends, not
 * forty-five unrelated blocks. Naming it is what makes "put the new timetable
 * in" a single action twice a year instead of an afternoon.
 */

type TermRow = {
  id: string;
  company_id: string;
  name: string;
  from_day: string;
  until_day: string;
};

function toTerm(row: TermRow): Term {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    fromDay: row.from_day,
    untilDay: row.until_day,
  };
}

export function listTerms(db: Db, companyId: string): Term[] {
  const rows = db
    .prepare(`SELECT * FROM terms WHERE company_id = ? ORDER BY from_day DESC`)
    .all(companyId) as TermRow[];
  return rows.map(toTerm);
}

export function createTerm(
  db: Db,
  companyId: string,
  input: { name: string; fromDay: string; untilDay: string },
): Term {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO terms (id, company_id, name, from_day, until_day, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, companyId, input.name, input.fromDay, input.untilDay, new Date().toISOString());

  const made = db.prepare(`SELECT * FROM terms WHERE id = ?`).get(id) as TermRow | undefined;
  if (!made) throw new Error("The term vanished immediately after being created.");
  return toTerm(made);
}

/**
 * Deletes the term, and nothing else.
 *
 * `block_series.term_id` nulls rather than cascades on purpose: a term that is
 * over is a label being removed, not a semester being un-happened. The blocks
 * stay exactly where they were, because that is what the weeks were.
 */
export function deleteTerm(db: Db, id: string): void {
  db.prepare(`DELETE FROM terms WHERE id = ?`).run(id);
}
