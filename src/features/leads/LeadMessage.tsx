import { useCallback, useEffect, useState } from "react";
import { AtSign, MessageCircle, MessagesSquare, type LucideIcon } from "lucide-react";
import type { EmailTemplate } from "@shared/email";
import { render } from "@shared/render";
import type { Lead } from "@shared/domain";
import { useWorkspace } from "@/lib/workspace";
import { Select } from "@/components/Select";
import { messageOf } from "@/lib/errors";

/**
 * Writing to a contact where they actually answer: WhatsApp, LinkedIn or
 * Instagram.
 *
 * One panel for the three, because they are one thing: Caulder writes the
 * message, opens the place it is sent from, and cannot see whether it went.
 * WhatsApp takes the message with it; LinkedIn and Instagram take nothing from
 * outside, so theirs is put on the clipboard to paste in.
 *
 * **Sending is confirmed, never assumed.** The window that opens is somebody
 * else's, so the panel asks afterwards and writes the history only if the
 * answer is yes. One extra click on something you were doing anyway, and the
 * going-quiet list stays true. The same standard as "ticking a task is not
 * proof the call happened".
 */

type MessageChannel = "whatsapp" | "linkedin" | "instagram";

const CHANNEL: Record<
  MessageChannel,
  { title: string; icon: LucideIcon; start: string; open: string; field: string; id: string }
> = {
  whatsapp: {
    title: "WhatsApp",
    icon: MessageCircle,
    // Not "Write one": the email panel above it says that, and two controls
    // with the same name on one screen are indistinguishable to anybody
    // reading it through their labels.
    start: "Message on WhatsApp",
    open: "Open WhatsApp",
    field: "WhatsApp message",
    id: "wa",
  },
  linkedin: {
    title: "LinkedIn",
    icon: MessagesSquare,
    start: "Message on LinkedIn",
    open: "Copy it and open LinkedIn",
    field: "LinkedIn message",
    id: "li",
  },
  instagram: {
    title: "Instagram",
    icon: AtSign,
    start: "Message on Instagram",
    open: "Copy it and open Instagram",
    field: "Instagram message",
    id: "ig",
  },
};

/** Why this contact cannot be written to here, or null when it can. */
function blockedOn(channel: MessageChannel, lead: Lead): string | null {
  if (lead.doNotContact) return "Marked do not contact.";
  if (channel === "whatsapp") return lead.phone ? null : "No phone number on this contact.";
  return lead[channel] ? null : `No ${CHANNEL[channel].title} profile on this contact.`;
}

export function LeadMessage({
  channel,
  lead,
  onTimelineChanged,
}: {
  channel: MessageChannel;
  lead: Lead;
  onTimelineChanged: () => void;
}) {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;
  const words = CHANNEL[channel];
  const Icon = words.icon;

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState("");
  /** Which template the message started from, shown back in the picker. */
  const [picked, setPicked] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!companyId) return;
    window.caulder.email
      .templates(companyId)
      // A message template: short, and with no subject line. One set serves
      // all three places a message is written.
      .then((all) => setTemplates(all.filter((template) => template.channel === "whatsapp")))
      .catch(() => setTemplates([]));
  }, [companyId]);

  useEffect(load, [load]);

  const context = {
    leadName: lead.name,
    leadContact: lead.contactPerson,
    leadCity: lead.city,
    companyName: activeCompany?.name ?? "",
  };

  // Stated rather than hidden: a button that silently does nothing is worse
  // than one that says why it cannot.
  const blocked = blockedOn(channel, lead);

  async function open() {
    setError(null);
    try {
      const said = render(message, context);
      if (channel === "whatsapp") await window.caulder.outreach.whatsapp(lead.id, said);
      else await window.caulder.outreach.profile(lead.id, channel, said);
      // Only now is it worth asking: nothing has been claimed yet.
      setAsking(true);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function confirm(sent: boolean) {
    setAsking(false);
    setComposing(false);
    if (!sent) return;

    // What went, not the template it came from: the history is read later by
    // somebody who wants to know what the contact was actually told.
    const said = render(message, context).trim();
    try {
      await window.caulder.activities.log({
        leadId: lead.id,
        kind: channel,
        body: said.length > 0 ? said : null,
      });
      setMessage("");
      onTimelineChanged();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  return (
    <div className="whatsapp" data-channel={channel}>
      <div className="leadtasks__head">
        <h2 className="card__title">{words.title}</h2>
        {!composing && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              setPicked("");
              setComposing(true);
            }}
            disabled={blocked !== null}
            title={blocked ?? undefined}
          >
            <Icon size={14} aria-hidden />
            {words.start}
          </button>
        )}
      </div>

      {blocked && <p className="card__hint">{blocked}</p>}

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      {composing && (
        <div className="leadform anim-panel">
          {templates.length > 0 && (
            <div className="field">
              <label className="field__label" htmlFor={`${words.id}-template`}>
                Start from a template
              </label>
              <Select
                id={`${words.id}-template`}
                value={picked}
                onChange={(value) => {
                  setPicked(value);
                  const found = templates.find((template) => template.id === value);
                  if (found) setMessage(found.body);
                }}
                options={[
                  { value: "", label: "Write from scratch" },
                  ...templates.map((template) => ({ value: template.id, label: template.name })),
                ]}
              />
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor={`${words.id}-body`}>
              {words.field}
            </label>
            <textarea
              id={`${words.id}-body`}
              className="textarea"
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Hi {{lead.greeting}}, I run {{company.name}} …"
            />
          </div>

          {asking ? (
            <div className="leadform__actions">
              <p className="card__hint">
                {channel === "whatsapp"
                  ? "Did it go?"
                  : `Message copied. Paste it into ${words.title}, then say if it went.`}
              </p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void confirm(true)}
              >
                Sent it
              </button>
              <button type="button" className="btn" onClick={() => void confirm(false)}>
                Not now
              </button>
            </div>
          ) : (
            <div className="leadform__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void open()}
                disabled={message.trim().length === 0}
              >
                {words.open}
              </button>
              <button type="button" className="btn" onClick={() => setComposing(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
