import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { reminderFor, sendingFor } from "@shared/chase";
import { type Invoice, type Lead, type Quote } from "@shared/domain";
import type { MailState } from "@shared/mail";
import { ErrorLine } from "@/components/ErrorLine";
import { Portal } from "@/components/Portal";
import { messageOf } from "@/lib/errors";
import { formatDay, formatValue } from "@/lib/format";

type Props = {
  /** The company's name, which the message is from. */
  company: string;
  currency: string;
  day: string;
  onClose: () => void;
  onSent: () => void;
};

/**
 * A reminder about an unpaid invoice, read and changed before it goes
 * (PLAN.md, part eight, phase 34), with the invoice's PDF if wanted.
 */
export function ChaseForm({ invoice, ...rest }: Props & { invoice: Invoice }) {
  return <DocumentMailForm kind="invoice" doc={invoice} purpose="chase" {...rest} />;
}

/**
 * An invoice or a quote, sent to the client with its PDF (part fourteen), or
 * an invoice chased. Sent the way any email to a contact is - from Gmail
 * through the script, or from another account - so it is on their history
 * and a reply is seen. With nothing to send from, it opens in the computer's
 * own mail app instead, where Caulder cannot put the file. Never sent by
 * itself.
 */
export function DocumentMailForm({
  kind,
  doc,
  purpose,
  company,
  currency,
  day,
  onClose,
  onSent,
}: Props & { kind: "invoice"; doc: Invoice; purpose: "send" | "chase" } | Props & { kind: "quote"; doc: Quote; purpose: "send" }) {
  const number = doc.label;
  const [lead, setLead] = useState<Lead | null>(null);
  const [mail, setMail] = useState<MailState | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const written = useMemo(() => {
    const money = (value: number) => formatValue(value, currency);
    const person = lead?.contactPerson ?? null;
    if (purpose === "chase" && kind === "invoice") return reminderFor({ invoice: doc, company, person, day, money, date: formatDay });
    return sendingFor({ kind, doc: { label: doc.label, total: doc.total, dueOn: kind === "invoice" ? doc.dueOn : doc.validUntil }, company, person, money, date: formatDay });
  }, [kind, doc, purpose, company, lead, day, currency]);

  useEffect(() => {
    let live = true;
    Promise.all([window.caulder.leads.find(doc.leadId), window.caulder.mail.state()]).then(
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
  }, [doc.leadId]);

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
  const heading = purpose === "chase" ? `A reminder about ${number}` : `Send ${number}`;

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
      <div className="modal" role="dialog" aria-modal="true" aria-label={heading}>
        <form
          className="modal__panel anim-modal money__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!lead || !sender) return;
            void run(() =>
              window.caulder.mail.send({
                leadId: lead.id,
                accountId: sender.id,
                templateId: null,
                subject,
                body,
                sendAt: null,
                followUp: null,
                attach: attach ? { kind, id: doc.id } : null,
              }),
            );
          }}
        >
          <h2 className="card__title">{heading}</h2>
          <p className="card__hint">
            To {doc.leadName}
            {lead?.email ? `, at ${lead.email}` : ""}
            {sender ? `, from ${sender.address}` : ""}.
          </p>
          <ErrorLine>{error}</ErrorLine>
          {loaded && !lead.email && (
            <p className="field__error" role="alert">
              {doc.leadName} has no email address. Add one on their page, and it can go.
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
          {sender ? (
            <label className="field checkline">
              <input type="checkbox" className="tickbox" checked={attach} disabled={busy} onChange={(event) => setAttach(event.target.checked)} />
              <span className="checkline__title">Attach the PDF</span>
            </label>
          ) : (
            loaded && <p className="card__hint">Your mail app opens without the PDF: attach it from the contact&apos;s page.</p>
          )}

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
                {busy ? "Sending" : purpose === "chase" ? "Send the reminder" : "Send"}
              </button>
            )}
          </div>
        </form>
      </div>
    </Portal>
  );
}
