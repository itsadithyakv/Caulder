import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { Portal } from "@/components/Portal";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import type { MoneyOverview } from "@shared/domain";
import { ACCOUNTANT_PERIODS, periodLabel, type AccountantPeriod } from "@shared/accountant";

/**
 * Money ahead, and who it comes from (PLAN.md, part thirteen, phases 54 and
 * 55): the next ninety days in three thirties, and each client's year.
 * Worked out when read; nothing here is typed in.
 */

export function MoneyAhead({ data, money }: { data: MoneyOverview; money: (value: number) => string }) {
  const { windows, late } = data.ahead;
  if (windows.every((window) => window.comingIn + window.retainers + window.goingOut === 0)) return null;
  return (
    <Card title="The next 90 days">
      <div className="ahead">
        {windows.map((window, index) => {
          const coming = window.comingIn + window.retainers;
          return (
            <div key={window.days} className="ahead__window">
              <span className="money__figureLabel">{index === 0 ? "Next 30 days" : `${window.days - 29} to ${window.days} days`}</span>
              <span className="ahead__in">In {money(coming)}</span>
              <span className="ahead__out">Out {money(window.goingOut)}</span>
              {index === 0 && late > 0 && <span className="ahead__late">{money(late)} of it late</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function ClientsTab({ data, money }: { data: MoneyOverview; money: (value: number) => string }) {
  const { clients, mostOfIt } = data.clients;
  if (clients.length === 0) return <Card title="Clients"><p className="card__hint">Nobody has been invoiced yet.</p></Card>;
  return (
    <Card title="Clients" hint={`This year, ${data.month.slice(0, 4)}.`}>
      {mostOfIt && (
        <p className="money__target">
          {Math.round(mostOfIt.share * 100)}% of this year&rsquo;s income is {mostOfIt.name}.
        </p>
      )}
      <table className="clients">
        <thead>
          <tr>
            <th>Client</th>
            <th className="n">Paid this year</th>
            <th className="n">Owed</th>
            <th className="n">Days to pay</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.leadId}>
              <td>{client.name}</td>
              <td className="n">
                {money(client.paidThisYear)}
                {client.share > 0 && <span className="clients__share"> {Math.round(client.share * 100)}%</span>}
              </td>
              <td className={`n${client.late > 0 ? " clients__late" : ""}`}>{client.owed > 0 ? money(client.owed) : "-"}</td>
              <td className="n">{client.daysToPay === null ? "-" : client.daysToPay}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/**
 * The accountant's pack (phase 56): a period, then a folder, and the
 * spreadsheet and the invoices are written there and the folder opened.
 */
export function AccountantForm({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const [period, setPeriod] = useState<AccountantPeriod>("last-quarter");
  // When the company's year starts, by its own rules: "This financial year" where it is not January.
  const [starts, setStarts] = useState(1);
  useEffect(() => {
    window.caulder.billing
      .company(companyId)
      .then((billing) => setStarts(billing.rules.yearStarts))
      .catch(() => setStarts(1));
  }, [companyId]);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function write() {
    setError(null);
    setBusy(true);
    try {
      const pack = await window.caulder.money.accountantPack(companyId, period);
      if (pack) setDone(`${pack.label}: ${pack.invoices === 1 ? "one invoice" : `${pack.invoices} invoices`}, written.`);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Portal>
      <div className="modal" role="dialog" aria-modal="true" aria-label="For the accountant">
        <div className="modal__panel anim-modal">
          <h2 className="card__title">For the accountant</h2>
          <p className="card__hint">The invoices with their tax, payments and spend, and every invoice as a PDF.</p>
          <ErrorLine>{error}</ErrorLine>
          <div className="chips">
            {ACCOUNTANT_PERIODS.map((each) => (
              <button key={each} type="button" className={`chip${period === each ? " chip--on" : ""}`} onClick={() => setPeriod(each)} disabled={busy}>
                {periodLabel(each, starts)}
              </button>
            ))}
          </div>
          {done && <p className="card__hint">{done}</p>}
          <div className="modal__actions">
            <span className="modal__spacer" />
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              {done ? "Close" : "Cancel"}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => void write()} disabled={busy}>
              {busy ? "Writing" : "Choose a folder"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** The quarter's tax by component and rate, under the month's figures, when any was charged. */
export function TaxQuarter({ data, money }: { data: MoneyOverview; money: (value: number) => string }) {
  if (data.taxQuarter.lines.length === 0) return null;
  return (
    <p className="money__target">
      Tax this quarter: {data.taxQuarter.lines.map((line) => `${line.label} ${money(line.amount)}`).join(" · ")}
    </p>
  );
}
