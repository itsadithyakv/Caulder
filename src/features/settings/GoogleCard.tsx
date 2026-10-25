import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Copy, ExternalLink, FileCode2, Link2, RefreshCw, Unlink } from "lucide-react";
import type { GoogleState } from "@shared/domain";
import { CONTACTS_SINCE_VERSION, MAIL_SINCE_VERSION, SHEET_SINCE_VERSION, TASK_LISTS_SINCE_VERSION } from "@shared/script";
import { useWorkspace } from "@/lib/workspace";
import { messageOf } from "@/lib/errors";
import { inSentence, relativeDay } from "@/lib/format";
import { Select } from "@/components/Select";
import { Explain } from "@/components/Explain";
import { Shot, type ShotName } from "./Shot";
import { announceConnections } from "./Connected";

/**
 * The Google link: Calendar, Tasks and Gmail.
 *
 * Caulder is not signed in to Google and never will be. It talks to a script
 * running inside the user's own account — which is what makes this possible at
 * all: Calendar and Tasks are sensitive scopes, so a desktop app signing in
 * directly would need Google's review, and until it had one the sign-in would
 * expire every seven days.
 *
 * That means setup is genuinely a few steps, and the honest answer is to walk
 * through them here rather than link somebody to a page. The guide is on this
 * card, in order, with the exact words that appear in Google's own menus.
 */

