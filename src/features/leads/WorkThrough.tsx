import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import type { EmailTemplate } from "@shared/email";
import type { LeadListRow } from "@shared/domain";
import { render } from "@shared/render";
import { WALK_CHANNELS, WALK_LABEL, queueFor, type WalkChannel } from "@shared/reached";
import { useWorkspace } from "@/lib/workspace";
import { Chips, Select } from "@/components/Select";
import { messageOf } from "@/lib/errors";

/**
 * One message to everybody ticked, where Caulder cannot send it: WhatsApp,
 * LinkedIn, Instagram (PLAN.md, part eight, phase 33).
 *
 * *Write to them* sends an email to each. These three take nothing from
 * outside, so this walks the list instead, one contact at a time: their own
 * copy of the message - on the clipboard for LinkedIn and Instagram, carried
 * into WhatsApp - their profile opened, and two answers, *Sent it* or *Skip*.
 * Twenty messages are then twenty pastes and twenty clicks, with nobody
 * looked up and nothing retyped.
 *
 * **Sending is said, never assumed**, exactly as on a contact's own page
 * (`LeadMessage.tsx`): the window that opens is somebody else's, so each one
 * goes on the history only when the person says it went. A walk can be
 * stopped at any contact; what was sent stays sent.
 */

type Outcome = { id: string; name: string; sent: boolean };

