import { useCallback, useEffect, useState } from "react";
import { FileCode2, Link2, RefreshCw, Unlink } from "lucide-react";
import type { GoogleState } from "@shared/domain";
import { useWorkspace } from "@/lib/workspace";
import { messageOf } from "@/lib/errors";
import { relativeDay } from "@/lib/format";
import { Select } from "@/components/Select";

/**
 * The Google Calendar and Tasks link.
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

export function GoogleCard() {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const [state, setState] = useState<GoogleState | null>(null);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "connect" | "sync" | "refresh">(null);
  const [showGuide, setShowGuide] = useState(false);

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

  async function run(what: "connect" | "sync", work: () => Promise<GoogleState>) {
    setBusy(what);
    setError(null);
    try {
      setState(await work());
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">Google Calendar and Tasks</h2>

      {!state.canStore ? (
        <p className="card__hint card__hint--warn">
          Windows will not encrypt stored secrets on this machine, so Caulder will
          not keep your script key. It refuses rather than saving it somewhere
          readable.
        </p>
      ) : !state.connected ? (
        <>
          <p className="card__hint">
            Two-way, for the day&rsquo;s blocks and for tasks, through a script that
            runs inside your own Google account. Caulder never signs in to Google.
          </p>

          <div className="actions">
            <button
              type="button"
              className="btn"
              onClick={() => void window.caulder.google.saveScript()}
            >
              <FileCode2 size={15} aria-hidden />
              Save the script
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setShowGuide((open) => !open)}
              aria-expanded={showGuide}
            >
              {showGuide ? "Hide the steps" : "How to set this up"}
            </button>
          </div>

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
                placeholder="The line setUp printed"
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
 * The steps, in Google's own words.
 *
 * Written out rather than linked because every one of them is a place somebody
 * gets stuck, and three of them have a wrong-looking correct answer: adding two
 * services by hand, running a function to be asked for permission, and setting
 * a deployment to "Anyone" — which sounds alarming and is not, because the key
 * is what actually guards it.
 */
function Guide() {
  return (
    <ol className="guide">
      <li>
        <strong>Save the script</strong> with the button above, then open{" "}
        <a href="https://script.google.com" target="_blank" rel="noreferrer">
          script.google.com
        </a>
        , make a new project, and paste the whole file in.
      </li>
      <li>
        In the left sidebar, press <strong>+</strong> beside <strong>Services</strong> and
        add both <strong>Google Calendar API</strong> and <strong>Tasks API</strong>. Leave
        their names as they are.
      </li>
      <li>
        Pick <strong>setUp</strong> in the dropdown at the top and press{" "}
        <strong>Run</strong>. Google will ask you to allow it &mdash; that is the script
        asking for your own calendar. The log underneath then prints{" "}
        <em>Your Caulder key</em>. Copy it.
      </li>
      <li>
        Press <strong>Deploy &rsaquo; New deployment</strong>, choose{" "}
        <strong>Web app</strong>, set <em>Execute as</em> to <strong>Me</strong> and{" "}
        <em>Who has access</em> to <strong>Anyone</strong>, then Deploy and copy the URL.
        &ldquo;Anyone&rdquo; is needed because Caulder is not signed in to Google; the URL
        is unguessable and nothing works without the key.
      </li>
      <li>Paste both below and press Connect.</li>
    </ol>
  );
}
