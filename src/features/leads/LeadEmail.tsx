import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import type { EmailTemplate } from "@shared/email";
import { FOLLOW_UP_MAX_DAYS, type EmailRecord, type MailState } from "@shared/mail";
import { render } from "@shared/render";
import type { Lead } from "@shared/domain";
import { useWorkspace } from "@/lib/workspace";
import { Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { formatDate, formatDateTime, relativeDay } from "@/lib/format";

/**
 * Writing to one contact.
 *
 * With the Google script connected, Caulder sends: now or at a time you pick,
 * through your own Gmail, with one follow-up that goes by itself if nobody
 * answers and is dropped the moment they do. Every message is listed under
 * the composer with what became of it.
 *
 * Without the script, it opens the message in your own mail app and asks
 * afterwards whether it went. See PLAN.md, phases 2 and 5.
 */

/** Tomorrow at nine, local, in the shape a datetime-local field wants. */
function tomorrowMorning(): string {
  const at = new Date();
  at.setDate(at.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T09:00`;
}

export function LeadEmail({
  lead,
  onTimelineChanged,
}: {
  lead: Lead;
  onTimelineChanged: () => void;
}) {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [mail, setMail] = useState<MailState | null>(null);
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  /** Which template the compose box started from, shown back in the picker. */
  const [picked, setPicked] = useState("");
  const [later, setLater] = useState(false);
  const [sendAt, setSendAt] = useState(tomorrowMorning);
  const [followUp, setFollowUp] = useState(false);
  const [followUpTemplate, setFollowUpTemplate] = useState("");
  const [followUpDays, setFollowUpDays] = useState("4");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!companyId) return;
    window.caulder.email
      .templates(companyId)
      // A WhatsApp template has no subject line, so offering one here would
      // put an empty subject into a real email.
      .then((all) => setTemplates(all.filter((template) => template.channel !== "whatsapp")))
      .catch(() => setTemplates([]));
    window.caulder.mail
      .state()
      .then(setMail)
      .catch((cause: unknown) =>
        setMail({ ready: false, reason: messageOf(cause), address: null, remaining: null }),
      );
    window.caulder.mail
      .forLead(lead.id)
      .then(setEmails)
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, [companyId, lead.id]);

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
    // Filled in here, so what is approved is exactly what goes.
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

  const ready = mail?.ready === true;

  function reset() {
    setComposing(false);
    setSubject("");
    setBody("");
    setPicked("");
    setLater(false);
    setSendAt(tomorrowMorning());
    setFollowUp(false);
    setFollowUpTemplate("");
    setFollowUpDays("4");
  }

  async function act(work: () => Promise<EmailRecord[]>) {
    setError(null);
    setBusy(true);
    try {
      setEmails(await work());
      onTimelineChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    let when: string | null = null;
    if (later) {
      const at = new Date(sendAt);
      if (Number.isNaN(at.getTime())) {
        setError("Pick a day and a time to send it.");
        return;
      }
      when = at.toISOString();
    }
    await act(async () => {
      const next = await window.caulder.mail.send({
        leadId: lead.id,
        subject: render(subject, context),
        body: render(body, context),
        sendAt: when,
        followUp: followUp ? { days: Number(followUpDays), templateId: followUpTemplate } : null,
      });
      reset();
      return next;
    });
  }

  /** The fallback: the machine's own mail app, then one question. */
  async function open() {
    setError(null);
    setBusy(true);
    try {
      await window.caulder.outreach.email(lead.id, render(subject, context), render(body, context));
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
      await window.caulder.outreach.emailSent(lead.id, render(subject, context), render(body, context));
      reset();
      onTimelineChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const canSend =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    (!later || sendAt.length > 0) &&
    (!followUp || followUpTemplate.length > 0);

  return (
    <div className="leadtasks">
      <div className="leadtasks__head">
        <h2 className="card__title">Email</h2>
        <div className="mailhead">
          {ready && emails.length > 0 && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => void act(() => window.caulder.mail.check(lead.id))}
              disabled={busy}
            >
              <RefreshCw size={14} aria-hidden />
              Check for replies
            </button>
          )}
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
      </div>

      {blocked ? (
        <p className="card__hint">{blocked}</p>
      ) : mail && !mail.ready ? (
        <p className="card__hint">
          {mail.reason} Until then, Write one opens your own mail app.
        </p>
      ) : ready && emails.length === 0 && !composing ? (
        <p className="card__hint">
          Sends from {mail?.address ?? "your Gmail"}
          {mail?.remaining != null ? `, ${mail.remaining} more today` : ""}. Replies show up
          here and on Today.
        </p>
      ) : null}

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

          {ready && (
            <>
              <div className="field">
                <span className="field__label" id="lead-email-when">
                  When
                </span>
                <div className="mailwhen">
                  <div className="tabs" role="group" aria-labelledby="lead-email-when">
                    <button
                      type="button"
                      className="tab"
                      aria-pressed={!later}
                      onClick={() => setLater(false)}
                      disabled={busy}
                    >
                      Now
                    </button>
                    <button
                      type="button"
                      className="tab"
                      aria-pressed={later}
                      onClick={() => setLater(true)}
                      disabled={busy}
                    >
                      Later
                    </button>
                  </div>
                  {later && (
                    <input
                      id="lead-email-send-at"
                      type="datetime-local"
                      className="input mailwhen__at"
                      value={sendAt}
                      onChange={(event) => setSendAt(event.target.value)}
                      aria-label="Send at"
                      disabled={busy}
                    />
                  )}
                </div>
              </div>

              <label className="checkline">
                <input
                  type="checkbox"
                  className="tickbox"
                  checked={followUp}
                  disabled={busy || templates.length === 0}
                  aria-label="Follow up if they do not reply"
                  onChange={(event) => {
                    setFollowUp(event.target.checked);
                    if (event.target.checked && !followUpTemplate) {
                      setFollowUpTemplate(templates[0]?.id ?? "");
                    }
                  }}
                />
                <span className="checkline__text">
                  <span className="checkline__title">Follow up if they do not reply</span>
                  <span className="card__hint">
                    {templates.length === 0
                      ? "Write a template in Settings first: the follow-up is sent from one."
                      : "Sent in the same thread, and dropped the moment they answer."}
                  </span>
                </span>
              </label>

              {followUp && (
                <div className="leadform__row">
                  <div className="field">
                    <label className="field__label" htmlFor="lead-email-follow-days">
                      After how many days, up to {FOLLOW_UP_MAX_DAYS}
                    </label>
                    <input
                      id="lead-email-follow-days"
                      className="input"
                      inputMode="numeric"
                      value={followUpDays}
                      onChange={(event) => setFollowUpDays(event.target.value)}
                      disabled={busy}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="lead-email-follow-template">
                      Using
                    </label>
                    <Select
                      id="lead-email-follow-template"
                      value={followUpTemplate}
                      onChange={setFollowUpTemplate}
                      disabled={busy}
                      options={templates.map((template) => ({
                        value: template.id,
                        label: template.name,
                      }))}
                    />
                  </div>
                </div>
              )}
            </>
          )}

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
              {ready && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void open()}
                  disabled={busy || subject.trim().length === 0}
                >
                  Open in my mail app instead
                </button>
              )}
              <button type="button" className="btn" onClick={reset} disabled={busy}>
                Cancel
              </button>
              {ready ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void send()}
                  disabled={busy || !canSend}
                >
                  <Send size={14} aria-hidden />
                  {busy ? "Sending" : later ? "Schedule" : "Send"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void open()}
                  disabled={busy || subject.trim().length === 0}
                >
                  Open in your mail app
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {emails.length > 0 && (
        <ul className="maillist" aria-label="Emails to this contact">
          {emails.map((email) => (
            <EmailRow
              key={email.id}
              email={email}
              busy={busy}
              onCancel={() => void act(() => window.caulder.mail.cancel(email.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const BADGE: Record<EmailRecord["status"], { tone: string; label: string }> = {
  scheduled: { tone: "info", label: "Scheduled" },
  sent: { tone: "neutral", label: "Sent" },
  replied: { tone: "ok", label: "Replied" },
  failed: { tone: "danger", label: "Did not go" },
  cancelled: { tone: "neutral", label: "Cancelled" },
};

function EmailRow({
  email,
  busy,
  onCancel,
}: {
  email: EmailRecord;
  busy: boolean;
  onCancel: () => void;
}) {
  const badge = BADGE[email.status];
  const waiting = email.status === "scheduled" || email.followUp?.status === "waiting";

  return (
    <li className="mailrow">
      <div className="mailrow__main">
        <span className="mailrow__subject">{email.subject}</span>
        <span className="mailrow__meta">{whenLine(email)}</span>
        {email.followUp && <span className="mailrow__meta">{followUpLine(email)}</span>}
      </div>
      <span className={`badge badge--${badge.tone}`}>{badge.label}</span>
      {waiting && (
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={onCancel}
          disabled={busy}
        >
          {email.status === "scheduled" ? "Cancel" : "Cancel follow-up"}
        </button>
      )}
    </li>
  );
}

/** "today", "3 days ago", or "on 14 Aug 2026" once a date reads better. */
function ago(iso: string): string {
  const said = relativeDay(iso);
  return /^(Today|Yesterday|\d+ days ago)$/.test(said) ? said.toLowerCase() : `on ${said}`;
}

function whenLine(email: EmailRecord): string {
  switch (email.status) {
    case "scheduled":
      return email.sendAt ? `Goes ${formatDateTime(email.sendAt)}.` : "Goes soon.";
    case "sent":
      return email.sentAt ? `Sent ${ago(email.sentAt)}. No reply yet.` : "Sent. No reply yet.";
    case "replied":
      return email.repliedAt ? `They replied ${ago(email.repliedAt)}.` : "They replied.";
    case "failed":
      return email.error ?? "It did not go.";
    case "cancelled":
      return "Cancelled before it went.";
  }
}

function followUpLine(email: EmailRecord): string {
  const follow = email.followUp;
  if (!follow) return "";
  switch (follow.status) {
    case "waiting": {
      if (!email.sentAt) {
        return `Follow-up ${follow.days} ${follow.days === 1 ? "day" : "days"} after it goes, if there is no reply.`;
      }
      const due = new Date(Date.parse(email.sentAt) + follow.days * 24 * 60 * 60 * 1000);
      return `Follow-up on ${formatDate(due.toISOString())} if there is no reply.`;
    }
    case "sent":
      return follow.sentAt ? `Follow-up sent ${ago(follow.sentAt)}.` : "Follow-up sent.";
    case "skipped":
      return "No follow-up needed: they replied.";
    case "cancelled":
      return "Follow-up cancelled.";
    case "failed":
      return `The follow-up did not go: ${follow.error ?? "no reason was given"}`;
  }
}
