import { useEffect, useMemo, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import type { EmailTemplate } from "@shared/email";
import { BATCH_MOST, FOLLOW_UP_MAX_DAYS, type MailState } from "@shared/mail";
import { render, unknownTokens } from "@shared/render";
import { useWorkspace } from "@/lib/workspace";
import { Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";

/**
 * One message, written once, to the contacts ticked in the list.
 *
 * Outreach is the same first message to thirty people with each name in its
 * place, and it used to mean opening thirty pages. This is that, and nothing
 * more: it is not a campaign tool. Each message is sent on its own through
 * the same call a contact's page makes (`mail.send`), so everything that call
 * refuses is refused here - a contact marked do not contact, one with no
 * address, a day's sends used up - and each lands on its contact's history
 * the same way.
 *
 * Three things keep it honest:
 *
 *  - **Who gets it is shown before anything goes**, with who does not and
 *    why, and the message as the first of them will read it.
 *  - **It is capped** (BATCH_MOST), and by what Gmail has left for the day
 *    when that is known. Past that it is no longer writing to people.
 *  - **It can be stopped**, and says exactly who was written to and who was
 *    not when it ends, so nothing is sent twice by trying again.
 */

type Who = { id: string; name: string; contactPerson: string | null; email: string | null; city: string | null; doNotContact: boolean };

type Outcome = { id: string; name: string; went: boolean; why: string | null };

export function SendMany({ leads, onClose, onSent }: { leads: readonly Who[]; onClose: () => void; onSent: () => void }) {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [mail, setMail] = useState<MailState | null>(null);
  const [picked, setPicked] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [from, setFrom] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [followUpDays, setFollowUpDays] = useState("4");
  const [seen, setSeen] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** While it is going: how far, and what became of each. */
  const [going, setGoing] = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const stop = useRef(false);

  useEffect(() => {
    if (!companyId) return;
    window.caulder.email
      .templates(companyId)
      .then((all) => setTemplates(all.filter((template) => template.channel !== "whatsapp")))
      .catch(() => setTemplates([]));
    window.caulder.mail.state().then(setMail, (cause: unknown) =>
      setMail({ ready: false, reason: messageOf(cause), address: null, remaining: null, senders: [] }),
    );
  }, [companyId]);

  const senders = mail?.senders ?? [];
  const sender = senders.find((each) => (each.id ?? "script") === from) ?? senders[0] ?? null;
  const seesReplies = sender?.seesReplies ?? false;

  // Who it can go to, and who it cannot, with the reason said.
  const { going: to, left } = useMemo(() => {
    const can: Who[] = [];
    const cannot: { who: Who; why: string }[] = [];
    for (const lead of leads) {
      if (lead.doNotContact) cannot.push({ who: lead, why: "marked do not contact" });
      else if (!lead.email) cannot.push({ who: lead, why: "no email address" });
      else can.push(lead);
    }
    return { going: can, left: cannot };
  }, [leads]);

  // What Gmail has left today, when the script is what sends and has said.
  const room = sender?.id == null && typeof mail?.remaining === "number" ? mail.remaining : null;
  const most = Math.min(BATCH_MOST, room ?? BATCH_MOST);
  const sending = to.slice(0, most);

  const contextOf = (lead: Who) => ({
    leadName: lead.name,
    leadContact: lead.contactPerson,
    leadCity: lead.city,
    companyName: activeCompany?.name ?? "",
  });
  const shown = sending[Math.min(seen, Math.max(0, sending.length - 1))];
  // Until it is known that Caulder can send, the heading counts who was ticked rather than who it would reach.
  const shownCount = mail?.ready ? sending.length : leads.length;
  const unknown = [...new Set([...unknownTokens(subject), ...unknownTokens(body)])];
  const days = Number(followUpDays);
  const followUpOk = followUp === "" || (Number.isInteger(days) && days >= 1 && days <= FOLLOW_UP_MAX_DAYS);
  const ready = mail?.ready === true && sending.length > 0 && subject.trim().length > 0 && body.trim().length > 0 && followUpOk && going === null;

  async function send() {
    if (!ready) return;
    stop.current = false;
    setError(null);
    const results: Outcome[] = [];
    setGoing({ done: 0, total: sending.length });
    for (const [at, lead] of sending.entries()) {
      if (stop.current) {
        results.push({ id: lead.id, name: lead.name, went: false, why: "not sent: you stopped it" });
        continue;
      }
      try {
        await window.caulder.mail.send({
          leadId: lead.id,
          accountId: sender?.id ?? null,
          templateId: picked || null,
          subject: render(subject, contextOf(lead)),
          body: render(body, contextOf(lead)),
          sendAt: null,
          followUp: followUp && seesReplies ? { days, templateId: followUp } : null,
        });
        results.push({ id: lead.id, name: lead.name, went: true, why: null });
      } catch (cause) {
        results.push({ id: lead.id, name: lead.name, went: false, why: messageOf(cause) });
      }
      setGoing({ done: at + 1, total: sending.length });
    }
    setGoing(null);
    setOutcomes(results);
    onSent();
  }

  // ---- After: who was written to, and who was not ---------------------------
  if (outcomes) {
    const went = outcomes.filter((each) => each.went);
    const failed = outcomes.filter((each) => !each.went);
    return (
      <section className="card sendmany anim-panel" aria-label="What was sent">
        <h2 className="card__title">
          {went.length === 0 ? "Nothing was sent" : `Sent to ${went.length} ${went.length === 1 ? "contact" : "contacts"}`}
        </h2>
        {went.length > 0 && <p className="card__hint">Each is on its contact&rsquo;s history, and a reply will show on Today.</p>}
        {failed.length > 0 && (
          <>
            <p className="field__error" role="alert">
              {failed.length === 1 ? "One was not sent:" : `${failed.length} were not sent:`}
            </p>
            <ul className="sendmany__who">
              {failed.map((each) => (
                <li key={each.id}>
                  <strong>{each.name}</strong> <span className="card__hint">{each.why}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="leadform__actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card sendmany anim-panel" aria-label="Write to the selected contacts">
      <div className="leadtasks__head">
        <h2 className="card__title">
          Write to {shownCount} {shownCount === 1 ? "contact" : "contacts"}
        </h2>
        {/* Not "Close": the window's own button is called that. */}
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClose} disabled={going !== null} aria-label="Close without sending">
          <X size={14} aria-hidden />
        </button>
      </div>

      <ErrorLine>{error}</ErrorLine>

      {mail && !mail.ready ? (
        <p className="card__hint" role="status">
          Needs Google or a mail account, in Settings.{" "}
          {mail.reason}
        </p>
      ) : (
        <>
          {(left.length > 0 || to.length > sending.length) && (
            <p className="card__hint" role="status">
              {left.length > 0 &&
                `${left.length} left out: ${left
                  .slice(0, 4)
                  .map(({ who, why }) => `${who.name} (${why})`)
                  .join(", ")}${left.length > 4 ? `, and ${left.length - 4} more` : ""}. `}
              {to.length > sending.length &&
                (room !== null && room < BATCH_MOST
                  ? `Gmail has ${room} ${room === 1 ? "send" : "sends"} left today, so the first ${sending.length} go now.`
                  : `One go is ${BATCH_MOST} at most, so the first ${sending.length} go now; select the rest and send again.`)}
            </p>
          )}

          <div className="leadform">
            <div className="leadform__row">
              {templates.length > 0 && (
                <div className="field">
                  <label className="field__label" htmlFor="many-template">
                    Start from a template
                  </label>
                  <Select
                    id="many-template"
                    value={picked}
                    disabled={going !== null}
                    onChange={(value) => {
                      setPicked(value);
                      const found = templates.find((template) => template.id === value);
                      if (found) {
                        setSubject(found.subject);
                        setBody(found.body);
                      }
                    }}
                    options={[{ value: "", label: "Write from scratch" }, ...templates.map((template) => ({ value: template.id, label: template.name }))]}
                  />
                </div>
              )}
              {senders.length > 1 && (
                <div className="field">
                  <label className="field__label" htmlFor="many-from">
                    From
                  </label>
                  <Select
                    id="many-from"
                    value={sender ? (sender.id ?? "script") : ""}
                    disabled={going !== null}
                    onChange={setFrom}
                    options={senders.map((each) => ({ value: each.id ?? "script", label: `${each.label} · ${each.address}` }))}
                  />
                </div>
              )}
            </div>

            <div className="field">
              <label className="field__label" htmlFor="many-subject">
                Subject
              </label>
              <input id="many-subject" className="input" value={subject} maxLength={250} disabled={going !== null} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="many-body">
                Message
              </label>
              <textarea
                id="many-body"
                className="textarea"
                rows={7}
                value={body}
                disabled={going !== null}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Hi {{lead.greeting}}, I run {{company.name}} …"
              />
              <span className="card__hint">
                {"{{lead.greeting}}"}, {"{{lead.name}}"}, {"{{lead.city}}"} and {"{{company.name}}"} are filled in for each contact.
                {unknown.length > 0 && ` Not filled in, and sent as written: ${unknown.join(", ")}.`}
              </span>
            </div>

            {seesReplies && templates.length > 0 && (
              <div className="leadform__row">
                <div className="field">
                  <label className="field__label" htmlFor="many-follow">
                    If nobody answers
                  </label>
                  <Select
                    id="many-follow"
                    value={followUp}
                    disabled={going !== null}
                    onChange={setFollowUp}
                    options={[{ value: "", label: "Leave it there" }, ...templates.map((template) => ({ value: template.id, label: `Follow up with ${template.name}` }))]}
                  />
                </div>
                {followUp !== "" && (
                  <div className="field">
                    <label className="field__label" htmlFor="many-days">
                      After how many days
                    </label>
                    <input id="many-days" className="input" inputMode="numeric" value={followUpDays} disabled={going !== null} onChange={(event) => setFollowUpDays(event.target.value)} />
                  </div>
                )}
              </div>
            )}
          </div>

          {shown && (subject.trim() || body.trim()) && (
            <div className="sendmany__preview" aria-label="How it will read">
              <div className="leadtasks__head">
                <span className="field__label">
                  As {shown.contactPerson ?? shown.name} will read it, to {shown.email}
                </span>
                {sending.length > 1 && (
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => setSeen((at) => (at + 1) % sending.length)}>
                    Show the next
                  </button>
                )}
              </div>
              <p className="sendmany__subject">{render(subject, contextOf(shown)) || "No subject yet"}</p>
              <p className="sendmany__body">{render(body, contextOf(shown))}</p>
            </div>
          )}

          <div className="leadform__actions">
            {going ? (
              <>
                <span className="card__hint" role="status">
                  Sending {going.done + 1 > going.total ? going.total : going.done + 1} of {going.total}
                </span>
                <button type="button" className="btn" onClick={() => (stop.current = true)}>
                  Stop after this one
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn--primary" disabled={!ready} onClick={() => void send()}>
                  <Send size={14} aria-hidden />
                  Send to {sending.length}
                </button>
                <button type="button" className="btn" onClick={onClose}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
