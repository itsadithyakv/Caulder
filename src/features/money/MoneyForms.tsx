import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  invoiceInput,
  quoteInput,
  spendEntryInput,
  type Invoice,
  type LeadListRow,
  type Quote,
} from "@shared/domain";
import { shiftDay } from "@shared/dates";
import { Portal } from "@/components/Portal";
import { Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { formatValue } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * The forms behind the Money screen.
 *
 * One form for a quote and an invoice, because they are the same document
 * with one more date on it. Lines are edited in place and the total is worked
 * out as you type, so what the form says is what the file will say.
 */

type LineDraft = { description: string; quantity: string; unitPrice: string };

const EMPTY_LINE: LineDraft = { description: "", quantity: "1", unitPrice: "" };

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
  const [issuedOn, setIssuedOn] = useState(existing?.issuedOn ?? day);
  const [dueOn, setDueOn] = useState(
    existing && "dueOn" in existing ? existing.dueOn : shiftDay(day, 14),
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    existing && existing.lines.length > 0
      ? existing.lines.map((line) => ({
          description: line.description,
          quantity: String(line.quantity),
          unitPrice: String(line.unitPrice),
        }))
      : [EMPTY_LINE],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.caulder.leads
      .list({ companyId, sort: "name", direction: "asc" })
      .then(setContacts)
      .catch(() => setContacts([]));
  }, [companyId]);

  const total = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity);
    const price = Number(line.unitPrice);
    return Number.isFinite(quantity) && Number.isFinite(price) ? sum + Math.round(quantity * price) : sum;
  }, 0);

  function setLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)));
  }

  async function save() {
    setError(null);
    const raw = {
      leadId,
      issuedOn,
      dueOn,
      notes: notes.trim() === "" ? null : notes,
      lines: lines.map((line) => ({
        description: line.description,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
      })),
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
                  onChange={(event) => setDueOn(event.target.value)}
                  disabled={busy}
                />
              </label>
            )}
          </div>

          <div className="field">
            <span className="field__label">Lines</span>
            <div className="money__lines">
              {lines.map((line, index) => (
                <div key={index} className="money__line">
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
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost btn--danger"
                    aria-label={`Remove line ${index + 1}`}
                    disabled={busy || lines.length === 1}
                    onClick={() => setLines((current) => current.filter((_, at) => at !== index))}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                disabled={busy || lines.length >= 50}
                onClick={() => setLines((current) => [...current, EMPTY_LINE])}
              >
                <Plus size={14} aria-hidden />
                Add a line
              </button>
              <span className="money__formTotal">Total {formatValue(total, currency)}</span>
            </div>
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
    const parsed = spendEntryInput.safeParse({ what, amount: Number(amount), spentOn, campaignId: null });
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
