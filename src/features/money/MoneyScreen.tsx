import { useCallback, useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import {
  INVOICE_STATUS_LABEL,
  QUOTE_STATUS_LABEL,
  documentNumber,
  isOverdueInvoice,
  type Invoice,
  type MoneyOverview,
  type Quote,
  type SpendEntry,
} from "@shared/domain";
import { today as todayIn } from "@shared/dates";
import { useWorkspace } from "@/lib/workspace";
import { useResource } from "@/lib/resource";
import { formatValue, relativeDay } from "@/lib/format";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorLine } from "@/components/ErrorLine";
import { DocumentForm, SpendForm, TargetForm } from "./MoneyForms";

/**
 * Is the company making money?
 *
 * Four numbers for the month at the top - quoted, invoiced, paid, spent - and
 * the three lists under them. Nothing an accountant would recognise: no
 * ledger, no double entry, no tax. When the founder needs those they have an
 * accountant, and Export everything gives the accountant the CSVs.
 *
 * Every write comes back as the whole overview, so a payment updates the
 * invoice, the paid figure and the overdue list in one read.
 */

type Tab = "invoices" | "quotes" | "spend";

const TAB_LABEL: Record<Tab, string> = {
  invoices: "Invoices",
  quotes: "Quotes",
  spend: "Spend",
};

