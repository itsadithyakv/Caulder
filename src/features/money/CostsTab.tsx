import { useState } from "react";
import { FilePlus2, Trash2 } from "lucide-react";
import {
  COST_CYCLE_LABEL,
  cashBalanceInput,
  describeRenewal,
  describeRunway,
  type CashBalanceInput,
  type CostsOverview,
  type RunningCost,
} from "@shared/costs";
import { templateOf, type BrainSectionId } from "@shared/brain";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorLine } from "@/components/ErrorLine";
import { formatDay, formatMonth, formatValue } from "@/lib/format";

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What a cost is, in a word: its kind for a running cost, else what page it is. */
function kindOf(cost: RunningCost): string {
  if (cost.template === "running-cost") {
    const option = templateOf("running-cost")
      .fields.find((field) => field.key === "category")
      ?.options?.find((candidate) => candidate.value === cost.category);
    return option?.label ?? "Running cost";
  }
  return templateOf(cost.template).name;
}

/**
 * Running costs and runway.
 *
 * The costs are brain pages - a tool, a domain, a running cost - so adding
 * one opens the page to fill in, and clicking one opens it again. What is done
 * here is what is not writing: paying a renewal, and saying what is in the
 * bank.
 */
export function CostsTab({
  overview,
  busy,
  onRenew,
  onAddBalance,
  onRemoveBalance,
  onOpenPage,
  onNewPage,
}: {
  overview: CostsOverview;
  busy: boolean;
  onRenew: (pageId: string) => void;
  onAddBalance: (input: CashBalanceInput) => Promise<boolean>;
  onRemoveBalance: (id: string) => void;
  onOpenPage: (pageId: string) => void;
  onNewPage: (section: BrainSectionId, template: string) => void;
}) {
  const { runway, currency, day } = overview;
  const money = (value: number) => formatValue(value, currency);
  const [updating, setUpdating] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  // Grouped by the account each is on, or the product it serves - offered only once some cost says.
  const [grouping, setGrouping] = useState<"account" | "product" | null>(null);
  const keysOf = (by: "account" | "product") =>
    [...new Set(overview.costs.map((cost) => cost[by]).filter((value): value is string => value !== null))].sort((a, b) => a.localeCompare(b));
  const offered = (["account", "product"] as const).filter((by) => keysOf(by).length > 0);
  const renewing = new Set(overview.renewals.map((renewal) => renewal.pageId));
  const earlier = overview.balances.slice(1);

  /** One running cost; its account and product said on the row, unless the list is grouped by one. */
  const row = (cost: RunningCost, grouped: "account" | "product" | null) => {
    const soon = renewing.has(cost.pageId) && cost.nextOn !== null;
    const late = cost.nextOn !== null && cost.nextOn < day;
    return (
      <li key={cost.pageId} className="money__row cost">
        <button type="button" className="money__main" onClick={() => onOpenPage(cost.pageId)}>
          <span className="money__number cost__title">{cost.title}</span>
          <span className="money__who">
            {kindOf(cost)}
            {cost.cycle && cost.years === 1 && ` · ${COST_CYCLE_LABEL[cost.cycle]}`}
            {cost.each !== null && (cost.cycle !== "monthly" || cost.years > 1) && cost.each > 0 && ` · ${money(cost.each)}`}
            {cost.years > 1 && ` for ${cost.years} years`}
            {grouped !== "product" && cost.product && ` · ${cost.product}`}
            {grouped !== "account" && cost.account && ` · ${cost.account}`}
          </span>
          {cost.nextOn && (
            <span className={`money__when${late ? " cost__late" : ""}`}>
              {capitalise(describeRenewal({ nextOn: cost.nextOn, cycle: cost.cycle }, day))}
            </span>
          )}
        </button>
        <span className="money__amount">
          {/* Nothing where nothing is owed: a free tool, or a page that only says which account a service is on. */}
          {cost.amount === null
            ? cost.cycle !== null || cost.nextOn !== null
              ? "Not priced"
              : ""
            : cost.cycle === "free"
              ? ""
              : cost.monthly > 0
                ? `${money(cost.monthly)}/mo`
                : money(cost.amount)}
        </span>
        {soon ? (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => onRenew(cost.pageId)}
            disabled={busy}
            aria-label={`${cost.title} is paid`}
            title="Records the payment and moves the date on"
          >
            Paid
          </button>
        ) : (
          <span className="cost__spacer" aria-hidden />
        )}
      </li>
    );
  };

  return (
    <>
      <Card
        title="Runway"
        actions={
          !updating && (
            <button type="button" className="btn btn--sm" onClick={() => setUpdating(true)} disabled={busy}>
              {runway.cash === null ? "Say what is in the bank" : "Update the cash"}
            </button>
          )
        }
      >
        {updating && (
          <BalanceForm
            day={day}
            busy={busy}
            onCancel={() => setUpdating(false)}
            onSave={async (input) => {
              if (await onAddBalance(input)) setUpdating(false);
            }}
          />
        )}

        {runway.cash === null ? (
          !updating && (
            <p className="card__hint">
              What is in the bank, to see how long it lasts.
            </p>
          )
        ) : (
          <div className="runway">
            <p className="runway__headline">
              {runway.months === null ? (
                <>
                  <span className="runway__big runway__big--ok">Not burning</span>
                  <span className="runway__sub">More came in than went out, on average.</span>
                </>
              ) : (
                <>
                  <span className={`runway__big${runway.months < 6 ? " runway__big--warn" : ""}`}>
                    {describeRunway(runway.months)}
                  </span>
                  {runway.runsOutOn && (
                    <span className="runway__sub">
                      at this rate the money lasts to {formatMonth(runway.runsOutOn)}
                    </span>
                  )}
                </>
              )}
            </p>
            <dl className="runway__sum">
              <div>
                <dt>In the bank</dt>
                <dd>
                  {money(runway.cash)}
                  <span className="runway__note"> on {formatDay(runway.cashOn ?? day)}</span>
                </dd>
              </div>
              <div>
                <dt>Running costs</dt>
                <dd>{money(runway.running)} a month</dd>
              </div>
              <div>
                <dt>Other spending</dt>
                <dd>
                  {money(runway.oneOff)} a month
                  <span className="runway__note"> on average</span>
                </dd>
              </div>
              <div>
                <dt>Paid in</dt>
                <dd>
                  {money(runway.income)} a month
                  <span className="runway__note"> on average</span>
                </dd>
              </div>
              <div className="runway__burn">
                <dt>Burn</dt>
                <dd>{runway.burn > 0 ? `${money(runway.burn)} a month` : "Nothing"}</dd>
              </div>
            </dl>
            <p className="card__hint">
              Averaged over the last {runway.basis === 1 ? "month" : `${runway.basis} months`}.
            </p>
          </div>
        )}

        {earlier.length > 0 && (
          <div className="runway__earlier">
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              aria-expanded={showEarlier}
              onClick={() => setShowEarlier((open) => !open)}
            >
              {showEarlier ? "Hide earlier balances" : `Earlier balances (${earlier.length})`}
            </button>
            {showEarlier && (
              <ul className="money__list money__list--compact" aria-label="Balances">
                {overview.balances.map((balance) => (
                  <li key={balance.id} className="money__row">
                    <span className="money__main money__main--flat">
                      <span className="money__number">{formatDay(balance.asOf)}</span>
                      {balance.note && <span className="money__who">{balance.note}</span>}
                    </span>
                    <span className="money__amount">{money(balance.amount)}</span>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost btn--danger btn--icon"
                      aria-label={`Delete the balance of ${formatDay(balance.asOf)}`}
                      onClick={() => onRemoveBalance(balance.id)}
                      disabled={busy}
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card
        title="Running costs"
        actions={
          <div className="actions">
            <button type="button" className="btn btn--sm btn--primary" onClick={() => onNewPage("money", "running-cost")}>
              <FilePlus2 size={14} aria-hidden />
              Add a running cost
            </button>
            <button type="button" className="btn btn--sm" onClick={() => onNewPage("tools", "tool")}>
              Add a tool
            </button>
            <button type="button" className="btn btn--sm" onClick={() => onNewPage("tools", "domain")}>
              Add a domain
            </button>
          </div>
        }
      >
        {overview.costs.length === 0 ? (
          <EmptyState
            title="Nothing recurring yet"
            body="A tool, a domain or a running cost written down in Brain shows here, with what it costs a month and when it renews."
          />
        ) : (
          <>
            <p className="costs__total">
              <span className="costs__totalValue">{money(overview.monthly)}</span> a month, all told
            </p>
            {offered.length > 0 && (
              <div className="chips">
                {offered.map((by) => (
                  <button
                    key={by}
                    type="button"
                    className={`chip${grouping === by ? " chip--on" : ""}`}
                    aria-pressed={grouping === by}
                    onClick={() => setGrouping((on) => (on === by ? null : by))}
                  >
                    {by === "account" ? "By account" : "By product"}
                  </button>
                ))}
              </div>
            )}
            {grouping && offered.includes(grouping) ? (
              [...keysOf(grouping), null].map((key) => {
                const under = overview.costs.filter((cost) => cost[grouping] === key);
                if (under.length === 0) return null;
                const none = grouping === "account" ? "No account said" : "No product said";
                return (
                  <section key={key ?? "none"} className="costs__account">
                    <h3 className="costs__accountName">{key ?? none}</h3>
                    <ul className="money__list" aria-label={key ? `Running costs: ${key}` : `Running costs: ${none.toLowerCase()}`}>
                      {under.map((cost) => row(cost, grouping))}
                    </ul>
                  </section>
                );
              })
            ) : (
              <ul className="money__list" aria-label="Running costs">
                {overview.costs.map((cost) => row(cost, null))}
              </ul>
            )}
          </>
        )}
      </Card>
    </>
  );
}

function BalanceForm({
  day,
  busy,
  onSave,
  onCancel,
}: {
  day: string;
  busy: boolean;
  onSave: (input: CashBalanceInput) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [asOf, setAsOf] = useState(day);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="money__spendForm balanceform anim-spring"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const parsed = cashBalanceInput.safeParse({
          amount: amount.trim() === "" ? undefined : Number(amount.replace(/[,\s]/g, "")),
          asOf,
          note,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the balance.");
          return;
        }
        onSave(parsed.data);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onCancel();
      }}
      noValidate
    >
      <div className="blockform__row">
        <label className="field">
          <span className="field__label">In the bank</span>
          <input
            className="input"
            inputMode="numeric"
            value={amount}
            autoFocus
            disabled={busy}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">On</span>
          <input
            className="input"
            type="date"
            value={asOf}
            max={day}
            disabled={busy}
            onChange={(event) => setAsOf(event.target.value)}
          />
        </label>
      </div>
      <label className="field">
        <span className="field__label">Note</span>
        <input
          className="input"
          value={note}
          maxLength={200}
          placeholder="Across both accounts, after the grant"
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <ErrorLine>{error}</ErrorLine>
      <div className="actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          Save balance
        </button>
      </div>
    </form>
  );
}
