import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { metricInput, valueInput, type MetricKind, type MetricValue } from "@shared/metrics";

/** Metrics and their readings, as rows. What each is worth this month is services/metrics.ts. */

export type MetricRow = {
  id: string;
  company_id: string;
  name: string;
  kind: MetricKind;
  unit_label: string | null;
  source: string;
  target: number | null;
  direction: "up" | "down";
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export function listMetricRows(db: Db, companyId: string): MetricRow[] {
  return db
    .prepare(`SELECT * FROM metrics WHERE company_id = ? ORDER BY position, created_at`)
    .all(companyId) as MetricRow[];
}

export function metricRow(db: Db, id: string): MetricRow {
  const row = db.prepare(`SELECT * FROM metrics WHERE id = ?`).get(id) as MetricRow | undefined;
  if (!row) throw new Error("That metric is no longer here.");
  return row;
}

function nextPosition(db: Db, companyId: string): number {
  const row = db.prepare(`SELECT MAX(position) AS top FROM metrics WHERE company_id = ?`).get(companyId) as {
    top: number | null;
  };
  return (row.top ?? -1) + 1;
}

/** A metric: one written down (`source` "manual"), or one of the derived ones by its key. */
export function createMetric(
  db: Db,
  companyId: string,
  raw: unknown,
  source: string,
  now: Date = new Date(),
): string {
  const input = metricInput.parse(raw);
  if (source !== "manual") {
    const taken = db.prepare(`SELECT 1 FROM metrics WHERE company_id = ? AND source = ?`).get(companyId, source);
    if (taken) throw new Error("That one is already on the list.");
  }
  const id = randomUUID();
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO metrics (id, company_id, name, kind, unit_label, source, target, direction, notes, position, created_at, updated_at)
     VALUES (@id, @companyId, @name, @kind, @unitLabel, @source, @target, @direction, @notes, @position, @at, @at)`,
  ).run({ ...input, id, companyId, source, position: nextPosition(db, companyId), at });
  return id;
}

/** A derived metric keeps its kind: "Paid in" is money whatever the form says. */
export function updateMetric(db: Db, id: string, raw: unknown, now: Date = new Date()): void {
  const before = metricRow(db, id);
  const input = metricInput.parse(raw);
  db.prepare(
    `UPDATE metrics SET name = @name, kind = @kind, unit_label = @unitLabel, target = @target, direction = @direction,
       notes = @notes, updated_at = @at
     WHERE id = @id`,
  ).run({ ...input, kind: before.source === "manual" ? input.kind : before.kind, id, at: now.toISOString() });
}

export function deleteMetric(db: Db, id: string): void {
  db.prepare(`DELETE FROM metrics WHERE id = ?`).run(id);
}

export function listValues(db: Db, metricId: string): MetricValue[] {
  const rows = db
    .prepare(`SELECT id, metric_id, on_day, value, note FROM metric_values WHERE metric_id = ? ORDER BY on_day DESC`)
    .all(metricId) as { id: string; metric_id: string; on_day: string; value: number; note: string | null }[];
  return rows.map((row) => ({ id: row.id, metricId: row.metric_id, onDay: row.on_day, value: row.value, note: row.note }));
}

/** A reading. A second one on the same day replaces the first: a day has one value. */
export function recordValue(db: Db, metricId: string, raw: unknown, now: Date = new Date()): void {
  const row = metricRow(db, metricId);
  if (row.source !== "manual") throw new Error("That one is worked out from what Caulder holds; there is nothing to write down.");
  const input = valueInput.parse(raw);
  db.prepare(
    `INSERT INTO metric_values (id, metric_id, on_day, value, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (metric_id, on_day) DO UPDATE SET value = excluded.value, note = excluded.note`,
  ).run(randomUUID(), metricId, input.onDay, input.value, input.note, now.toISOString());
}

/** Removes a reading, and says which metric it was on. */
export function deleteValue(db: Db, valueId: string): string {
  const row = db.prepare(`SELECT metric_id FROM metric_values WHERE id = ?`).get(valueId) as
    | { metric_id: string }
    | undefined;
  if (!row) throw new Error("That reading is no longer here.");
  db.prepare(`DELETE FROM metric_values WHERE id = ?`).run(valueId);
  return row.metric_id;
}