export function MoneyScreen() {
  const { activeCompany, refresh } = useWorkspace();
  const companyId = activeCompany?.id ?? null;
  const timezone = activeCompany?.timezone ?? "UTC";

  const fetchMoney = useCallback(() => window.caulder.money.get(companyId as string), [companyId]);
  const { data, error, busy, reload, act } = useResource<MoneyOverview>(companyId ? fetchMoney : null);

  const [tab, setTab] = useState<Tab>("invoices");
  const [editing, setEditing] = useState<
    { kind: "invoice"; invoice: Invoice | null } | { kind: "quote"; quote: Quote | null } | null
  >(null);
  const [addingSpend, setAddingSpend] = useState(false);
  const [settingTarget, setSettingTarget] = useState(false);

  if (!companyId) return null;
  if (!data) return <ErrorLine>{error}</ErrorLine>;

  const money = (value: number) => formatValue(value, data.currency);
  const day = todayIn(timezone);

  return (
    <div className="money anim-stagger">
      <ErrorLine>{error}</ErrorLine>

      <Card
        title="This month"
        actions={
          <button type="button" className="btn btn--sm" onClick={() => setSettingTarget(true)}>
            {data.target === null ? "Set a target" : "Change the target"}
          </button>
        }
      >
        <div className="money__figures">
          <Figure label="Quoted" value={money(data.quoted)} />
          <Figure label="Invoiced" value={money(data.invoiced)} />
          <Figure label="Paid" value={money(data.paid)} tone="ok" />
          <Figure label="Spent" value={money(data.spent)} tone="warn" />
        </div>
        {data.target !== null && (
          <p className="money__target">
            {data.paid >= data.target
              ? `Target of ${money(data.target)} reached.`
              : `${money(data.target - data.paid)} short of the ${money(data.target)} target.`}
          </p>
        )}
      </Card>

      {data.overdue.length > 0 && (
        <Card
          tone="alert"
          title={`${data.overdue.length} ${data.overdue.length === 1 ? "invoice is" : "invoices are"} overdue`}
        >
          <ul className="money__list">
            {data.overdue.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                money={money}
                day={day}
                busy={busy}
                onEdit={() => setEditing({ kind: "invoice", invoice })}
                onAct={act}
                companyId={companyId}
              />
            ))}
          </ul>
        </Card>
      )}

      <div className="tabs" role="tablist" aria-label="Money">
        {(Object.keys(TAB_LABEL) as Tab[]).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === option}
            onClick={() => setTab(option)}
          >
            {TAB_LABEL[option]}
          </button>
        ))}
      </div>

      {tab === "invoices" && (
        <Card
          title="Invoices"
          actions={
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => setEditing({ kind: "invoice", invoice: null })}
            >
              <Plus size={15} aria-hidden />
              New invoice
            </button>
          }
        >
          {data.invoices.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              body="An invoice is a contact, a few lines and a due date. Paid is what the payments say."
            />
          ) : (
            <ul className="money__list">
              {data.invoices.map((invoice) => (
                <InvoiceRow
                  key={invoice.id}
                  invoice={invoice}
                  money={money}
                  day={day}
                  busy={busy}
                  onEdit={() => setEditing({ kind: "invoice", invoice })}
                  onAct={act}
                  companyId={companyId}
                />
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "quotes" && (
        <Card
          title="Quotes"
          actions={
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => setEditing({ kind: "quote", quote: null })}
            >
              <Plus size={15} aria-hidden />
              New quote
            </button>
          }
        >
          {data.quotes.length === 0 ? (
            <EmptyState
              title="No quotes yet"
              body="Accepting a quote makes the invoice, and gives the deal its value."
            />
          ) : (
            <ul className="money__list">
              {data.quotes.map((quote) => (
                <QuoteRow
                  key={quote.id}
                  quote={quote}
                  money={money}
                  busy={busy}
                  onEdit={() => setEditing({ kind: "quote", quote })}
                  onAct={act}
                  companyId={companyId}
                />
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "spend" && (
        <Card
          title="Spend"
          actions={
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => setAddingSpend(true)}
            >
              <Plus size={15} aria-hidden />
              Add spend
            </button>
          }
        >
          {addingSpend && (
            <SpendForm
              companyId={companyId}
              day={day}
              onClose={() => setAddingSpend(false)}
              onSaved={() => {
                setAddingSpend(false);
                reload();
              }}
            />
          )}
          {data.spend.length === 0 ? (
            !addingSpend && (
              <EmptyState
                title="Nothing spent yet"
                body="Anything the company paid for: a domain, an ad, a train ticket."
              />
            )
          ) : (
            <ul className="money__list">
              {data.spend.map((entry) => (
                <SpendRow
                  key={entry.id}
                  entry={entry}
                  money={money}
                  busy={busy}
                  onDelete={() => void act(() => window.caulder.money.deleteSpend(companyId, entry.id))}
                />
              ))}
            </ul>
          )}
        </Card>
      )}

      {editing && (
        <DocumentForm
          companyId={companyId}
          day={day}
          currency={data.currency}
          kind={editing.kind}
          existing={editing.kind === "invoice" ? editing.invoice : editing.quote}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      {settingTarget && (
        <TargetForm
          companyId={companyId}
          currency={data.currency}
          current={data.target}
          onClose={() => setSettingTarget(false)}
          onSaved={() => {
            setSettingTarget(false);
            refresh();
            reload();
          }}
        />
      )}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className={`money__figure${tone ? ` money__figure--${tone}` : ""}`}>
      <span className="money__figureLabel">{label}</span>
      <span className="money__figureValue">{value}</span>
    </div>
  );
}

function InvoiceRow({
  invoice,
  money,
  day,
  busy,
  companyId,
  onEdit,
  onAct,
}: {
  invoice: Invoice;
  money: (value: number) => string;
  day: string;
  busy: boolean;
  companyId: string;
  onEdit: () => void;
  onAct: (run: () => Promise<unknown>) => Promise<void>;
}) {
  const overdue = isOverdueInvoice(invoice, day);
  const tone =
    invoice.status === "paid" ? "ok" : overdue ? "danger" : invoice.status === "void" ? "neutral" : "info";
  const api = window.caulder.money;

  return (
    <li className="money__row">
      <button type="button" className="money__main" onClick={onEdit} disabled={busy}>
        <span className="money__number">{documentNumber("invoice", invoice.number)}</span>
        <span className="money__who">{invoice.leadName}</span>
        <span className="money__when">
          {overdue ? `Due ${relativeDay(invoice.dueOn)}` : `Due ${invoice.dueOn}`}
        </span>
      </button>
      <span className="money__amount">
        {money(invoice.total)}
        {invoice.paid > 0 && invoice.status !== "paid" && (
          <span className="money__paid">{money(invoice.paid)} in</span>
        )}
      </span>
      <span className={`badge badge--${tone}`}>
        {overdue ? "Overdue" : INVOICE_STATUS_LABEL[invoice.status]}
      </span>
      <span className="money__actions">
        {invoice.status === "draft" && (
          <button
            type="button"
            className="btn btn--sm"
            disabled={busy}
            onClick={() => void onAct(() => api.setInvoiceStatus(companyId, invoice.id, "sent"))}
          >
            Mark sent
          </button>
        )}
        {invoice.status === "sent" && (
          <button
            type="button"
            className="btn btn--sm btn--primary"
            disabled={busy}
            onClick={() => void onAct(() => api.markPaid(companyId, invoice.id))}
          >
            Mark paid
          </button>
        )}
        {invoice.status !== "void" && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={busy}
            title="Write the PDF, attach it to the contact and open it"
            onClick={() => void onAct(() => api.invoicePdf(companyId, invoice.id))}
          >
            <FileText size={14} aria-hidden />
            PDF
          </button>
        )}
        {invoice.status === "draft" ? (
          <button
            type="button"
            className="btn btn--sm btn--ghost btn--danger"
            disabled={busy}
            aria-label={`Delete ${documentNumber("invoice", invoice.number)}`}
            onClick={() => void onAct(() => api.deleteInvoice(companyId, invoice.id))}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        ) : invoice.status !== "void" ? (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={busy}
            onClick={() => void onAct(() => api.setInvoiceStatus(companyId, invoice.id, "void"))}
          >
            Void
          </button>
        ) : null}
      </span>
    </li>
  );
}

function QuoteRow({
  quote,
  money,
  busy,
  companyId,
  onEdit,
  onAct,
}: {
  quote: Quote;
  money: (value: number) => string;
  busy: boolean;
  companyId: string;
  onEdit: () => void;
  onAct: (run: () => Promise<unknown>) => Promise<void>;
}) {
  const api = window.caulder.money;
  const tone =
    quote.status === "accepted" ? "ok" : quote.status === "declined" ? "neutral" : quote.status === "sent" ? "info" : "neutral";

  return (
    <li className="money__row">
      <button type="button" className="money__main" onClick={onEdit} disabled={busy}>
        <span className="money__number">{documentNumber("quote", quote.number)}</span>
        <span className="money__who">{quote.leadName}</span>
        <span className="money__when">{quote.issuedOn}</span>
      </button>
      <span className="money__amount">{money(quote.total)}</span>
      <span className={`badge badge--${tone}`}>{QUOTE_STATUS_LABEL[quote.status]}</span>
      <span className="money__actions">
        {quote.status === "draft" && (
          <button
            type="button"
            className="btn btn--sm"
            disabled={busy}
            onClick={() => void onAct(() => api.setQuoteStatus(companyId, quote.id, "sent"))}
          >
            Mark sent
          </button>
        )}
        {(quote.status === "draft" || quote.status === "sent") && (
          <>
            <button
              type="button"
              className="btn btn--sm btn--primary"
              disabled={busy}
              onClick={() => void onAct(() => api.acceptQuote(companyId, quote.id))}
            >
              Accepted
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              disabled={busy}
              onClick={() => void onAct(() => api.setQuoteStatus(companyId, quote.id, "declined"))}
            >
              Declined
            </button>
          </>
        )}
        {quote.status !== "accepted" && (
          <button
            type="button"
            className="btn btn--sm btn--ghost btn--danger"
            disabled={busy}
            aria-label={`Delete ${documentNumber("quote", quote.number)}`}
            onClick={() => void onAct(() => api.deleteQuote(companyId, quote.id))}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        )}
      </span>
    </li>
  );
}

function SpendRow({
  entry,
  money,
  busy,
  onDelete,
}: {
  entry: SpendEntry;
  money: (value: number) => string;
  busy: boolean;
  onDelete: () => void;
}) {
  return (
    <li className="money__row">
      <span className="money__main money__main--flat">
        <span className="money__who">{entry.what}</span>
        <span className="money__when">
          {entry.spentOn}
          {entry.campaignName ? ` · ${entry.campaignName}` : ""}
        </span>
      </span>
      <span className="money__amount">{money(entry.amount)}</span>
      <span className="money__actions">
        <button
          type="button"
          className="btn btn--sm btn--ghost btn--danger"
          disabled={busy}
          aria-label={`Delete the spend on ${entry.what}`}
          onClick={onDelete}
        >
          <Trash2 size={14} aria-hidden />
        </button>
      </span>
    </li>
  );
}