export function WorkThrough({
  leads,
  onClose,
  onChanged,
}: {
  /** Everybody ticked, in the order the list shows them. */
  leads: readonly LeadListRow[];
  onClose: () => void;
  /** Something went on a history: the list behind is read again. */
  onChanged: () => void;
}) {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const [channel, setChannel] = useState<WalkChannel>("whatsapp");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [picked, setPicked] = useState("");
  const [message, setMessage] = useState("");
  /** Null until it starts; then where in the queue it is. */
  const [at, setAt] = useState<number | null>(null);
  /** Their window was opened, so the question is whether it went. */
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    // A message template: short, and with no subject line. One set serves all three places.
    window.caulder.email
      .templates(companyId)
      .then((all) => setTemplates(all.filter((template) => template.channel === "whatsapp")))
      .catch(() => setTemplates([]));
  }, [companyId]);

  const { queue, leftOut } = useMemo(() => queueFor(channel, leads), [channel, leads]);
  const place = WALK_LABEL[channel];
  const said = (lead: LeadListRow) =>
    render(message, {
      leadName: lead.name,
      leadContact: lead.contactPerson,
      leadCity: lead.city,
      companyName: activeCompany?.name ?? "",
    }).trim();

  const current = at !== null ? queue[at] : undefined;
  const done = at !== null && at >= queue.length;

  function next(outcome: Outcome) {
    setOutcomes((all) => [...all, outcome]);
    setOpened(false);
    setError(null);
    setAt((index) => (index ?? 0) + 1);
  }

  async function open(lead: LeadListRow) {
    setError(null);
    setBusy(true);
    try {
      if (channel === "whatsapp") await window.caulder.outreach.whatsapp(lead.id, said(lead));
      else await window.caulder.outreach.profile(lead.id, channel, said(lead));
      setOpened(true);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function sent(lead: LeadListRow) {
    setBusy(true);
    try {
      // What went, with their name in it - not the template it came from.
      await window.caulder.activities.log({ leadId: lead.id, kind: channel, body: said(lead) || null });
      onChanged();
      next({ id: lead.id, name: lead.name, sent: true });
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  // ---- After: who was written to, and who was not ---------------------------
  if (done || (at !== null && !current)) {
    const went = outcomes.filter((each) => each.sent);
    const skipped = outcomes.filter((each) => !each.sent);
    return (
      <section className="card sendmany anim-panel" aria-label="What was sent">
        <h2 className="card__title">
          {went.length === 0 ? "Nobody was written to" : `Written to ${went.length} on ${place}`}
        </h2>
        <p className="card__hint">
          {went.length > 0 && "Each is on their history. "}
          {skipped.length > 0 && `Skipped: ${skipped.map((each) => each.name).join(", ")}.`}
        </p>
        <div className="leadform__actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    );
  }

  // ---- During: one contact at a time ----------------------------------------
  if (at !== null && current) {
    const who = current.contactPerson ? `${current.contactPerson}, ${current.name}` : current.name;
    return (
      <section className="card sendmany anim-panel" aria-label="Working through them">
        <div className="leadtasks__head">
          <h2 className="card__title">{who}</h2>
          <span className="section-head__count" role="status">
            {at + 1} of {queue.length}
          </span>
        </div>

        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}

        <div className="sendmany__preview" aria-label="What they will read">
          <p className="sendmany__body">{said(current)}</p>
        </div>

        {opened ? (
          <>
            <p className="card__hint">
              {channel === "whatsapp"
                ? "WhatsApp is open with the message. Did it go?"
                : `Message copied and their ${place} is open. Did it go?`}
            </p>
            <div className="leadform__actions">
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void sent(current)}>
                <Check size={14} aria-hidden />
                Sent it
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => next({ id: current.id, name: current.name, sent: false })}>
                Skip
              </button>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setAt(queue.length)}>
                Stop here
              </button>
            </div>
          </>
        ) : (
          <div className="leadform__actions">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void open(current)}>
              {channel === "whatsapp" ? "Open WhatsApp" : `Copy it and open ${place}`}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => next({ id: current.id, name: current.name, sent: false })}>
              Skip
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setAt(queue.length)}>
              Stop here
            </button>
          </div>
        )}
      </section>
    );
  }

  // ---- Before: where, and what to say ---------------------------------------
  const first = queue[0];
  return (
    <section className="card sendmany anim-panel" aria-label="Work through them">
      <h2 className="card__title">Work through {leads.length === 1 ? "one contact" : `${leads.length} contacts`}</h2>
      <p className="card__hint">
        One at a time. You send each yourself.
      </p>

      <div className="leadform">
        <div className="field">
          <span className="field__label">Where</span>
          <Chips
            value={channel}
            options={WALK_CHANNELS.map((value) => ({ value, label: WALK_LABEL[value] }))}
            onChange={setChannel}
            aria-label="Where to write to them"
          />
          <span className="card__hint">
            {queue.length === 0
              ? `None of them can be written to on ${place}.`
              : `${queue.length} of ${leads.length} can be written to on ${place}.`}
            {leftOut.length > 0 && ` Left out: ${leftOut.map(({ lead, why }) => `${lead.name} (${why})`).join(", ")}.`}
          </span>
        </div>

        {templates.length > 0 && (
          <div className="field">
            <label className="field__label" htmlFor="walk-template">
              Start from a template
            </label>
            <Select
              id="walk-template"
              value={picked}
              onChange={(value) => {
                setPicked(value);
                const found = templates.find((template) => template.id === value);
                if (found) setMessage(found.body);
              }}
              options={[{ value: "", label: "Write from scratch" }, ...templates.map((template) => ({ value: template.id, label: template.name }))]}
            />
          </div>
        )}

        <div className="field">
          <label className="field__label" htmlFor="walk-body">
            Message
          </label>
          <textarea
            id="walk-body"
            className="textarea"
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Hi {{lead.greeting}}, I run {{company.name}} …"
          />
          <span className="card__hint">
            {"{{lead.greeting}}"}, {"{{lead.name}}"}, {"{{lead.city}}"} and {"{{company.name}}"} are filled in for each contact.
          </span>
        </div>
      </div>

      {first && message.trim() && (
        <div className="sendmany__preview" aria-label="How it will read">
          <span className="field__label">As {first.contactPerson ?? first.name} will read it</span>
          <p className="sendmany__body">{said(first)}</p>
        </div>
      )}

      <div className="leadform__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={queue.length === 0 || message.trim().length === 0}
          onClick={() => {
            setOutcomes([]);
            setAt(0);
          }}
        >
          <ArrowRight size={14} aria-hidden />
          Start with {first ? (first.contactPerson ?? first.name) : "them"}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </section>
  );
}