export function GoogleCard({ startOpen = false }: { startOpen?: boolean }) {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const [state, setState] = useState<GoogleState | null>(null);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "connect" | "sync" | "refresh">(null);
  const [showGuide, setShowGuide] = useState(startOpen);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    const next = await window.caulder.google.state(companyId);
    setState(next);
    // Only once there is something to ask about. Asking Google every time
    // Settings opens would make the screen wait on the network to draw.
    if (next.connected) {
      setBusy("refresh");
      try {
        setState(await window.caulder.google.refresh(companyId));
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(null);
      }
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!companyId || !state) return null;

  async function copyScript() {
    setError(null);
    try {
      await window.caulder.google.copyScript();
      setNotice("The script is on your clipboard. Paste it over everything in the new project.");
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function run(what: "connect" | "sync", work: () => Promise<GoogleState>) {
    setBusy(what);
    setError(null);
    try {
      setState(await work());
      announceConnections();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">Google: Calendar, Tasks and Gmail</h2>

      {!state.canStore ? (
        <p className="card__hint card__hint--warn">
          Windows will not encrypt stored secrets on this machine, so Caulder will
          not keep your script key. It refuses rather than saving it somewhere
          readable.
        </p>
      ) : !state.connected ? (
        <>
          <p className="card__hint">
            Calendar, tasks and email, through a script in your own Google account. About five minutes.
          </p>

          <div className="actions">
            <button type="button" className="btn" onClick={() => void copyScript()}>
              <Copy size={15} aria-hidden />
              Copy the script
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => window.open("https://script.new", "_blank")}
            >
              <ExternalLink size={15} aria-hidden />
              Open Apps Script
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setShowGuide((open) => !open)}
              aria-expanded={showGuide}
            >
              {showGuide ? "Hide the steps" : "How to set this up"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void window.caulder.google.saveScript()}
            >
              <FileCode2 size={15} aria-hidden />
              Save it as a file
            </button>
          </div>

          {notice && (
            <p className="card__hint" role="status">
              {notice}
            </p>
          )}

          {showGuide && <Guide />}

          <div className="google__form">
            <label className="field">
              <span className="field__label">Web app URL</span>
              <input
                className="input"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://script.google.com/macros/s/…/exec"
              />
            </label>
            <label className="field">
              <span className="field__label">Key</span>
              <input
                className="input"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder="Paste the whole line setUp printed"
                // Not type=password: it is pasted from a log, and hiding it
                // only makes a mistyped paste impossible to spot.
              />
            </label>
          </div>

          <div className="actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy !== null || url.trim().length === 0 || secret.trim().length === 0}
              onClick={() =>
                void run("connect", async () => {
                  const next = await window.caulder.google.connect(
                    companyId!,
                    url.trim(),
                    secret.trim(),
                  );
                  setUrl("");
                  setSecret("");
                  return next;
                })
              }
            >
              <Link2 size={15} aria-hidden />
              {busy === "connect" ? "Checking" : "Connect"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="card__hint">
            Connected{state.account ? ` as ${state.account}` : ""}. 
          </p>

          <ScriptStatus
            state={state}
            onCopy={() => void copyScript()}
            onCheck={() => void run("sync", () => window.caulder.google.refresh(companyId!))}
          />
          {notice && (
            <p className="card__hint" role="status">
              {notice}
            </p>
          )}

          <div className="google__form">
            {(
              <label className="field">
                <span className="field__label">Calendar</span>
                <Select
                  aria-label="Calendar"
                  value={state.calendarId ?? ""}
                  onChange={(value) =>
                    void run("sync", () =>
                      window.caulder.google.choose(companyId!, value || null, state.taskListId),
                    )
                  }
                  options={[
                    { value: "", label: "Do not sync my day" },
                    ...state.calendars.map((calendar) => ({
                      value: calendar.id,
                      label: calendar.name,
                    })),
                  ]}
                />
              </label>
            )}

            <label className="field">
              <span className="field__label">Task list</span>
              <Select
                aria-label="Task list"
                value={state.taskListId ?? ""}
                onChange={(value) =>
                  void run("sync", () =>
                    window.caulder.google.choose(companyId!, state.calendarId, value || null),
                  )
                }
                options={[
                  { value: "", label: "Do not sync my tasks" },
                  ...state.taskLists.map((list) => ({ value: list.id, label: list.name })),
                ]}
              />
              {/* Google always has one list: none at all means the script cannot see Tasks. */}
              {state.taskLists.length === 0 && (
                <span className="card__hint card__hint--warn">
                  No task lists came back from Google. Open your Caulder script, add Tasks API under Services, run setUp once
                  more, then press Check again here.
                </span>
              )}
            </label>
          </div>

          <div className="checkline">
            <button
              type="button"
              role="switch"
              aria-checked={state.auto}
              aria-label="Keep this in step automatically"
              className="toggle"
              onClick={() =>
                void run("sync", () =>
                  window.caulder.google.setAuto(companyId!, !state.auto),
                )
              }
            >
              <span className="toggle__thumb" />
            </button>
            <span className="checkline__text">
              <span className="checkline__title">Keep this in step automatically</span>
              <span className="card__hint">
                Every ten minutes, and soon after a change.
              </span>
            </span>
          </div>

          <div className="actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy !== null}
              onClick={() => void run("sync", () => window.caulder.google.sync(companyId!))}
            >
              <RefreshCw size={15} aria-hidden />
              {busy === "sync" ? "Syncing" : "Sync now"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void run("sync", () => window.caulder.google.disconnect(companyId!))}
            >
              <Unlink size={15} aria-hidden />
              Disconnect
            </button>
          </div>

          <Summary state={state} />
        </>
      )}

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** What the last run did, in words rather than as four numbers. */
function Summary({ state }: { state: GoogleState }) {
  const { sync } = state;

  if (sync.lastError) {
    return (
      <p className="card__hint card__hint--warn">
        The last sync did not finish: {sync.lastError}
      </p>
    );
  }

  if (!sync.lastSyncedAt) {
    return <p className="card__hint">Nothing has been synced yet.</p>;
  }

  return (
    <p className="card__hint">
      Last synced {inSentence(relativeDay(sync.lastSyncedAt))} &mdash; {sync.pushed} sent,{" "}
      {sync.pulled} brought back
      {sync.conflicts > 0
        ? `, and ${sync.conflicts} ${
            sync.conflicts === 1 ? "thing had" : "things had"
          } been changed in both places, where whoever created it won`
        : ""}
      . 
    </p>
  );
}

/**
 * What the script can do, and what to do when it is behind.
 *
 * Email arrived in version 2. A script pasted before that still syncs the
 * calendar, so the card says what an update adds and how to do it without
 * changing the URL, rather than just refusing to send.
 */
function ScriptStatus({
  state,
  onCopy,
  onCheck,
}: {
  state: GoogleState;
  onCopy: () => void;
  onCheck: () => void;
}) {
  const script = state.script;
  if (!script) return null;

  if (script.version < script.latest) {
    return (
      <>
        <p className="card__hint card__hint--warn">
          Your script is version {script.version}.{" "}
          {script.version < MAIL_SINCE_VERSION
            ? `Version ${script.latest} sends email from Caulder, notices replies and sends follow-ups.`
            : script.version < CONTACTS_SINCE_VERSION
              ? `Version ${script.latest} saves a contact to your phone through Google Contacts and keeps a backup in your Drive; your calendar, tasks and email go on working meanwhile.`
              : script.version < SHEET_SINCE_VERSION
                ? `Version ${script.latest} can keep your contacts as a Google Sheet, to read and change on your phone; what you have goes on working meanwhile.`
                : script.version < TASK_LISTS_SINCE_VERSION
                  ? `Version ${script.latest} mends Google Tasks: every task list is offered, not only the first twenty, and a missing Tasks API is said plainly instead of stopping the connection.`
                  : `Version ${script.latest} sends an invoice's or a quote's PDF with the email.`}{" "}
          To update it, keeping the same URL:
        </p>
        <UpdateSteps />
        <div className="actions">
          <button type="button" className="btn" onClick={onCopy}>
            <Copy size={15} aria-hidden />
            Copy the new script
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCheck}>
            <RefreshCw size={15} aria-hidden />
            Check again
          </button>
        </div>
      </>
    );
  }

  if (script.mailError) {
    return (
      <>
        <p className="card__hint card__hint--warn">{script.mailError}</p>
        <div className="actions">
          <button type="button" className="btn btn--ghost" onClick={onCheck}>
            <RefreshCw size={15} aria-hidden />
            Check again
          </button>
        </div>
      </>
    );
  }

  return (
    <p className="card__hint">
      Email goes out from {script.address ?? "your Gmail"}
      {script.remaining != null ? `, with ${script.remaining} sends left today` : ""}. 
    </p>
  );
}

/** Updating a script already deployed, without changing its URL. */
function UpdateSteps() {
  return (
    <ol className="guide">
      <li>
        Open your Caulder script, select everything, paste the new one over it and save.
      </li>
      <li>
        Press <strong>Deploy &rsaquo; Manage deployments</strong>, the pencil, then{" "}
        <strong>Version &rsaquo; New version</strong> and <strong>Deploy</strong>.
      </li>
      <li>
        Run <strong>setUp</strong> once more, and allow what Google asks for.
      </li>
      <li>
        Come back here and press <strong>Check again</strong>.
      </li>
    </ol>
  );
}

/** One step: what to do, and a picture of the screen it happens on. */
function Step({ what, shot, children }: { what: string; shot?: ShotName; children: ReactNode }) {
  return (
    <li>
      <div className="guide__step">
        <div className="guide__words">
          <h3 className="guide__what">{what}</h3>
          <p>{children}</p>
        </div>
        {shot && <Shot of={shot} />}
      </div>
    </li>
  );
}

/**
 * The steps, in Google's own words, each with a picture of the screen.
 *
 * Written out rather than linked because every one of them is a place somebody
 * gets stuck, and the sticking is never the instruction - it is finding the
 * one word on a screen built for programmers. So each step is a sentence and a
 * drawing of that screen with the thing to press ringed.
 *
 * Two of them have a correct answer that looks wrong - Google's warning that
 * it has not verified a script you wrote for yourself, and a deployment open
 * to "Anyone". Both are answered under the steps rather than inside them: a
 * reader following instructions wants the next move, and a reader who has
 * stopped to worry wants the paragraph.
 */
function Guide() {
  return (
    <>
      <ol className="guide">
        <Step what="Paste the script in" shot="paste">
          <strong>Copy the script</strong>, then <strong>Open Apps Script</strong>, which starts a
          new project. Select everything there, paste over it, call it <strong>Caulder</strong>,
          and save.
        </Step>
        <Step what="Add two services" shot="services">
          In the left sidebar press <strong>+</strong> beside <strong>Services</strong>, and add
          both <strong>Google Calendar API</strong> and <strong>Tasks API</strong>. Leave their
          names as they are.
        </Step>
        <Step what="Run setUp, and allow it" shot="run">
          Pick <strong>setUp</strong> at the top, press <strong>Run</strong>, then{" "}
          <strong>Review permissions</strong> and your account. Google warns that it has not
          verified the app: <strong>Advanced</strong>, <strong>Go to Caulder (unsafe)</strong>,{" "}
          <strong>Allow</strong>. The log then prints your key &mdash; copy that whole line.
        </Step>
        <Step what="Deploy it as a web app" shot="deploy">
          <strong>Deploy &rsaquo; New deployment</strong>, the gear, <strong>Web app</strong>. Set{" "}
          <em>Execute as</em> to <strong>Me</strong> and <em>Who has access</em> to{" "}
          <strong>Anyone</strong>, press <strong>Deploy</strong>, and copy the{" "}
          <strong>Web app URL</strong> &mdash; it ends in <code>/exec</code>.
        </Step>
        <Step what="Paste both below">
          The URL and the key go in the two boxes under this, then <strong>Connect</strong>.
          Caulder tries them before keeping them, so a bad paste is caught here rather than
          turning up later as a sync that never runs.
        </Step>
      </ol>

      <Explain label="Two of those look wrong. Here is why they are not.">
        <p>
          <strong>&ldquo;Google hasn&rsquo;t verified this app.&rdquo;</strong> The app it means is
          the script you just pasted, in your own account. Nobody at Google has reviewed it,
          because nobody at Google reviews what you write for yourself. You can delete it from
          there whenever you like.
        </p>
        <p>
          <strong>Who has access: Anyone.</strong> Caulder is not signed in to Google, so the
          script has to answer a request that carries no Google account at all. The address is
          unguessable, and nothing happens without the key, which stays on this computer.
        </p>
        <p>
          Updating the script later keeps the same URL: paste the new file over the old one, press{" "}
          <strong>Deploy &rsaquo; Manage deployments</strong>, the pencil,{" "}
          <strong>Version &rsaquo; New version</strong> and <strong>Deploy</strong>, then run{" "}
          <strong>setUp</strong> once more.
        </p>
      </Explain>
    </>
  );
}
