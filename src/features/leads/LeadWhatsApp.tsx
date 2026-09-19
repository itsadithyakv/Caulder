import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import type { EmailTemplate } from "@shared/email";
import { render } from "@shared/render";
import type { Lead } from "@shared/domain";
import { useWorkspace } from "@/lib/workspace";
import { Select } from "@/components/Select";
import { messageOf } from "@/lib/errors";

/**
 * Reaching a school the way a school actually answers.
 *
 * Selling to principals in India, WhatsApp gets read and email does not. This
 * opens it on the lead's own number with the message already written.
 *
 * **Sending is confirmed, never assumed.** Caulder cannot know whether the
 * message went — the window that opens is somebody else's — so it asks
 * afterwards and writes the timeline entry only if the answer is yes. One
 * extra click on something you were doing anyway, and the going-quiet list
 * stays true. The same standard as "ticking a task is not proof the call
 * happened".
 */
export function LeadWhatsApp({
  lead,
  onTimelineChanged,
}: {
  lead: Lead;
  onTimelineChanged: () => void;
}) {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

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
  const blocked = lead.doNotContact
    ? "Marked do not contact."
    : lead.phone
      ? null
      : "No phone number on this contact.";

  async function open() {
    setError(null);
    try {
      await window.caulder.outreach.whatsapp(lead.id, render(message, context));
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
        kind: "whatsapp",
        body: said.length > 0 ? said : null,
      });
      setMessage("");
      onTimelineChanged();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  return (
    <div className="whatsapp">
      <div className="leadtasks__head">
        <h2 className="card__title">WhatsApp</h2>
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
            <MessageCircle size={14} aria-hidden />
            {/* Not "Write one": the email panel above it says that, and two
                controls with the same name on one screen are indistinguishable
                to anybody reading it through their labels. */}
            Message on WhatsApp
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
              <label className="field__label" htmlFor="wa-template">
                Start from a template
              </label>
              <Select
                id="wa-template"
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
            <label className="field__label" htmlFor="wa-body">
              WhatsApp message
            </label>
            <textarea
              id="wa-body"
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
                Caulder cannot see whether that went. Say so and it goes on the
                history, and counts as having been in touch.
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
                Open WhatsApp
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
