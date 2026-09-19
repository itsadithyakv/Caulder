import type { Db } from "../db/connection";
import { today as todayIn } from "@shared/dates";
import {
  DERIVED_METRICS,
  derivedMetric,
  monthsEnding,
  type Metric,
  type MetricDetail,
  type MetricPoint,
  type MetricsOverview,
  type MetricValue,
} from "@shared/metrics";
import { listInvoices } from "../repositories/money";
import {
  createMetric,
  deleteMetric,
  deleteValue,
  listMetricRows,
  listValues,
  metricRow,
  recordValue,
  updateMetric,
  type MetricRow,
} from "../repositories/metrics";

/**
 * Metrics as the screen shows them: each with this month, last month and a
 * year of history. A derived one is read off the tables that already hold it,
 * by month, every time - so a payment recorded a minute ago is in "Paid in".
 */

const MONTHS = 12;

function companyOf(db: Db, companyId: string): { timezone: string; currency: string } {
  const row = db.prepare(`SELECT timezone, currency FROM companies WHERE id = ?`).get(companyId) as
    | { timezone: string; currency: string }
    | undefined;
  if (!row) throw new Error("That company no longer exists.");
  return row;
}

type ByMonth = Map<string, number>;

function grouped(db: Db, sql: string, companyId: string): ByMonth {
  const rows = db.prepare(sql).all(companyId) as { m: string | null; v: number | null }[];
  return new Map(rows.filter((row) => row.m).map((row) => [row.m as string, row.v ?? 0]));
}

/** A flow by month, from whichever table holds it. */
function flowByMonth(db: Db, companyId: string, source: string): ByMonth {
  switch (source) {
    case "paid-in":
      return grouped(db, `SELECT substr(paid_on, 1, 7) AS m, SUM(amount) AS v FROM payments WHERE company_id = ? GROUP BY m`, companyId);
    case "spent":
      return grouped(db, `SELECT substr(spent_on, 1, 7) AS m, SUM(amount) AS v FROM spend WHERE company_id = ? GROUP BY m`, companyId);
    case "invoiced": {
      // Totals come from the lines, which is the money repository's business.
      const out: ByMonth = new Map();
      for (const invoice of listInvoices(db, companyId)) {
        if (invoice.status === "draft" || invoice.status === "void") continue;
        const month = invoice.issuedOn.slice(0, 7);
        out.set(month, (out.get(month) ?? 0) + invoice.total);
      }
      return out;
    }
    case "net": {
      const paid = flowByMonth(db, companyId, "paid-in");
      const spent = flowByMonth(db, companyId, "spent");
      const out: ByMonth = new Map();
      for (const month of new Set([...paid.keys(), ...spent.keys()])) {
        out.set(month, (paid.get(month) ?? 0) - (spent.get(month) ?? 0));
      }
      return out;
    }
    case "deals-won":
    case "won-value":
      return grouped(
        db,
        `SELECT substr(d.closed_at, 1, 7) AS m, ${source === "deals-won" ? "COUNT(*)" : "SUM(COALESCE(d.value, 0))"} AS v
           FROM deals d JOIN pipeline_stages s ON s.id = d.stage_id
          WHERE d.company_id = ? AND s.kind = 'won' AND d.closed_at IS NOT NULL
          GROUP BY m`,
        companyId,
      );
    case "new-contacts":
      return grouped(db, `SELECT substr(created_at, 1, 7) AS m, COUNT(*) AS v FROM leads WHERE company_id = ? GROUP BY m`, companyId);
    case "calls":
      return grouped(db, `SELECT substr(created_at, 1, 7) AS m, COUNT(*) AS v FROM calls WHERE company_id = ? GROUP BY m`, companyId);
    default:
      return new Map();
  }
}

