import { useEffect, useRef, useState } from "react";
import { QuickAdd } from "@/features/today/QuickAdd";
import { messageOf } from "@/lib/errors";

/**
 * The quick window - opened from the tray icon or with Ctrl+Alt+A.
 *
 * One box, over whatever you were doing, gone again in a second. It has no
 * workspace switcher and almost no controls on purpose: every element here is
 * one more thing between a thought and it being written down.
 *
 * Two modes. **Task** is the thing you have to remember to do - "datascience
 * assignment at 4pm today" - read the same way Today's quick-add line reads
 * it, and asking the same questions when something is missing. **Note** is the
 * thought you do not want to lose. The tray opens it on Task; the key opens
 * whichever was used last; Ctrl+T and Ctrl+N switch. A task typed without
 * leaving the app you were in is a task you actually write down.
 *
 * Escape throws it away, and main closes the window either way, so this never
 * has to decide what a window is.
 */

type Mode = "note" | "task";
const MODE_KEY = "caulder.capture.mode";

type Workspace = { id: string; timezone: string; personal: boolean };

export function Capture() {
  // Task unless a note was the last thing written here: the tray and the key
  // are mostly for "remember to do this", and a first open should be ready
  // for exactly that.
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === "note" ? "note" : "task";
    } catch {
      return "task";
    }
  });
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [nonce, setNonce] = useState(1);
  const box = useRef<HTMLTextAreaElement>(null);

  function choose(next: Mode) {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Not remembered, which is not worth interrupting anybody over.
    }
  }

  // The workspace is read each time the window comes back, not once: it is
  // hidden and re-shown rather than rebuilt, and the active workspace may have
  // changed in between.
  useEffect(() => {
    const refresh = async () => {
      const { companies, activeCompanyId } = await window.caulder.companies.list();
      const active = companies.find((company) => company.id === activeCompanyId);
      setWorkspace(
        active
          ? { id: active.id, timezone: active.timezone, personal: active.kind === "personal" }
          : null,
      );
      // This window has no workspace provider of its own, so without these it
      // would wear the work face and the default blue over a coffee personal
      // workspace - the same line in two different skins, depending on which
      // window it was typed into.
      const root = document.documentElement;
      root.setAttribute("data-face", active?.kind === "personal" ? "personal" : "work");
      if (active) root.setAttribute("data-accent", active.accent);
      else root.removeAttribute("data-accent");
    };
    void refresh();

    const focus = () => {
      void refresh();
      if (mode === "note") box.current?.focus();
      else setNonce((n) => n + 1);
    };
    focus();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [mode]);

  // The mode it was opened for. The tray asks for a task, and its menu for
  // either; the key asks for nothing and gets whichever was used last. Asked
  // for on mount and each time the window is shown again, and also told -
  // the first showing is requested before this page has loaded to hear it.
  useEffect(() => {
    const ask = () => {
      window.caulder.capture.mode().then((wanted) => {
        if (wanted) choose(wanted);
      }, () => undefined);
    };
    ask();
    const shown = () => {
      if (document.visibilityState === "visible") ask();
    };
    document.addEventListener("visibilitychange", shown);
    const stop = window.caulder.capture.onMode(choose);
    return () => {
      document.removeEventListener("visibilitychange", shown);
      stop();
    };
  }, []);

  // Escape with nothing left to clear closes the window, in either mode. The
  // task line clears itself first and stops the key, so it takes two presses
  // to lose a half-typed task - the second one on purpose.
  //
  // Ctrl+T and Ctrl+N move between the two without reaching for the mouse,
  // which is the whole reason this window is opened from a key.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key === "t" || key === "n") {
          event.preventDefault();
          choose(key === "t" ? "task" : "note");
          return;
        }
      }
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setBody("");
      void window.caulder.capture.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function save() {
    const text = body.trim();
    if (text.length === 0 || saving) return;

    setSaving(true);
    try {
      await window.caulder.capture.save(text);
      setBody("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="capture">
      <div className="capture__modes" role="radiogroup" aria-label="What this is">
        {(["task", "note"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={mode === option}
            className={`chip${mode === option ? " chip--on" : ""}`}
            onClick={() => choose(option)}
            title={option === "task" ? "Ctrl+T" : "Ctrl+N"}
          >
            {option === "note" ? "Note" : "Task"}
          </button>
        ))}
      </div>

      {mode === "note" ? (
        <>
          <textarea
            ref={box}
            className="capture__box"
            value={body}
            placeholder="What just occurred to you?"
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                void save();
              }
            }}
          />

          {error ? (
            <p className="capture__error" role="alert">
              {error}
            </p>
          ) : (
            <p className="capture__hint">
              <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to keep it &middot; <kbd>Ctrl</kbd> +{" "}
              <kbd>T</kbd> for a task &middot; <kbd>Esc</kbd> to throw it away
            </p>
          )}
        </>
      ) : workspace ? (
        <QuickAdd
          companyId={workspace.id}
          timezone={workspace.timezone}
          personal={workspace.personal}
          focusNonce={nonce}
          placeholder="Datascience assignment at 4pm today"
          hint="“tmrw 4pm”, “fri for 2h”, “gym every mon 6am”, “not urgent”. Enter adds it · Ctrl+N for a note · Esc closes."
          // Long enough to read "Added", then out of the way of whatever you
          // were doing - which is the whole point of this window.
          onAdded={() => {
            setTimeout(() => void window.caulder.capture.close(), 900);
          }}
        />
      ) : (
        <p className="capture__error">There is no workspace to add a task to yet.</p>
      )}
    </div>
  );
}
