import { CHANNELS } from "@shared/ipc";
import { getDatabase } from "../db/connection";
import { assertId, handle } from "./handle";
import {
  addDerivedMetric,
  addMetric,
  buildMetrics,
  editMetric,
  metricDetail,
  record,
  removeMetric,
  unrecord,
} from "../services/metrics";

/** Metrics from the window. A reading or an edit hands back the metric; the rest, the whole list. */
export function registerMetricHandlers(): void {
  const companyOf = (value: unknown) => assertId(value, "company id");
  const metricOf = (value: unknown) => assertId(value, "metric id");

  handle(CHANNELS.metricsOverview, (_event, companyId: unknown) => buildMetrics(getDatabase(), companyOf(companyId)));

  handle(CHANNELS.metricsDetail, (_event, id: unknown) => metricDetail(getDatabase(), metricOf(id)));

  handle(CHANNELS.metricsCreate, (_event, companyId: unknown, raw: unknown) =>
    addMetric(getDatabase(), companyOf(companyId), raw),
  );

  handle(CHANNELS.metricsAddDerived, (_event, companyId: unknown, source: unknown) =>
    addDerivedMetric(getDatabase(), companyOf(companyId), source),
  );

  handle(CHANNELS.metricsUpdate, (_event, id: unknown, raw: unknown) => editMetric(getDatabase(), metricOf(id), raw));

  handle(CHANNELS.metricsRemove, (_event, id: unknown) => removeMetric(getDatabase(), metricOf(id)));

  handle(CHANNELS.metricsRecord, (_event, id: unknown, raw: unknown) => record(getDatabase(), metricOf(id), raw));

  handle(CHANNELS.metricsUnrecord, (_event, valueId: unknown) =>
    unrecord(getDatabase(), assertId(valueId, "reading id")),
  );
}
