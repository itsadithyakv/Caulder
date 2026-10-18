import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { reminderFor } from "@shared/chase";
import { documentNumber, type Invoice, type Lead } from "@shared/domain";
import type { MailState } from "@shared/mail";
import { ErrorLine } from "@/components/ErrorLine";
import { Portal } from "@/components/Portal";
import { messageOf } from "@/lib/errors";
import { formatDay, formatValue } from "@/lib/format";

/**
 * A reminder about an unpaid invoice, read and changed before it goes
 * (PLAN.md, part eight, phase 34). Sent the way any email to a contact is -
 * from Gmail through the script, or from another account - so it is on
 * their history and a reply is seen. With nothing to send from, it opens in
 * the computer's own mail app instead. Never sent by itself.
 */
export function ChaseForm({
  invoice,
  company,
  currency,
  day,
  onClose,
  onSent,
}: {
  invoice: Invoice;
  /** The company's name, which the reminder is from. */
  company: string;
  currency: string;
  day: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const number = documentNumber("invoice", invoice.number);
  const [lead, setLead] = useState<Lead | null>(null);
  const [mail, setMail] = useState<MailState | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const written = useMemo(
    () =>
      reminderFor({
        invoice,
        company,
        person: lead?.contactPerson ?? null,
        day,
        money: (value) => formatValue(value, currency),
        date: formatDay,
      }),
    [invoice, company, lead, day, currency],
  );

  useEffect(() => {
    let live = true;
    Promise.all([window.caulder.leads.find(invoice.leadId), window.caulder.mail.state()]).then(
      ([found, state]) => {
        if (!live) return;
        setLead(found);
        setMail(state);
      },
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
    };
  }, [invoice.leadId]);

  // The words follow who it is to, until somebody has changed them.
  useEffect(() => {
    setSubject(written.subject);
    setBody(written.body);
  }, [written]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sender = mail?.senders[0] ?? null;
  const loaded = lead !== null && mail !== null;

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      onSent();
    } catch (cause) {
      setError(messageOf(cause));
      setBusy(false);
    }
  }

  return (
    <Portal>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`A reminder about ${number}`}>
        <form
          className="modal__panel anim-modal money__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!lead || !sender) return;
            void run(() =>
              window.caulder.mail.send({ leadId: lead.id, accountId: sender.id, templateId: null, subject, body, sendAt: null, followUp: null }),
            );
          }}
        >
          <h2 className="card__title">A reminder about {number}</h2>
          <p className="card__hint">
            To {invoice.leadName}
            {lead?.email ? `, at ${lead.email}` : ""}
            {sender ? `, from ${sender.address}` : ""}.
          </p>
          <ErrorLine>{error}</ErrorLine>
          {loaded && !lead.email && (
            <p className="field__error" role="alert">
              {invoice.leadName} has no email address. Add one on their page, and the reminder can go.
            </p>
          )}

          <label className="field">
            <span className="field__label">Subject</span>
            <input className="input" value={subject} disabled={busy} onChange={(event) => setSubject(event.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Message</span>
            <textarea className="textarea" rows={9} value={body} disabled={busy} onChange={(event) => setBody(event.target.value)} />
          </label>
          <p className="card__hint">The invoice's PDF is not attached: an email from Caulder carries no attachments yet.</p>

          <div className="actions actions--end">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            {loaded && !sender && lead.email && (
              // Nothing connected to send from: the computer's own mail app, which Caulder cannot see into.
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void run(() => window.caulder.outreach.email(lead.id, subject, body))}
              >
                Open it in my mail app
              </button>
            )}
            {sender && (
              <button type="submit" className="btn btn--primary" disabled={busy || !loaded || !lead.email || subject.trim() === "" || body.trim() === ""}>
                <Send size={14} aria-hidden />
                {busy ? "Sending" : "Send the reminder"}
              </button>
            )}
          </div>
        </form>
      </div>
    </Portal>
  );
}
