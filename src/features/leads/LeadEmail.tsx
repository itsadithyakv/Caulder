import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import {
  EMAIL_STATUS_LABEL,
  queueInput,
  type EmailMessage,
  type EmailTemplate,
  type Sequence,
} from "@shared/email";
import { render } from "@shared/render";
import { today as todayIn } from "@shared/dates";
import type { Lead } from "@shared/domain";
import { useWorkspace } from "@/lib/workspace";
import { relativeDay } from "@/lib/format";

/**
 * Writing to one lead, and what happened to what was already written.
 *
 * Nothing is sent from here. A message is queued; the bridge takes it from
 * there, and every status that comes back lands on the timeline below.
 */
export function LeadEmail({
  lead,
  onTimelineChanged,
}: {
  lead: Lead;
  onTimelineChanged: () => void;
}) {
  const { activeCompany } = useWorkspace();
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companyId = activeCompany?.id ?? null;

  const load = useCallback(() => {
    if (!companyId) return;
    Promise.all([
      window.caulder.email.forLead(lead.id),
      window.caulder.email.templates(companyId),
      window.caulder.email.sequences(companyId),
    ])
      .then(([m, t, s]) => {
        setMessages(m);
        setTemplates(t);
        setSequences(s.filter((sequence) => sequence.steps.length > 0));
      })
      .catch(() => setMessages([]));
  }, [companyId, lead.id]);

  useEffect(load, [load]);

  const context = {
    leadName: lead.name,
    leadContact: lead.contactPerson,
    leadCity: lead.city,
    companyName: activeCompany?.name ?? "",
  };

  function useTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    // Filled in here, so what is approved is exactly what is queued.
    setSubject(render(template.subject, context));
    setBody(render(template.body, context));
  }

  async function queue() {
    if (!companyId || !lead.email) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = queueInput.safeParse({
        leadId: lead.id,
        toEmail: lead.email,
        subject,
        body,
        scheduledFor: todayIn(activeCompany?.timezone ?? "UTC"),
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Check the message.");
        return;
      }
      await window.caulder.email.queue(companyId, parsed.data);
      setComposing(false);
      setSubject("");
      setBody("");
      load();
      onTimelineChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function enroll(sequenceId: string) {
    setBusy(true);
    setError(null);
    try {
      await window.caulder.email.enroll(sequenceId, lead.id);
      load();
      onTimelineChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!lead.email) {
    return (
      <div className="leadtasks">
        <h2 className="card__title">Email</h2>
        <p className="card__hint">
          This lead has no email address, so there is nothing to write to. Add one
          and it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="leadtasks">
      <div className="leadtasks__head">
        <h2 className="card__title">Email</h2>
        {!composing && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setComposing(true)}
            disabled={busy}
          >
            <Send size={14} aria-hidden />
            Write one
          </button>
        )}
      </div>

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      {composing && (
        <div className="leadform anim-panel">
          {templates.length > 0 && (
            <div className="field">
              <label className="field__label" htmlFor="lead-email-template">
                Start from a template
              </label>
              <select
                id="lead-email-template"
                className="select"
                defaultValue=""
                onChange={(event) => useTemplate(event.target.value)}
                disabled={busy}
              >
                <option value="">Write from scratch</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
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
              disabled={busy}
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
              disabled={busy}
            />
          </div>

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
              onClick={() => void queue()}
              disabled={busy}
            >
              Queue it
            </button>
          </div>
          <p className="card__hint">
            Queued, not sent. It goes out with the next export.
          </p>
        </div>
      )}

      {!composing && sequences.length > 0 && (
        <div className="stageadd">
          <span className="card__hint">Put into a sequence:</span>
          {sequences.map((sequence) => (
            <button
              key={sequence.id}
              type="button"
              className="btn btn--sm"
              disabled={busy}
              onClick={() => void enroll(sequence.id)}
            >
              {sequence.name}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <ul className="messages">
          {messages.map((message) => (
            <li key={message.id} className="messagerow">
              <div className="messagerow__body">
                <span className="messagerow__subject">{message.subject}</span>
                {message.failure && (
                  <span className="messagerow__failure">{message.failure}</span>
                )}
              </div>
              <div className="messagerow__side">
                <span className="badge badge--neutral">
                  {EMAIL_STATUS_LABEL[message.status]}
                </span>
                <span className="messagerow__when">
                  {message.sentAt
                    ? relativeDay(message.sentAt)
                    : `Due ${message.scheduledFor}`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
