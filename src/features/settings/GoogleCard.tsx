import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, FileCode2, Link2, RefreshCw, Unlink } from "lucide-react";
import type { GoogleState } from "@shared/domain";
import { CONTACTS_SINCE_VERSION, MAIL_SINCE_VERSION } from "@shared/script";
import { useWorkspace } from "@/lib/workspace";
import { messageOf } from "@/lib/errors";
import { relativeDay } from "@/lib/format";
import { Select } from "@/components/Select";
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
            Your day&rsquo;s blocks and tasks, both ways, and email sent from your own
            Gmail with replies noticed &mdash; through a script that runs inside your own
            Google account. Caulder never signs in to Google. About five minutes, once.
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
            Connected{state.account ? ` as ${state.account}` : ""}. Caulder only ever
            touches the calendar and list you pick here.
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
                Every ten minutes, and about half a minute after you change
                something here &mdash; so a task written in Caulder is on your phone
                before you have put the phone down. If it starts failing it slows
                down rather than hammering Google, and stops after a couple of
                hours with the reason left on this card.
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
      Last synced {relativeDay(sync.lastSyncedAt).toLowerCase()} &mdash; {sync.pushed} sent,{" "}
      {sync.pulled} brought back
      {sync.conflicts > 0
        ? `, and ${sync.conflicts} ${
            sync.conflicts === 1 ? "thing had" : "things had"
          } been changed in both places, where whoever created it won`
        : ""}
      . Days from {sync.syncedFrom} to {sync.syncedTo} were looked at; anything
      outside that was left alone.
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
            ? `Version ${script.latest} sends email from Caulder, notices replies and sends follow-ups, and shares the brain with a co-founder.`
            : script.version < CONTACTS_SINCE_VERSION
              ? `Version ${script.latest} saves a contact to your phone through Google Contacts and keeps a backup in your Drive; your calendar, tasks and email go on working meanwhile.`
              : `Version ${script.latest} is the newest; what you have goes on working meanwhile.`}{" "}
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
      {script.remaining != null ? `, with ${script.remaining} sends left today` : ""}. Scheduled
      email and follow-ups go out every fifteen minutes, even with Caulder closed.
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

/**
 * The steps, in Google's own words.
 *
 * Written out rather than linked because every one of them is a place somebody
 * gets stuck, and four of them have a wrong-looking correct answer: adding two
 * services by hand, running a function to be asked for permission, Google's
 * warning that it has not verified a script you wrote for yourself, and a
 * deployment set to "Anyone" - which sounds alarming and is not, because the
 * key is what actually guards it.
 */
function Guide() {
  return (
    <>
      <ol className="guide">
        <li>
          Press <strong>Copy the script</strong>, then <strong>Open Apps Script</strong>, which
          starts a new project in your browser. Select everything in the editor and paste over
          it, click <em>Untitled project</em> at the top and call it <strong>Caulder</strong>,
          then save.
        </li>
        <li>
          In the left sidebar, press <strong>+</strong> beside <strong>Services</strong> and add
          both <strong>Google Calendar API</strong> and <strong>Tasks API</strong>. Leave their
          names as they are.
        </li>
        <li>
          Pick <strong>setUp</strong> in the dropdown at the top and press <strong>Run</strong>,
          then <strong>Review permissions</strong> and your account. Google says{" "}
          <em>Google hasn&rsquo;t verified this app</em>, because nobody at Google has reviewed a
          script you made for yourself: press <strong>Advanced</strong>, then{" "}
          <strong>Go to Caulder (unsafe)</strong>, then <strong>Allow</strong>. The log
          underneath prints <em>Your Caulder key</em>; copy that whole line.
        </li>
        <li>
          Press <strong>Deploy &rsaquo; New deployment</strong>, click the gear and choose{" "}
          <strong>Web app</strong>. Set <em>Execute as</em> to <strong>Me</strong> and{" "}
          <em>Who has access</em> to <strong>Anyone</strong>, press Deploy, and copy the{" "}
          <strong>Web app URL</strong>, which ends in <code>/exec</code>. &ldquo;Anyone&rdquo; is
          needed because Caulder is not signed in to Google; the URL is unguessable and nothing
          works without the key.
        </li>
        <li>
          Paste both below and press <strong>Connect</strong>.
        </li>
      </ol>
      <p className="card__hint">
        Updating the script later keeps the same URL: paste the new file over the old one, press{" "}
        <strong>Deploy &rsaquo; Manage deployments</strong>, the pencil,{" "}
        <strong>Version &rsaquo; New version</strong> and <strong>Deploy</strong>, then run{" "}
        <strong>setUp</strong> once more.
      </p>
    </>
  );
}
