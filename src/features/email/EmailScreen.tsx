import { useCallback, useEffect, useState } from "react";
import { Download, FileCode2, Send, Upload } from "lucide-react";
import type {
  EmailMessage,
  EmailTemplate,
  IngestResult,
  Sequence,
  SyncBatch,
} from "@shared/email";
import { EMAIL_STATUS_LABEL } from "@shared/email";
import { useWorkspace } from "@/lib/workspace";
import { relativeDay } from "@/lib/format";
import { TemplateList } from "./TemplateList";
import { SequenceList } from "./SequenceList";

/**
 * Email: the templates, the cadences, the queue, and the bridge.
 *
 * Caulder never sends anything. It writes an outbox for the Apps Script to
 * pick up and reads back the log the script writes, and both halves are
 * buttons rather than a watched folder — Google Drive for Desktop is not on
 * this machine, so nothing can be assumed to sync on its own. Explicit and
 * visible beats automatic and silently broken.
 */
type Tab = "queue" | "attention" | "replies" | "templates" | "sequences" | "setup";

export function EmailScreen() {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const [tab, setTab] = useState<Tab>("queue");
  const [provider, setProvider] = useState<MailProvider>("gmail");
  const [scriptPath, setScriptPath] = useState<string | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [history, setHistory] = useState<SyncBatch[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [ingest, setIngest] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!companyId) return;
    Promise.all([
      window.caulder.email.list(companyId),
      window.caulder.email.templates(companyId),
      window.caulder.email.sequences(companyId),
      window.caulder.email.history(companyId),
      window.caulder.email.provider(),
    ])
      .then(([m, t, s, h, p]) => {
        setMessages(m);
        setTemplates(t);
        setSequences(s);
        setHistory(h);
        setProvider(p);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, [companyId]);

  useEffect(load, [load]);

  // Split once, because three of the tabs are the same list read differently
  // and the counts on the tabs have to agree with what opening them shows.
  const needsAttention = messages.filter(
    (message) => message.status === "bounced" || message.status === "failed",
  );
  const replied = messages.filter((message) => message.status === "replied");

  async function chooseProvider(next: MailProvider) {
    await run(async () => setProvider(await window.caulder.email.setProvider(next)));
  }

  async function saveScript() {
    await run(async () => {
      const path = await window.caulder.email.saveScript();
      if (path) setScriptPath(path);
    });
  }

  async function requeue(id: string) {
    await run(async () => {
      await window.caulder.email.requeue(id);
      load();
    });
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function exportOutbox() {
    if (!companyId) return;
    await run(async () => {
      setIngest(null);
      const outcome = await window.caulder.email.exportOutbox(companyId);
      if (!outcome) return;
      setResult(
        outcome.count === 0
          ? "Nothing is due to go out."
          : `${outcome.count} ${outcome.count === 1 ? "message" : "messages"} written to ${outcome.path}`,
      );
      load();
    });
  }

  async function importLog() {
    if (!companyId) return;
    await run(async () => {
      setResult(null);
      const outcome = await window.caulder.email.importLog(companyId);
      if (!outcome) return;
      setIngest(outcome);
      load();
    });
  }

  async function saveScript() {
    await run(async () => {
      const path = await window.caulder.email.saveScript();
      if (path) setResult(`Apps Script saved to ${path}`);
    });
  }

  if (!companyId) return null;

  const queued = messages.filter(
    (message) => message.status === "queued" || message.status === "exported",
  );

  return (
    <div className="email">
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <h2 className="card__title">The bridge</h2>
        <p className="card__hint">
          Apps Script runs in Google&rsquo;s cloud and Caulder runs here, so the two
          swap files. Export what is due, let the script send it, then import the
          log it writes back.
        </p>

        <div className="import__start">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void exportOutbox()}
            disabled={busy}
          >
            <Download size={15} aria-hidden />
            Export the outbox
          </button>
          <button type="button" className="btn" onClick={() => void importLog()} disabled={busy}>
            <Upload size={15} aria-hidden />
            Import a log
          </button>
          <button type="button" className="btn" onClick={() => void saveScript()} disabled={busy}>
            <FileCode2 size={15} aria-hidden />
            Save the Apps Script
          </button>
        </div>

        {result && <p className="card__hint">{result}</p>}

        {ingest && (
          <div className="ingest">
            <p className="card__hint">
              {ingest.filename}: {ingest.rows} rows, {ingest.applied} applied
              {ingest.ignored > 0 ? `, ${ingest.ignored} already known` : ""}
              {ingest.unmatched > 0 ? `, ${ingest.unmatched} for messages not here` : ""}.
            </p>
            {ingest.duplicate && (
              <p className="card__hint">
                This exact file has been read before, so most rows will have been
                applied already. Nothing was harmed by reading it again.
              </p>
            )}
          </div>
        )}

        {history.length > 0 && (
          <ul className="batches">
            {history.slice(0, 5).map((batch) => (
              <li key={batch.id} className="batch">
                <div className="batch__what">
                  <span className="batch__name">{batch.filename}</span>
                  <span className="batch__meta">
                    {batch.direction === "outbox" ? "Sent out" : "Read back"} &middot;{" "}
                    {relativeDay(batch.createdAt)} &middot; {batch.rowCount} rows
                  </span>
                </div>
                <span className="badge badge--neutral">
                  {batch.direction === "outbox" ? "Outbox" : "Log"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="tabs" role="tablist" aria-label="Email">
        {(["queue", "templates", "sequences"] as Tab[]).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === option}
            onClick={() => setTab(option)}
          >
            {option === "queue"
              ? `Queue (${queued.length})`
              : option === "templates"
                ? `Templates (${templates.length})`
                : `Sequences (${sequences.length})`}
          </button>
        ))}
      </div>

      {/* One wrapper for all three panels, keyed on the tab so the entrance
          replays every time. It is also the tabpanel the tablist above has
          been describing without one existing. */}
      <div className="email__panel anim-panel" role="tabpanel" key={tab}>
      {tab === "queue" && (
        <section className="card">
          <h2 className="card__title">Everything Caulder has queued</h2>
          {messages.length === 0 ? (
            <div className="empty">
              <Send size={24} className="empty__icon" aria-hidden />
              <p className="empty__title">No emails yet</p>
              <p className="empty__body">
                Write to a lead from its page, or put one into a sequence.
              </p>
            </div>
          ) : (
            <ul className="messages">
              {messages.map((message) => (
                <li key={message.id} className="messagerow">
                  <div className="messagerow__body">
                    <span className="messagerow__subject">{message.subject}</span>
                    <span className="messagerow__meta">
                      {message.leadName ?? "Unknown lead"} &middot; {message.toEmail}
                    </span>
                    {message.failure && (
                      <span className="messagerow__failure">{message.failure}</span>
                    )}
                  </div>
                  <div className="messagerow__side">
                    <span className={`badge ${statusTone(message)}`}>
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
        </section>
      )}

      {tab === "templates" && (
        <TemplateList companyId={companyId} templates={templates} onChanged={setTemplates} />
      )}

      {tab === "sequences" && (
        <SequenceList
          companyId={companyId}
          sequences={sequences}
          templates={templates}
          onChanged={setSequences}
        />
      )}
      </div>
    </div>
  );
}

/** Status carries a colour AND its label, never colour alone. */
function statusTone(message: EmailMessage): string {
  switch (message.status) {
    case "replied":
      return "badge--ok";
    case "opened":
    case "sent":
      return "badge--info";
    case "failed":
      return "badge--danger";
    case "skipped":
      return "badge--warn";
    default:
      return "badge--neutral";
  }
}
