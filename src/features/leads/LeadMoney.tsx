import { useCallback } from "react";
import {
  INVOICE_STATUS_LABEL,
  QUOTE_STATUS_LABEL,
  documentNumber,
  isOverdueInvoice,
  type Invoice,
  type Quote,
} from "@shared/domain";
import { today as todayIn } from "@shared/dates";
import { useWorkspace } from "@/lib/workspace";
import { useResource } from "@/lib/resource";
import { formatDay, formatValue } from "@/lib/format";

/**
 * What this contact has been quoted and invoiced.
 *
 * A contact's page holds everything about the contact, and money is part of
 * that. Read-only here: a quote or an invoice is made on Money, where the
 * month's figures are, and lands here on its own.
 */
export function LeadMoney({ leadId, onOpenMoney }: { leadId: string; onOpenMoney: () => void }) {
  const { activeCompany } = useWorkspace();
  const currency = activeCompany?.currency ?? "INR";
  const day = todayIn(activeCompany?.timezone ?? "UTC");

  const fetchMoney = useCallback(() => window.caulder.money.forLead(leadId), [leadId]);
  const { data } = useResource<{ quotes: Quote[]; invoices: Invoice[] }>(fetchMoney);

  const documents = [
    ...(data?.invoices ?? []).map((invoice) => ({
      id: invoice.id,
      number: documentNumber("invoice", invoice.number),
      total: invoice.total,
      status: isOverdueInvoice(invoice, day) ? "Overdue" : INVOICE_STATUS_LABEL[invoice.status],
      danger: isOverdueInvoice(invoice, day),
      when: invoice.issuedOn,
      deal: invoice.dealTitle,
    })),
    ...(data?.quotes ?? []).map((quote) => ({
      id: quote.id,
      number: documentNumber("quote", quote.number),
      total: quote.total,
      status: QUOTE_STATUS_LABEL[quote.status],
      danger: false,
      when: quote.issuedOn,
      deal: quote.dealTitle,
    })),
  ].sort((a, b) => b.when.localeCompare(a.when));
  // Which deal a document is for only needs saying once there is a choice.
  const severalDeals = new Set(documents.map((doc) => doc.deal).filter(Boolean)).size > 1;

  return (
    <div className="leadtasks">
      <div className="leadtasks__head">
        <h2 className="card__title">Money</h2>
        <button type="button" className="btn btn--sm" onClick={onOpenMoney}>
          Open Money
        </button>
      </div>

      {documents.length === 0 ? (
        <p className="card__hint">Nothing quoted or invoiced yet.</p>
      ) : (
        <ul className="money__list money__list--compact">
          {documents.map((doc) => (
            <li key={doc.id} className="money__row">
              <span className="money__main money__main--flat">
                <span className="money__number">{doc.number}</span>
                {severalDeals && doc.deal && <span className="money__who">{doc.deal}</span>}
                <span className="money__when">{formatDay(doc.when)}</span>
              </span>
              <span className="money__amount">{formatValue(doc.total, currency)}</span>
              <span className={`badge ${doc.danger ? "badge--danger" : "badge--neutral"}`}>{doc.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
