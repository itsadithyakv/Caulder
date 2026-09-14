import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import type { EmailTemplate } from "@shared/email";
import { render } from "@shared/render";
import type { Lead } from "@shared/domain";
import { useWorkspace } from "@/lib/workspace";
import { Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";

/**
 * Writing to one contact, in your own mail app.
 *
 * Caulder does not send. It fills a template in, opens the message in
 * whatever handles mail on this machine, and then asks one question: did it
 * go? Yes writes the history entry and moves last-contacted, the same way a
 * logged call does. The CSV bridge to Apps Script that used to sit here was
 * the reason to leave for a spreadsheet; see PLAN.md, phase 2.
 */
export function LeadEmail({
  lead,
  onTimelineChanged,
}: {
  lead: Lead;
  onTimelineChanged: () => void;
}) {
  const { activeCompany } = useWorkspace();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  /** Which template the compose box started from, shown back in the picker. */
  const [picked, setPicked] = useState("");
  const [error, setError] = useState<string | null>(null);

  const companyId = activeCompany?.id ?? null;

  const load = useCallback(() => {
    if (!companyId) return;
    window.caulder.email
      .templates(companyId)
      // A WhatsApp template has no subject line, so offering one here would
      // put an empty subject into a real email.
      .then((all) => setTemplates(all.filter((template) => template.channel !== "whatsapp")))
      .catch(() => setTemplates([]));
  }, [companyId]);

  useEffect(load, [load]);

  const context = {
    leadName: lead.name,
    leadContact: lead.contactPerson,
    leadCity: lead.city,
    companyName: activeCompany?.name ?? "",
  };

  function applyTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    // Filled in here, so what is approved is exactly what is opened.
    setSubject(render(template.subject, context));
    setBody(render(template.body, context));
  }

  // Stated rather than hidden: a button that silently does nothing is worse
  // than one that says why it cannot.
  const blocked = lead.doNotContact
    ? "Marked do not contact."
    : lead.email
      ? null
      : "No email address on this contact.";

  async function open() {
    setError(null);
    setBusy(true);
    try {
      await window.caulder.outreach.email(lead.id, subject, body);
      // Only now is it worth asking: nothing has been claimed yet.
      setAsking(true);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(sent: boolean) {
    setAsking(false);
    if (!sent) return;
    setBusy(true);
    try {
      await window.caulder.outreach.emailSent(lead.id, subject, body);
      setComposing(false);
      setSubject("");
      setBody("");
      setPicked("");
      onTimelineChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="leadtasks">
      <div className="leadtasks__head">
        <h2 className="card__title">Email</h2>
        {!composing && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              setPicked("");
              setComposing(true);
            }}
            disabled={busy || blocked !== null}
            title={blocked ?? undefined}
          >
            <Send size={14} aria-hidden />
            Write one
          </button>
        )}
      </div>

      {blocked && <p className="card__hint">{blocked}</p>}

      <ErrorLine>{error}</ErrorLine>

      {composing && (
        <div className="leadform anim-panel">
          {templates.length > 0 && (
            <div className="field">
              <label className="field__label" htmlFor="lead-email-template">
                Start from a template
              </label>
              <Select
                id="lead-email-template"
                value={picked}
                onChange={(value) => {
                  setPicked(value);
                  applyTemplate(value);
                }}
                disabled={busy}
                options={[
                  { value: "", label: "Write from scratch" },
                  ...templates.map((template) => ({ value: template.id, label: template.name })),
                ]}
              />
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="lead-email-subject">
              Subject
            </label>
            <input
              id="lead-email-subject"
              className="input"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              autoComplete="off"
              disabled={busy || asking}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="lead-email-body">
              Message
            </label>
            <textarea
              id="lead-email-body"
              className="textarea tpl__body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={busy || asking}
            />
          </div>

          {asking ? (
            <div className="leadform__actions">
              <p className="card__hint">
                Caulder cannot see whether that went. Say so and it goes on the
                history, and counts as having been in touch.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void confirm(true)}
                disabled={busy}
              >
                Sent it
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void confirm(false)}
                disabled={busy}
              >
                Not now
              </button>
            </div>
          ) : (
            <div className="leadform__actions">
              <button
                type="button"
                className="btn"
                onClick={() => setComposing(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void open()}
                disabled={busy || subject.trim().length === 0}
              >
                Open in your mail app
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
