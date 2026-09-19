import { useCallback, useId, useState } from "react";
import { ArrowLeft, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import {
  METRIC_KINDS,
  METRIC_KIND_LABEL,
  changeOf,
  derivedMetric,
  metricInput,
  towardTarget,
  valueInput,
  type Metric,
  type MetricDetail,
  type MetricInput,
  type MetricsOverview,
} from "@shared/metrics";
import { today as todayIn } from "@shared/dates";
import { Card } from "@/components/Card";
import { Chips } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { useResource } from "@/lib/resource";
import { formatDay, formatValue } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { useWorkspace } from "@/lib/workspace";
import { MetricChart, monthLabel } from "./MetricChart";

/** A metric's number, as it is measured. */
function formatter(metric: Pick<Metric, "kind" | "unitLabel">, currency: string): (value: number) => string {
  const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  if (metric.kind === "money") return (value) => formatValue(Math.round(value), currency);
  if (metric.kind === "percent") return (value) => `${number.format(value)}%`;
  return (value) => (metric.unitLabel ? `${number.format(value)} ${metric.unitLabel}` : number.format(value));
}

/**
 * The brain's Metrics section: a card for each number the company watches,
 * with a year of history, and the way to add one - worked out from what
 * Caulder holds, or written down as it is counted.
 */
export function MetricsPanel({ companyId, onChanged }: { companyId: string; onChanged: () => void }) {
  const fetch = useCallback(() => window.caulder.metrics.overview(companyId), [companyId]);
  const { data, error, reload, setError } = useResource<MetricsOverview>(fetch);
  const [fresh, setFresh] = useState<MetricsOverview | null>(null);
  const [adding, setAdding] = useState<"choose" | "own" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = fresh ?? data;

  async function run(work: () => Promise<MetricsOverview>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      setFresh(await work());
      after?.();
      onChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  if (openId) {
    return (
      <MetricView
        metricId={openId}
        onBack={() => {
          setOpenId(null);
          setFresh(null);
          reload();
        }}
        onChanged={onChanged}
      />
    );
  }

  if (!shown) return <ErrorLine>{error}</ErrorLine>;
  const none = shown.metrics.length === 0;
  const choosing = adding === "choose" || (adding === null && none);

  return (
    <div className="metrics">
      <Card
        title="The numbers"
        hint="A year of each. The ones Caulder works out are always up to date; the rest are what you write down."
        actions={
          !none &&
          adding === null && (
            <button type="button" className="btn btn--sm btn--primary" onClick={() => setAdding("choose")}>
              <Plus size={15} aria-hidden />
              Add a metric
            </button>
          )
        }
      >
        <ErrorLine>{error}</ErrorLine>

        {choosing && (
          <div className="metricpick anim-spring" role="group" aria-label="Metrics to add">
            {shown.available.length > 0 && (
              <>
                <h3 className="presets__title">Worked out from what Caulder holds</h3>
                <ul className="metricpick__list">
                  {shown.available.map((metric) => (
                    <li key={metric.source} className="metricpick__item">
                      <span className="metricpick__words">
                        <span className="preset__title">{metric.name}</span>
                        <span className="preset__note">{metric.hint}</span>
                      </span>
                      <button
                        type="button"
                        className="btn btn--sm"
                        disabled={busy}
                        aria-label={`Add ${metric.name}`}
                        onClick={() =>
                          // The list stays open for the next one; Done closes it.
                          void run(() => window.caulder.metrics.addDerived(companyId, metric.source), () => setAdding("choose"))
                        }
                      >
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="leadform__actions">
              <button type="button" className="btn btn--sm" onClick={() => setAdding("own")} disabled={busy}>
                Something you count yourself
              </button>
              {!none && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAdding(null)} disabled={busy}>
                  Done
                </button>
              )}
            </div>
          </div>
        )}

        {adding === "own" && (
          <MetricForm
            busy={busy}
            onCancel={() => setAdding(null)}
            onSubmit={(input) => run(() => window.caulder.metrics.create(companyId, input), () => setAdding(null))}
          />
        )}

      </Card>

      {!none && (
        <ul className="metrics__grid" aria-label="The metrics">
          {shown.metrics.map((metric) => (
            <li key={metric.id}>
              <MetricCard metric={metric} currency={shown.currency} onOpen={() => setOpenId(metric.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What the number is compared with, in words, and whether the move is the good way. */
function comparison(metric: Metric, format: (value: number) => string) {
  if (metric.flow) {
    return metric.previous === null ? null : { text: `Last month ${format(metric.previous)}`, tone: null, up: null };
  }
  const change = changeOf(metric.now, metric.previous, metric.direction);
  if (!change) return null;
  if (change.delta === 0) return { text: "No change on the reading before", tone: null, up: null };
  const size = change.percent !== null ? `${Math.abs(change.percent)}%` : format(Math.abs(change.delta));
  return {
    text: `${change.delta > 0 ? "Up" : "Down"} ${size} on the reading before`,
    tone: change.good ? "good" : "bad",
    up: change.delta > 0,
  };
}

function MetricCard({ metric, currency, onOpen }: { metric: Metric; currency: string; onOpen: () => void }) {
  const format = formatter(metric, currency);
  const compared = comparison(metric, format);
  const reach = towardTarget(metric.now, metric.target, metric.direction);

  return (
    <article className="metric" aria-label={metric.name}>
      <div className="metric__head">
        <button type="button" className="metric__name" onClick={onOpen}>
          {metric.name}
        </button>
        <span className="metric__source">{metric.source === "manual" ? "Written down" : "Worked out"}</span>
      </div>
      <p className="metric__value">{metric.now === null ? "-" : format(metric.now)}</p>
      <p className="metric__when">
        {metric.flow
          ? `${monthLabel(metric.history.at(-1)?.month ?? "")}, so far`
          : metric.nowOn
            ? `On ${formatDay(metric.nowOn)}`
            : "Nothing written down yet"}
      </p>
      {compared && (
        <p className={`metric__change${compared.tone ? ` metric__change--${compared.tone}` : ""}`}>
          {compared.up === true && <TrendingUp size={14} aria-hidden />}
          {compared.up === false && <TrendingDown size={14} aria-hidden />}
          {compared.text}
        </p>
      )}
      <MetricChart history={metric.history} flow={metric.flow} format={format} label={metric.name} />
      {reach !== null && metric.target !== null && (
        <div className="metric__target">
          <span className="metric__meter" aria-hidden>
            <span className="metric__meterFill" style={{ width: `${Math.min(100, reach * 100)}%` }} />
          </span>
          <span className="metric__targetWords">
            {Math.round(reach * 100)}% of the target, {format(metric.target)}
          </span>
        </div>
      )}
    </article>
  );
}

/** One metric: its year, the months as a table, its readings, and changing it. */
function MetricView({ metricId, onBack, onChanged }: { metricId: string; onBack: () => void; onChanged: () => void }) {
  const id = useId();
  const { activeCompany } = useWorkspace();
  const fetch = useCallback(() => window.caulder.metrics.detail(metricId), [metricId]);
  const { data, error, setError } = useResource<MetricDetail>(fetch);
  const [fresh, setFresh] = useState<MetricDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [onDay, setOnDay] = useState(() => todayIn(activeCompany?.timezone ?? "UTC"));
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const shown = fresh ?? data;

  async function run(work: () => Promise<MetricDetail>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      setFresh(await work());
      after?.();
      onChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!shown) return <ErrorLine>{error}</ErrorLine>;
  const { metric } = shown;
  const format = formatter(metric, shown.currency);
  const manual = metric.source === "manual";
  const derived = derivedMetric(metric.source);

  return (
    <div className="metrics">
      <div className="detail__bar">
        <button type="button" className="btn btn--sm" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden />
          All metrics
        </button>
        <div className="detail__barActions">
          {!editing && (
            <button type="button" className="btn btn--sm" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {!confirming ? (
            <button type="button" className="btn btn--sm btn--ghost btn--danger" onClick={() => setConfirming(true)}>
              <Trash2 size={14} aria-hidden />
              Delete
            </button>
          ) : (
            <span className="detail__confirm">
              <span className="card__hint">{manual ? "Its readings go too." : "Nothing is lost: it is worked out."}</span>
              <button
                type="button"
                className="btn btn--sm btn--danger"
                disabled={busy}
                onClick={() =>
                  void window.caulder.metrics
                    .remove(metric.id)
                    .then(() => {
                      onChanged();
                      onBack();
                    })
                    .catch((cause: unknown) => setError(messageOf(cause)))
                }
              >
                Delete
              </button>
              <button type="button" className="btn btn--sm" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </span>
          )}
        </div>
      </div>

      <ErrorLine>{error}</ErrorLine>

      <Card title={metric.name} hint={derived?.hint ?? metric.notes ?? undefined}>
        {editing ? (
          <MetricForm
            metric={metric}
            busy={busy}
            onCancel={() => setEditing(false)}
            onSubmit={(input) => run(() => window.caulder.metrics.update(metric.id, input), () => setEditing(false))}
          />
        ) : (
          <>
            <p className="metric__value metric__value--large">{metric.now === null ? "-" : format(metric.now)}</p>
            <MetricChart history={metric.history} flow={metric.flow} format={format} label={metric.name} large />
            <table className="metrictable">
              <caption className="visually-hidden">{metric.name}, by month</caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">{metric.flow ? "In the month" : "Last reading"}</th>
                </tr>
              </thead>
              <tbody>
                {[...metric.history].reverse().map((point, index) => (
                  <tr key={point.month}>
                    <th scope="row">
                      {monthLabel(point.month)}
                      {metric.flow && index === 0 ? ", so far" : ""}
                    </th>
                    <td>{point.value === null ? "-" : format(point.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      {manual && (
        <Card title="Readings" hint="One a day at most: a second on the same day replaces the first.">
          <form
            className="metricrecord"
            aria-label="Write down a reading"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              const parsed = valueInput.safeParse({
                onDay,
                value: value.trim() === "" ? Number.NaN : Number(value.replace(/[,\s%\p{Sc}]/gu, "")),
                note: note.trim() === "" ? null : note,
              });
              if (!parsed.success) {
                setError(parsed.error.issues[0]?.path[0] === "value" ? "The value is a number." : (parsed.error.issues[0]?.message ?? "Check the reading."));
                return;
              }
              void run(
                () => window.caulder.metrics.record(metric.id, parsed.data),
                () => {
                  setValue("");
                  setNote("");
                },
              );
            }}
            noValidate
          >
            <div className="field">
              <label className="field__label" htmlFor={`${id}-day`}>
                On
              </label>
              <input
                id={`${id}-day`}
                type="date"
                className="input"
                value={onDay}
                disabled={busy}
                onChange={(event) => setOnDay(event.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor={`${id}-value`}>
                Value
              </label>
              <input
                id={`${id}-value`}
                className="input"
                inputMode="decimal"
                value={value}
                disabled={busy}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
            <div className="field metricrecord__note">
              <label className="field__label" htmlFor={`${id}-note`}>
                Note
              </label>
              <input
                id={`${id}-note`}
                className="input"
                value={note}
                maxLength={200}
                disabled={busy}
                placeholder="Optional"
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>
              Write it down
            </button>
          </form>

          {shown.values.length > 0 && (
            <ul className="duelist" aria-label="Readings">
              {shown.values.map((reading) => (
                <li key={reading.id} className="duerow">
                  <span className="duerow__main">
                    <span className="duerow__title">{format(reading.value)}</span>
                    {reading.note && <span className="duerow__what">{reading.note}</span>}
                  </span>
                  <span className="duerow__when">{formatDay(reading.onDay)}</span>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost btn--danger btn--icon"
                    aria-label={`Delete the reading on ${formatDay(reading.onDay)}`}
                    disabled={busy}
                    onClick={() => void run(() => window.caulder.metrics.unrecord(reading.id))}
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function MetricForm({
  metric,
  busy,
  onSubmit,
  onCancel,
}: {
  metric?: Metric;
  busy: boolean;
  onSubmit: (input: MetricInput) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const worked = metric !== undefined && metric.source !== "manual";
  const [name, setName] = useState(metric?.name ?? "");
  const [kind, setKind] = useState(metric?.kind ?? "count");
  const [unitLabel, setUnitLabel] = useState(metric?.unitLabel ?? "");
  const [target, setTarget] = useState(metric?.target === null || metric === undefined ? "" : String(metric.target));
  const [direction, setDirection] = useState<"up" | "down">(metric?.direction ?? "up");
  const [notes, setNotes] = useState(metric?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="leadform anim-spring"
      aria-label={metric ? `Edit ${metric.name}` : "Add a metric"}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const parsed = metricInput.safeParse({
          name,
          kind,
          unitLabel: kind === "count" && unitLabel.trim() !== "" ? unitLabel : null,
          target: target.trim() === "" ? null : Number(target.replace(/[,\s%\p{Sc}]/gu, "")),
          direction,
          notes: notes.trim() === "" ? null : notes,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.path[0] === "target" ? "The target is a number." : (parsed.error.issues[0]?.message ?? "Check the metric."));
          return;
        }
        void onSubmit(parsed.data);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || busy) return;
        event.preventDefault();
        onCancel();
      }}
      noValidate
    >
      <div className="leadform__row">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-name`}>
            Name
          </label>
          <input
            id={`${id}-name`}
            className="input"
            value={name}
            maxLength={80}
            autoFocus
            disabled={busy}
            placeholder="Customers signed"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-target`}>
            Target
          </label>
          <input
            id={`${id}-target`}
            className="input"
            inputMode="decimal"
            value={target}
            disabled={busy}
            placeholder="Optional"
            onChange={(event) => setTarget(event.target.value)}
          />
        </div>
      </div>
      {!worked && (
        <div className="leadform__row">
          <div className="field">
            <span className="field__label">Measured as</span>
            <Chips
              aria-label="Measured as"
              value={kind}
              disabled={busy}
              onChange={setKind}
              options={METRIC_KINDS.map((value) => ({ value, label: METRIC_KIND_LABEL[value] }))}
            />
          </div>
          {kind === "count" && (
            <div className="field">
              <label className="field__label" htmlFor={`${id}-unit`}>
                Counting
              </label>
              <input
                id={`${id}-unit`}
                className="input"
                value={unitLabel}
                maxLength={40}
                disabled={busy}
                placeholder="customers, users"
                onChange={(event) => setUnitLabel(event.target.value)}
              />
            </div>
          )}
        </div>
      )}
      <div className="field">
        <span className="field__label">Which way is good</span>
        <Chips
          aria-label="Which way is good"
          value={direction}
          disabled={busy}
          onChange={setDirection}
          options={[
            { value: "up", label: "Higher" },
            { value: "down", label: "Lower" },
          ]}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-notes`}>
          How it is counted
        </label>
        <textarea
          id={`${id}-notes`}
          className="input textarea"
          rows={2}
          value={notes}
          maxLength={2000}
          disabled={busy}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <ErrorLine>{error}</ErrorLine>
      <div className="leadform__actions">
        <button type="button" className="btn btn--sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>
          {metric ? "Save" : "Add the metric"}
        </button>
      </div>
    </form>
  );
}