/** Readings as a level: each month's last, the latest overall, and the one before it. */
function levelOf(
  readings: readonly { onDay: string; value: number }[],
  months: readonly string[],
  today: string,
  carry: boolean,
): Pick<Metric, "now" | "nowOn" | "previous" | "history"> {
  const upToToday = readings.filter((reading) => reading.onDay <= today).sort((a, b) => a.onDay.localeCompare(b.onDay));
  const latest = upToToday.at(-1) ?? null;
  const before = upToToday.at(-2) ?? null;
  let carried: number | null = null;
  const history: MetricPoint[] = months.map((month) => {
    const inMonth = upToToday.filter((reading) => reading.onDay.startsWith(month));
    const last = inMonth.at(-1);
    if (carry) {
      // A bank balance is still the balance next month until a new one is written.
      const earlier = upToToday.filter((reading) => reading.onDay.slice(0, 7) <= month).at(-1);
      carried = earlier ? earlier.value : null;
      return { month, value: carried };
    }
    return { month, value: last ? last.value : null };
  });
  return { now: latest?.value ?? null, nowOn: latest?.onDay ?? null, previous: before?.value ?? null, history };
}

function toMetric(db: Db, row: MetricRow, today: string): Metric {
  const months = monthsEnding(today, MONTHS);
  const derived = derivedMetric(row.source);
  const base = {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    kind: row.kind,
    unitLabel: row.unit_label,
    source: row.source,
    target: row.target,
    direction: row.direction,
    notes: row.notes,
  };

  if (derived?.flow) {
    const byMonth = flowByMonth(db, row.company_id, row.source);
    const history = months.map((month) => ({ month, value: byMonth.get(month) ?? 0 }));
    return {
      ...base,
      flow: true,
      now: history.at(-1)?.value ?? 0,
      nowOn: null,
      previous: history.at(-2)?.value ?? 0,
      history,
    };
  }

  if (derived) {
    // The bank balance: the one level Caulder already keeps.
    const readings = (
      db.prepare(`SELECT as_of AS onDay, amount AS value FROM cash_balances WHERE company_id = ? ORDER BY as_of, created_at`).all(
        row.company_id,
      ) as { onDay: string; value: number }[]
    );
    return { ...base, flow: false, ...levelOf(readings, months, today, true) };
  }

  return { ...base, flow: false, ...levelOf(listValues(db, row.id), months, today, false) };
}

export function buildMetrics(db: Db, companyId: string, now: Date = new Date()): MetricsOverview {
  const company = companyOf(db, companyId);
  const day = todayIn(company.timezone, now);
  const rows = listMetricRows(db, companyId);
  const added = new Set(rows.map((row) => row.source));
  return {
    day,
    currency: company.currency,
    metrics: rows.map((row) => toMetric(db, row, day)),
    available: DERIVED_METRICS.filter((metric) => !added.has(metric.source)),
  };
}

export function metricDetail(db: Db, id: string, now: Date = new Date()): MetricDetail {
  const row = metricRow(db, id);
  const company = companyOf(db, row.company_id);
  const day = todayIn(company.timezone, now);
  const values: MetricValue[] = row.source === "manual" ? listValues(db, id) : [];
  return { day, currency: company.currency, metric: toMetric(db, row, day), values };
}

/** One written down by the company: a name, what it is measured in, and which way is good. */
export function addMetric(db: Db, companyId: string, raw: unknown, now: Date = new Date()): MetricsOverview {
  companyOf(db, companyId);
  createMetric(db, companyId, raw, "manual", now);
  return buildMetrics(db, companyId, now);
}

/** One of the derived metrics, under its own name. */
export function addDerivedMetric(db: Db, companyId: string, source: unknown, now: Date = new Date()): MetricsOverview {
  const derived = typeof source === "string" ? derivedMetric(source) : null;
  if (!derived) throw new Error("Caulder does not work that one out.");
  createMetric(db, companyId, { name: derived.name, kind: derived.kind, direction: derived.direction }, derived.source, now);
  return buildMetrics(db, companyId, now);
}

export function editMetric(db: Db, id: string, raw: unknown, now: Date = new Date()): MetricDetail {
  updateMetric(db, id, raw, now);
  return metricDetail(db, id, now);
}

export function removeMetric(db: Db, id: string, now: Date = new Date()): MetricsOverview {
  const companyId = metricRow(db, id).company_id;
  deleteMetric(db, id);
  return buildMetrics(db, companyId, now);
}

export function record(db: Db, metricId: string, raw: unknown, now: Date = new Date()): MetricDetail {
  recordValue(db, metricId, raw, now);
  return metricDetail(db, metricId, now);
}

export function unrecord(db: Db, valueId: string, now: Date = new Date()): MetricDetail {
  return metricDetail(db, deleteValue(db, valueId), now);
}
