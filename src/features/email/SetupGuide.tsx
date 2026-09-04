import { useState } from "react";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { aiPromptFree } from "./setupSteps";
import type { MailProvider } from "@shared/email";

/**
 * How to make the sending half work, in the app rather than in a README.
 *
 * The bridge is the one part of Caulder that cannot be explained by using it:
 * half of it runs in Google's cloud, and until that half exists the Email
 * screen looks broken rather than unfinished. So this is a numbered path with
 * every value to paste sitting next to the step that needs it.
 *
 * It says plainly what Caulder does and does not do. Caulder queues and
 * tracks. It has no SMTP, no OAuth and makes no network calls of any kind —
 * which is why setting this up is work you do once somewhere else, and why
 * nothing here can do it for you.
 */

const PROVIDERS: { id: MailProvider; label: string; blurb: string }[] = [
  {
    id: "gmail",
    label: "Gmail",
    blurb:
      "Sends as the Google account running the script. Nothing else to set up, and reply and bounce detection work out of the box.",
  },
  {
    id: "zoho",
    label: "Zoho Mail",
    blurb:
      "Sends through Zoho's API. Needs an OAuth token in Script Properties. Sent status arrives; replies and bounces are read from Gmail threads, so they do not.",
  },
  {
    id: "smtp",
    label: "Something else",
    blurb:
      "Postmark, SendGrid, Brevo, Mailgun — anything with an HTTP send API. Same shape as Zoho: a URL, a key, and two field names.",
  },
];

export function SetupGuide({
  provider,
  onProvider,
  onSaveScript,
  savedTo,
}: {
  provider: MailProvider;
  onProvider: (next: MailProvider) => void;
  onSaveScript: () => void;
  savedTo: string | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(what: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard refused. The value is on screen to select by hand.
    }
  }

  const chosen = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0]!;

  return (
    <section className="card guide">
      <h2 className="card__title">Setting up sending</h2>
      <p className="card__hint">
        <strong>Caulder never sends anything.</strong> It has no SMTP, no sign-in to
        your mail account, and makes no network calls at all. It writes a file of
        what to send; a script in your Google account sends it and writes back what
        happened. That is why this is set up once, over there.
      </p>

      <ol className="guide__steps">
        <li className="guide__step">
          <span className="guide__num">1</span>
          <div className="guide__body">
            <h3 className="guide__title">Choose what actually sends</h3>
            <div className="tabs" role="tablist" aria-label="Mail provider">
              {PROVIDERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  className="tab"
                  aria-selected={provider === option.id}
                  onClick={() => onProvider(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="card__hint">{chosen.blurb}</p>
          </div>
        </li>

        <li className="guide__step">
          <span className="guide__num">2</span>
          <div className="guide__body">
            <h3 className="guide__title">Make a Google Sheet with three tabs</h3>
            <p className="card__hint">
              Named exactly <code>Outbox</code>, <code>Log</code> and <code>Sent</code>.
              Outbox is what you paste into, Log is what you bring back, and Sent is
              how the script remembers what it has already done so an outbox pasted
              in twice does not send twice.
            </p>
            <div className="guide__actions">
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => void copy("tabs", "Outbox\nLog\nSent")}
              >
                {copied === "tabs" ? <Check size={14} /> : <Copy size={14} />}
                {copied === "tabs" ? "Copied" : "Copy the tab names"}
              </button>
              <a
                className="btn btn--sm"
                href="https://sheets.new"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} aria-hidden />
                New sheet
              </a>
            </div>
          </div>
        </li>

        <li className="guide__step">
          <span className="guide__num">3</span>
          <div className="guide__body">
            <h3 className="guide__title">Paste the script in</h3>
            <p className="card__hint">
              In that sheet: <strong>Extensions → Apps Script</strong>, delete what is
              there, and paste the file below. Then set <code>SENDER</code> to the
              address you send from, and <code>PROVIDER</code> to{" "}
              <code>&quot;{provider}&quot;</code>.
            </p>
            <div className="guide__actions">
              <button type="button" className="btn btn--sm btn--primary" onClick={onSaveScript}>
                <Download size={14} aria-hidden />
                Save Caulder.gs
              </button>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => void copy("provider", `var PROVIDER = "${provider}";`)}
              >
                {copied === "provider" ? <Check size={14} /> : <Copy size={14} />}
                {copied === "provider" ? "Copied" : "Copy the PROVIDER line"}
              </button>
            </div>
            {savedTo && <p className="card__hint">Saved to {savedTo}</p>}
          </div>
        </li>

        {provider !== "gmail" && (
          <li className="guide__step">
            <span className="guide__num">4</span>
            <div className="guide__body">
              <h3 className="guide__title">Put the credentials in Script Properties</h3>
              <p className="card__hint">
                <strong>Project Settings → Script Properties</strong>, not in the file.
                A key typed into the script is a key shared with everyone the sheet is
                shared with.
              </p>
              <ul className="guide__keys">
                {(provider === "zoho"
                  ? ["ZOHO_TOKEN", "ZOHO_ACCOUNT_ID"]
                  : ["RELAY_URL", "RELAY_KEY"]
                ).map((key) => (
                  <li key={key}>
                    <code>{key}</code>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        )}

        <li className="guide__step">
          <span className="guide__num">{provider === "gmail" ? 4 : 5}</span>
          <div className="guide__body">
            <h3 className="guide__title">Run it once, then put it on a timer</h3>
            <p className="card__hint">
              Run <code>processOutbox</code> by hand and grant the permissions it asks
              for &mdash; Google will not let a trigger grant them for you. Then{" "}
              <strong>Triggers → Add trigger</strong>, hourly, on{" "}
              <code>processOutbox</code>. Add a second hourly one on{" "}
              <code>checkReplies</code> and you get replies and bounces back too.
            </p>
          </div>
        </li>

        <li className="guide__step">
          <span className="guide__num">{provider === "gmail" ? 5 : 6}</span>
          <div className="guide__body">
            <h3 className="guide__title">Then it is two clicks, each time round</h3>
            <p className="card__hint">
              <strong>Export the outbox</strong> here, paste those rows under the Outbox
              header, let the trigger run, then download the <strong>Log</strong> tab as
              CSV and <strong>Import a log</strong>. Statuses land on the queue and on
              each lead&apos;s history.
            </p>
            <p className="card__hint">
              Importing the same log twice is harmless, and files arriving out of order
              do not matter: a status never goes backwards, so nothing can overwrite a
              reply with something staler.
            </p>
          </div>
        </li>
      </ol>

      <details className="guide__more">
        <summary className="guide__summary">
          What each status means, and what to do about it
        </summary>
        <dl className="facts">
          {[
            ["Queued", "Written here, not exported yet."],
            ["Waiting on the script", "In an exported outbox. The script has not reported back."],
            ["Sent", "The script sent it."],
            ["Opened", "Reported opened. Treat it as a hint, not a fact."],
            ["Replied", "Somebody answered. Any sequence they were in stops here."],
            ["Failed", "The script could not send it. Retried up to five times, then it stops."],
            ["Bounced", "It went out and came back. The address is wrong — fix it on the lead."],
            ["Skipped", "The script would not send it, usually because there was no address."],
          ].map(([status, means]) => (
            <div key={status} className="facts__row">
              <dt className="facts__label">{status}</dt>
              <dd className="facts__value">{means}</dd>
            </div>
          ))}
        </dl>
        <p className="card__hint">{aiPromptFree}</p>
      </details>
    </section>
  );
}
