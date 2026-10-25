import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { formatDay } from "@/lib/format";
import { MetricChart, monthLabel } from "@/features/metrics/MetricChart";
import type { Health } from "@shared/health";

/**
 * How the company is doing with money (PLAN.md, part fourteen): a year of
 * money in and of what was left each month, as the metrics' own charts
 * draw them; the financial year's turnover against where registering for
 * tax is needed; the tax charged and withheld; the next filings. A part
 * with nothing in it is not drawn.
 */
export function MoneyHealth({ companyId, money, version }: { companyId: string; money: (value: number) => string; version: number }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.caulder.money
      .health(companyId)
      .then(setHealth)
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, [companyId, version]);

  if (!health) return error ? <ErrorLine>{error}</ErrorLine> : null;

  const moved = health.months.some((month) => month.paidIn !== 0 || month.spent !== 0);
  const { year, threshold } = health;
  const yearSaid = `${formatDay(year.from)} to ${formatDay(year.to)}`;

  return (
    <div className="health">
      {moved && (
        <Card title="A year of money">
          <div className="health__charts">
            <figure className="health__chart">
              <figcaption className="field__label">Money in</figcaption>
              <MetricChart history={health.months.map((month) => ({ month: month.month, value: month.paidIn }))} flow format={money} label="Money in, by month" large />
            </figure>
            <figure className="health__chart">
              <figcaption className="field__label">Left after spending</figcaption>
              <MetricChart
                history={health.months.map((month) => ({ month: month.month, value: month.paidIn - month.spent }))}
                flow
                format={money}
                label="Money in less money spent, by month"
                large
              />
            </figure>
          </div>
        </Card>
      )}

      <Card title="This financial year" hint={yearSaid}>
        <dl className="health__figures">
          <div>
            <dt>Invoiced, before tax</dt>
            <dd>{money(year.turnover)}</dd>
          </div>
          {year.taxCharged > 0 && (
            <div>
              <dt>Tax charged</dt>
              <dd>{money(year.taxCharged)}</dd>
            </div>
          )}
          {year.withheld > 0 && (
            <div>
              <dt>{health.withheldName ?? "Tax"} withheld by clients</dt>
              <dd>{money(year.withheld)}</dd>
            </div>
          )}
        </dl>
        {year.withheld > 0 && <p className="card__hint">Claimed back against your own tax.</p>}

        {threshold && (
          <div className="health__milestone">
            <div className="health__milestoneHead">
              <span>
                {money(year.turnover)} of {money(threshold.amount)}
              </span>
              <span className="card__hint">where registering is needed</span>
            </div>
            <div
              className={`health__bar${threshold.share >= 0.9 ? " health__bar--near" : ""}`}
              role="progressbar"
              aria-label="Turnover towards the registration threshold"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(threshold.share * 100)}
            >
              <span style={{ width: `${Math.round(threshold.share * 100)}%` }} />
            </div>
            <p className={threshold.share >= 1 ? "field__error" : "card__hint"}>
              {threshold.share >= 1
                ? "Passed. Register, then switch it on in Settings."
                : threshold.reachedBy
                  ? `At this pace, reached in ${monthLabel(threshold.reachedBy)}.`
                  : "Not this year, at this pace."}
            </p>
          </div>
        )}
      </Card>

      {health.filings.length > 0 && (
        <Card title="Next filings">
          <ul className="health__filings">
            {health.filings.map((filing) => (
              <li key={`${filing.title}-${filing.dueOn}`}>
                <span>{filing.title}</span>
                <span className="card__hint">{formatDay(filing.dueOn)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
