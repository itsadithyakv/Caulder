import { RulesAside } from "@/components/RulesAside";
import { Fragment, useEffect, useRef, useState } from "react";
import { Package, Plus, Trash2, X } from "lucide-react";
import {
  INVOICE_REPEATS,
  INVOICE_REPEAT_LABEL,
  invoiceInput,
  paymentInput,
  quoteInput,
  spendEntryInput,
  type Deal,
  type Invoice,
  type LeadListRow,
  type Payment,
  type Quote,
} from "@shared/domain";
import { shiftDay } from "@shared/dates";
import { rateFor, taxSystemFor, taxed, treatmentFor, treatmentLabel, treatmentsFor, type TaxTreatment } from "@shared/tax";
import type { ClientBilling, CompanyBilling } from "@shared/billing";
import { describeRecurrence, type PickableProduct } from "@shared/products";
import { Portal } from "@/components/Portal";
import { Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { formatDay, formatValue } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * The forms behind the Money screen.
 *
 * One form for a quote and an invoice, because they are the same document
 * with one more date on it. Lines are edited in place and the total is worked
 * out as you type, so what the form says is what the file will say.
 */

/**
 * A line as typed. `productId` is set when it came from the catalogue, and
 * stays until unlinked. `taxRate` is the line's tax as typed, "" for none.
 */
type LineDraft = { description: string; quantity: string; unitPrice: string; productId: string | null; taxRate: string };

const EMPTY_LINE: LineDraft = { description: "", quantity: "1", unitPrice: "", productId: null, taxRate: "" };

const rateText = (rate: number | null | undefined) => (rate === null || rate === undefined ? "" : String(rate));

/** The company's settings and a client's, as the tax rules read them. */
const asCompany = (billing: CompanyBilling) => ({
  country: billing.country,
  on: billing.taxOn,
  rate: billing.taxRate,
  inclusive: billing.taxInclusive,
  region: billing.taxRegion,
  number: billing.taxNumber,
  rules: billing.rules,
});
const asClient = (billing: ClientBilling | null) => ({ country: billing?.taxCountry ?? null, region: billing?.taxRegion ?? null, number: billing?.taxNumber ?? null });

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

export function DocumentForm({
  companyId,
  day,
  currency,
  kind,
  existing,
  onClose,
  onSaved,
}: {
  companyId: string;
  day: string;
  currency: string;
  kind: "quote" | "invoice";
  existing: Quote | Invoice | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  useEscape(onClose);

  const [contacts, setContacts] = useState<LeadListRow[]>([]);
  const [leadId, setLeadId] = useState(existing?.leadId ?? "");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealId, setDealId] = useState(existing?.dealId ?? "");
  const [issuedOn, setIssuedOn] = useState(existing?.issuedOn ?? day);
  const [dueOn, setDueOn] = useState(
    existing && "dueOn" in existing ? existing.dueOn : shiftDay(day, 14),
  );
  /** Changed by hand: the client's terms no longer move it. */
  const [dueTouched, setDueTouched] = useState(Boolean(existing));
  const [validUntil, setValidUntil] = useState(existing && "validUntil" in existing ? (existing.validUntil ?? "") : "");
  const [company, setCompany] = useState<CompanyBilling | null>(null);
  const [client, setClient] = useState<ClientBilling | null>(null);
  /** How it is taxed: "" for no tax. Worked out from the client until chosen by hand. */
  const [treatment, setTreatment] = useState<string>(existing?.taxTreatment ?? "");
  const [treatmentTouched, setTreatmentTouched] = useState(Boolean(existing));
  const [inclusive, setInclusive] = useState(existing?.taxInclusive ?? false);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  /** A retainer: how often this invoice is written again. "" is never. */
  const [repeats, setRepeats] = useState<string>(existing && "repeats" in existing ? (existing.repeats ?? "") : "");
  const [lines, setLines] = useState<LineDraft[]>(
    existing && existing.lines.length > 0
      ? existing.lines.map((line) => ({
          description: line.description,
          quantity: String(line.quantity),
          unitPrice: String(line.unitPrice),
          productId: line.productId,
          taxRate: rateText(line.taxRate),
        }))
      : [EMPTY_LINE],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<PickableProduct[]>([]);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    window.caulder.leads
      .list({ companyId, sort: "name", direction: "asc" })
      .then(setContacts)
      .catch(() => setContacts([]));
    window.caulder.products
      .pickable(companyId)
      .then(setProducts)
      .catch(() => setProducts([]));
    window.caulder.billing
      .company(companyId)
      .then((billing) => {
        setCompany(billing);
        if (!existing) setInclusive(billing.taxInclusive);
      })
      .catch(() => setCompany(null));
  }, [companyId, existing]);

  // The client's billing details: their terms set the due day, and where they are sets the tax.
  useEffect(() => {
    if (leadId === "") {
      setClient(null);
      return;
    }
    let live = true;
    window.caulder.billing
      .client(companyId, leadId)
      .then((found) => live && setClient(found))
      .catch(() => live && setClient(null));
    return () => {
      live = false;
    };
  }, [companyId, leadId]);

  const charging = Boolean(company?.taxOn) || treatment !== "";
  const country = company?.country ?? null;
  const usual = company ? rateFor(asCompany(company), asClient(client), (treatment || null) as TaxTreatment | null) : null;

  // A new document follows its client: how it is taxed, each untouched line's rate, and the due day by their terms.
  useEffect(() => {
    if (!company || existing) return;
    if (!treatmentTouched) setTreatment(treatmentFor(asCompany(company), asClient(client)) ?? "");
    if (!dueTouched) setDueOn(shiftDay(issuedOn, client?.paymentTerms ?? company.paymentTerms ?? 14));
    // `usual` follows treatment, which this effect sets; reading it here would be a step behind.
  }, [company, client, existing, treatmentTouched, dueTouched, issuedOn]);

  // A line still on the rate filled in for it follows when that changes - a client in another province, say; one typed by hand stays.
  const filledRate = useRef<string | null>(null);
  useEffect(() => {
    if (existing || usual === null) return;
    const before = filledRate.current;
    const next = String(usual);
    filledRate.current = next;
    setLines((current) => current.map((line) => (!line.productId && (line.taxRate === "" || line.taxRate === before) ? { ...line, taxRate: next } : line)));
  }, [usual, existing]);

  /**
   * A product from the catalogue becomes a line with its name and today's
   * price. After that the line is the line's own: its words and its price can
   * be changed for this one customer without touching the catalogue.
   */
  function pick(product: PickableProduct) {
    const line: LineDraft = {
      description: product.name,
      quantity: "1",
      unitPrice: product.price ? String(product.price.amount) : "",
      productId: product.id,
      taxRate: charging ? rateText(product.taxRate ?? usual) : "",
    };
    setLines((current) => {
      const blank = current.findIndex((draft) => draft.description.trim() === "" && draft.unitPrice.trim() === "");
      return blank >= 0 ? current.map((draft, at) => (at === blank ? line : draft)) : [...current, line];
    });
    setPicking(false);
  }

  const productName = (id: string | null) => products.find((product) => product.id === id)?.name ?? null;

  // The chosen contact's deals, main one first. With one or none there is
  // nothing to ask; with several, the picker starts on the main deal, which is
  // where the document would go anyway.
  useEffect(() => {
    if (leadId === "") {
      setDeals([]);
      return;
    }
    let live = true;
    window.caulder.deals
      .forLead(leadId)
      .then((found) => {
        if (!live) return;
        setDeals(found);
        setDealId((current) => (found.some((deal) => deal.id === current) ? current : (found[0]?.id ?? "")));
      })
      .catch(() => live && setDeals([]));
    return () => {
      live = false;
    };
  }, [leadId]);

  // What the company calls its tax, by its own rules.
  const taxName = company?.rules.name ?? taxSystemFor(country).name;
  // What the file will say: each line, its tax at its own rate, written as the treatment says.
  const money = taxed(
    lines.flatMap((line) => {
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      const rate = line.taxRate.trim() === "" ? null : Number(line.taxRate);
      return Number.isFinite(quantity) && Number.isFinite(unitPrice) ? [{ quantity, unitPrice, taxRate: rate !== null && Number.isFinite(rate) ? rate : null }] : [];
    }),
    { treatment: (treatment || null) as TaxTreatment | null, inclusive, country, region: client?.taxRegion ?? company?.taxRegion ?? null, ...(company ? { name: company.rules.name } : {}) },
  );

  function setLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)));
  }

  async function save() {
    setError(null);
    const raw = {
      leadId,
      dealId: dealId === "" ? null : dealId,
      repeats: repeats === "" ? null : repeats,
      issuedOn,
      dueOn,
      notes: notes.trim() === "" ? null : notes,
      validUntil: validUntil === "" ? null : validUntil,
      lines: lines.map((line) => ({
        description: line.description,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        productId: line.productId,
        taxRate: charging && line.taxRate.trim() !== "" ? Number(line.taxRate) : null,
      })),
      tax: { treatment: treatment === "" ? null : treatment, inclusive },
    };
    const parsed = kind === "invoice" ? invoiceInput.safeParse(raw) : quoteInput.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details.");
      return;
    }
    setBusy(true);
    try {
      if (kind === "invoice") {
        await window.caulder.money.saveInvoice(companyId, existing?.id ?? null, parsed.data as never);
      } else {
        await window.caulder.money.saveQuote(companyId, existing?.id ?? null, parsed.data);
      }
      onSaved();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const title = existing
    ? `${kind === "invoice" ? "Invoice" : "Quote"} ${existing.number}`
    : kind === "invoice"
      ? "New invoice"
      : "New quote";

  return (
    <Portal>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <form
          className="modal__panel anim-modal money__form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h2 className="card__title">{title}</h2>
          <ErrorLine>{error}</ErrorLine>
          {/* What the company holds to, where it is needed: the terms beside an invoice, the pricing beside a quote. */}
          <RulesAside companyId={companyId} subjects={kind === "invoice" ? ["Billing and payment"] : ["Pricing and discounts", "Billing and payment"]} />

          <label className="field">
            <span className="field__label">Contact</span>
            <Select
              value={leadId}
              onChange={setLeadId}
              disabled={busy}
              aria-label="Contact"
              options={[
                { value: "", label: "Pick a contact" },
                ...contacts.map((contact) => ({ value: contact.id, label: contact.name })),
              ]}
            />
          </label>

          {deals.length > 1 && (
            <label className="field">
              <span className="field__label">Deal</span>
              <Select
                value={dealId}
                onChange={setDealId}
                disabled={busy}
                aria-label="Deal"
                options={deals.map((deal) => ({ value: deal.id, label: deal.title }))}
              />
            </label>
          )}

          <div className="blockform__row">
            <label className="field">
              <span className="field__label">Issued</span>
              <input
                className="input"
                type="date"
                value={issuedOn}
                onChange={(event) => setIssuedOn(event.target.value)}
                disabled={busy}
              />
            </label>
            {kind === "invoice" && (
              <label className="field">
                <span className="field__label">Due</span>
                <input
                  className="input"
                  type="date"
                  value={dueOn}
                  onChange={(event) => {
                    setDueTouched(true);
                    setDueOn(event.target.value);
                  }}
                  disabled={busy}
                />
              </label>
            )}
            {kind === "quote" && (
              <label className="field">
                <span className="field__label">Valid until</span>
                <input className="input" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} disabled={busy} />
              </label>
            )}
          </div>

          {charging && (
            <div className="blockform__row">
              <label className="field">
                <span className="field__label">{taxName}</span>
                <Select
                  value={treatment}
                  onChange={(value) => {
                    setTreatmentTouched(true);
                    setTreatment(value);
                  }}
                  disabled={busy}
                  aria-label="Tax"
                  options={[{ value: "", label: "None" }, ...treatmentsFor(country).map((each) => ({ value: each, label: treatmentLabel(each, country, taxName) }))]}
                />
              </label>
              <label className="field checkline">
                <input type="checkbox" className="tickbox" checked={inclusive} onChange={(event) => setInclusive(event.target.checked)} disabled={busy} />
                <span className="checkline__title">Prices include {taxName}</span>
              </label>
            </div>
          )}

          {kind === "invoice" && (
            <div className="field">
              <span className="field__label">Repeats</span>
              <Select
                value={repeats}
                onChange={setRepeats}
                disabled={busy}
                aria-label="Repeats"
                options={[{ value: "", label: "No" }, ...INVOICE_REPEATS.map((each) => ({ value: each, label: INVOICE_REPEAT_LABEL[each] }))]}
              />
              {repeats !== "" && (
                <span className="card__hint">
                  Drafts the next one when it is due. Never sent by itself.
                </span>
              )}
            </div>
          )}

          <div className="field">
            <span className="field__label">Lines</span>
            <div className="money__lines">
              {lines.map((line, index) => (
                <div key={index} className={`money__line${line.productId ? " money__line--product" : ""}`}>
                  <input
                    className="input"
                    value={line.description}
                    onChange={(event) => setLine(index, { description: event.target.value })}
                    placeholder="What for"
                    aria-label={`Line ${index + 1} description`}
                    disabled={busy}
                  />
                  <input
                    className="input"
                    value={line.quantity}
                    onChange={(event) => setLine(index, { quantity: event.target.value })}
                    inputMode="decimal"
                    aria-label={`Line ${index + 1} quantity`}
                    disabled={busy}
                  />
                  <input
                    className="input"
                    value={line.unitPrice}
                    onChange={(event) => setLine(index, { unitPrice: event.target.value })}
                    inputMode="numeric"
                    placeholder="Unit price"
                    aria-label={`Line ${index + 1} unit price`}
                    disabled={busy}
                  />
                  {charging && (
                    <span className="money__lineTax">
                      <input
                        className="input"
                        value={line.taxRate}
                        onChange={(event) => setLine(index, { taxRate: event.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={`Line ${index + 1} tax rate`}
                        disabled={busy}
                      />
                      %
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost btn--danger"
                    aria-label={`Remove line ${index + 1}`}
                    disabled={busy || lines.length === 1}
                    onClick={() => setLines((current) => current.filter((_, at) => at !== index))}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                  {line.productId && (
                    <span className="money__lineProduct">
                      <Package size={12} aria-hidden />
                      {productName(line.productId) ?? "From the catalogue"}
                      <button
                        type="button"
                        className="money__unlink"
                        aria-label={`Stop counting line ${index + 1} as ${productName(line.productId) ?? "a product"}`}
                        title="Keep the words and price, but stop counting it as that product"
                        disabled={busy}
                        onClick={() => setLine(index, { productId: null })}
                      >
                        <X size={11} aria-hidden />
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
            {picking && (
              <div className="catalogue anim-spring" role="group" aria-label="The catalogue">
                {products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className="catalogue__item"
                    onClick={() => pick(product)}
                    disabled={busy}
                  >
                    <span className="catalogue__name">{product.name}</span>
                    <span className="catalogue__price">
                      {product.price
                        ? `${formatValue(product.price.amount, currency)} ${describeRecurrence(product.price.recurrence)}${
                            product.unit ? ` · per ${product.unit}` : ""
                          }`
                        : "No price yet"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="actions">
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                disabled={busy || lines.length >= 50}
                onClick={() => setLines((current) => [...current, { ...EMPTY_LINE, taxRate: charging ? rateText(usual) : "" }])}
              >
                <Plus size={14} aria-hidden />
                Add a line
              </button>
              {products.length > 0 && (
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  aria-expanded={picking}
                  disabled={busy || lines.length >= 50}
                  onClick={() => setPicking((open) => !open)}
                >
                  <Package size={14} aria-hidden />
                  From the catalogue
                </button>
              )}
              {money.tax.length === 0 && <span className="money__formTotal">Total {formatValue(money.total, currency)}</span>}
            </div>
            {money.tax.length > 0 && (
              <dl className="money__sums" aria-label="What it comes to">
                <dt>Subtotal</dt>
                <dd>{formatValue(money.subtotal, currency)}</dd>
                {money.tax.map((line) => (
                  <Fragment key={line.label}>
                    <dt>{line.label}</dt>
                    <dd>{formatValue(line.amount, currency)}</dd>
                  </Fragment>
                ))}
                <dt className="money__sumsTotal">Total</dt>
                <dd className="money__sumsTotal">{formatValue(money.total, currency)}</dd>
              </dl>
            )}
            {money.note && <span className="card__hint">{money.note}</span>}
          </div>

          <label className="field">
            <span className="field__label">Notes</span>
            <textarea
              className="textarea"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Payment details, terms, a thank you."
              disabled={busy}
            />
          </label>

          <div className="modal__actions">
            <span className="modal__spacer" />
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {existing ? "Save changes" : kind === "invoice" ? "Save invoice" : "Save quote"}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}

export function SpendForm({
  companyId,
  day,
  onClose,
  onSaved,
}: {
  companyId: string;
  day: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [what, setWhat] = useState("");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(day);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    const parsed = spendEntryInput.safeParse({ what, amount: Number(amount), spentOn });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details.");
      return;
    }
    setBusy(true);
    try {
      await window.caulder.money.addSpend(companyId, parsed.data);
      onSaved();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="money__spendForm anim-panel"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <ErrorLine>{error}</ErrorLine>
      <div className="money__line money__line--spend">
        <input
          className="input"
          value={what}
          onChange={(event) => setWhat(event.target.value)}
          placeholder="What for"
          aria-label="What the spend was for"
          autoFocus
          disabled={busy}
        />
        <input
          className="input"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="numeric"
          placeholder="Amount"
          aria-label="Amount spent"
          disabled={busy}
        />
        <input
          className="input"
          type="date"
          value={spentOn}
          onChange={(event) => setSpentOn(event.target.value)}
          aria-label="Spent on"
          disabled={busy}
        />
      </div>
      <div className="actions">
        <button type="button" className="btn btn--sm" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>
          Record it
        </button>
      </div>
    </form>
  );
}

/**
 * What has come in against one invoice, and a way to record more.
 *
 * Mark paid stays the one click for the usual case, a single payment of
 * everything owed. This is for the rest: a deposit now and the balance later,
 * and taking back a payment recorded by mistake. Removing one asks first,
 * because it changes what Paid says on the invoice and on the month, and can
 * reopen an invoice that was settled.
 */
export function PaymentsForm({
  companyId,
  invoice,
  day,
  currency,
  onClose,
  onSaved,
  onChanged,
}: {
  companyId: string;
  invoice: Invoice;
  day: string;
  currency: string;
  onClose: () => void;
  /** A payment recorded: the dialog has done its job. */
  onSaved: () => void;
  /** A payment removed: the figures move, and the dialog stays open on them. */
  onChanged: () => void;
}) {
  useEscape(onClose);
  const money = (value: number) => formatValue(value, currency);
  const owed = Math.max(invoice.total - invoice.paid, 0);
  // Only a sent invoice takes money: a draft has not been asked for yet, and
  // main refuses a void one.
  const canRecord = invoice.status === "sent" && owed > 0;

  const [amount, setAmount] = useState(String(owed));
  const [paidOn, setPaidOn] = useState(day);
  const [note, setNote] = useState("");
  // Tax the client kept back and paid in the company's name - India's TDS - by the company's own rules.
  const [withholding, setWithholding] = useState<{ name: string; rate: number } | null>(null);
  const [withheld, setWithheld] = useState("");
  useEffect(() => {
    window.caulder.billing
      .company(companyId)
      .then((billing) => setWithholding(billing.rules.withholding))
      .catch(() => setWithholding(null));
  }, [companyId]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Removing a payment changes what is owed, and the amount offered follows,
  // so taking one back and recording the right one is not a sum to redo.
  const [offeredFor, setOfferedFor] = useState(owed);
  if (offeredFor !== owed) {
    setOfferedFor(owed);
    setAmount(String(owed));
  }

  async function record() {
    setError(null);
    const parsed = paymentInput.safeParse({ amount: Number(amount), paidOn, note, withheld: withheld.trim() ? Number(withheld) : 0 });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details.");
      return;
    }
    if (parsed.data.amount + parsed.data.withheld > owed) {
      setError(`That is more than the ${money(owed)} still owed.`);
      return;
    }
    setBusy(true);
    try {
      await window.caulder.money.addPayment(companyId, invoice.id, parsed.data);
      onSaved();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove(payment: Payment) {
    setError(null);
    setBusy(true);
    try {
      await window.caulder.money.deletePayment(companyId, payment.id);
      setConfirming(null);
      onChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const title = `Payments on ${invoice.label}`;

  return (
    <Portal>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <form
          className="modal__panel anim-modal money__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (canRecord) void record();
          }}
        >
          <h2 className="card__title">{title}</h2>
          <p className="card__hint">
            {invoice.status === "paid"
              ? `Paid in full: ${money(invoice.paid)} of ${money(invoice.total)}.`
              : `${money(invoice.paid)} paid of ${money(invoice.total)}, ${money(owed)} still owed.`}
          </p>
          <ErrorLine>{error}</ErrorLine>

          {invoice.payments.length === 0 ? (
            <p className="card__hint">Nothing has come in against it yet.</p>
          ) : (
            <ul className="money__list money__list--compact" aria-label="Payments">
              {invoice.payments.map((payment) => (
                <li key={payment.id} className="money__row">
                  <span className="money__main money__main--flat">
                    <span className="money__number">{formatDay(payment.paidOn)}</span>
                    {(payment.note || payment.withheld > 0) && (
                      <span className="money__who">
                        {[payment.note, payment.withheld > 0 ? `${withholding?.name ?? "Tax"} withheld ${money(payment.withheld)}` : null].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="money__amount">{money(payment.amount)}</span>
                  {confirming === payment.id ? (
                    <span className="detail__confirm">
                      <span className="card__hint">Paid goes down by this much.</span>
                      <button
                        type="button"
                        className="btn btn--sm btn--danger"
                        disabled={busy}
                        onClick={() => void remove(payment)}
                      >
                        Remove
                      </button>
                      <button type="button" className="btn btn--sm" disabled={busy} onClick={() => setConfirming(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <span className="money__actions">
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost btn--danger"
                        disabled={busy}
                        aria-label={`Remove the payment of ${money(payment.amount)} on ${formatDay(payment.paidOn)}`}
                        onClick={() => setConfirming(payment.id)}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canRecord && (
            <>
              <h3 className="field__label">Record a payment</h3>
              <div className="blockform__row">
                <label className="field">
                  <span className="field__label">Amount</span>
                  <input
                    className="input"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="numeric"
                    autoFocus
                    disabled={busy}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Paid on</span>
                  <input
                    className="input"
                    type="date"
                    value={paidOn}
                    onChange={(event) => setPaidOn(event.target.value)}
                    disabled={busy}
                  />
                </label>
              </div>
              {withholding && (
                <label className="field checkline">
                  <input
                    type="checkbox"
                    className="tickbox"
                    checked={withheld !== ""}
                    disabled={busy}
                    onChange={(event) => {
                      if (event.target.checked) {
                        // On what was charged before tax, as TDS is; never more than is owed.
                        const kept = Math.min(owed, Math.round((invoice.subtotal * withholding.rate) / 100));
                        setWithheld(String(kept));
                        setAmount(String(Math.max(owed - kept, 0)));
                      } else {
                        setWithheld("");
                        setAmount(String(owed));
                      }
                    }}
                  />
                  <span className="checkline__title">They deducted {withholding.name}</span>
                </label>
              )}
              {withheld !== "" && (
                <label className="field">
                  <span className="field__label">{withholding?.name ?? "Tax"} withheld</span>
                  <input className="input" value={withheld} onChange={(event) => setWithheld(event.target.value)} inputMode="numeric" disabled={busy} />
                </label>
              )}
              <label className="field">
                <span className="field__label">Note</span>
                <input
                  className="input"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Deposit, bank transfer, cheque 104"
                  maxLength={500}
                  disabled={busy}
                />
              </label>
            </>
          )}

          <div className="modal__actions">
            <span className="modal__spacer" />
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              {canRecord ? "Cancel" : "Done"}
            </button>
            {canRecord && (
              <button type="submit" className="btn btn--primary" disabled={busy}>
                Record the payment
              </button>
            )}
          </div>
        </form>
      </div>
    </Portal>
  );
}

/** The monthly target. Set here rather than in Settings, because it is about money. */
export function TargetForm({
  companyId,
  currency,
  current,
  onClose,
  onSaved,
}: {
  companyId: string;
  currency: string;
  current: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  useEscape(onClose);
  const [value, setValue] = useState(current === null ? "" : String(current));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(goal: number | null) {
    setError(null);
    setBusy(true);
    try {
      await window.caulder.companies.setGoal(companyId, goal === null ? null : { value: goal, period: "month" });
      onSaved();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(parsed) && parsed > 0;

  return (
    <Portal>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Monthly target">
        <form
          className="modal__panel anim-modal"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) void save(Math.round(parsed));
          }}
        >
          <h2 className="card__title">Monthly target</h2>
          <p className="card__hint">What you want paid in a month, in {currency}.</p>
          <ErrorLine>{error}</ErrorLine>
          <label className="field">
            <span className="field__label">Amount</span>
            <input
              className="input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              inputMode="numeric"
              placeholder="100000"
              autoFocus
              disabled={busy}
            />
          </label>
          <div className="modal__actions">
            {current !== null && (
              <button type="button" className="btn btn--ghost" onClick={() => void save(null)} disabled={busy}>
                Clear it
              </button>
            )}
            <span className="modal__spacer" />
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy || !valid}>
              Set the target
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
