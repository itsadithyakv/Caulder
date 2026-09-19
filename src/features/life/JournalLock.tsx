import { useState, type FormEvent } from "react";
import { KeyRound, Lock, LockOpen } from "lucide-react";
import type { JournalLockState } from "@shared/life";
import { MenuButton } from "@/components/MenuButton";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";

/**
 * The journal's passcode, from the journal itself: a menu in its heading,
 * and the few forms it needs, inline rather than in a dialog. Writing never
 * asks for it - only reading a day that is over does - and every form says
 * what happens if it is forgotten, because nothing can get those days back.
 */

type Mode = "set" | "change" | "remove" | "forget";

export function PasscodeMenu({ state, onPick }: { state: JournalLockState; onPick: (mode: Mode | "lock") => void }) {
  const items = !state.set
    ? [{ label: "Lock past days with a passcode", hint: "Writing never needs it; reading a day that is over does.", onSelect: () => onPick("set") }]
    : [
        ...(state.open ? [{ label: "Lock now", icon: <Lock size={14} aria-hidden />, onSelect: () => onPick("lock") }] : []),
        { label: "Change the passcode", onSelect: () => onPick("change") },
        { label: "Take the passcode off", hint: "Every locked day is opened and kept as it was.", onSelect: () => onPick("remove") },
        { label: "I forgot the passcode", danger: true, onSelect: () => onPick("forget") },
      ];
  return (
    <MenuButton
      label={!state.set ? "Passcode" : state.open ? "Unlocked" : "Locked"}
      icon={!state.set ? <KeyRound size={14} aria-hidden /> : state.open ? <LockOpen size={14} aria-hidden /> : <Lock size={14} aria-hidden />}
      className="btn btn--sm btn--ghost"
      align="right"
      items={items}
    />
  );
}

/** The one form for all of it; what it asks depends on what is being done. */
export function PasscodeForm({
  mode,
  companyId,
  onDone,
  onCancel,
}: {
  mode: Mode;
  companyId: string;
  onDone: (state: JournalLockState) => void;
  onCancel: () => void;
}) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if ((mode === "set" || mode === "change") && second !== (mode === "set" ? first : typed)) {
      setError("The two do not match.");
      return;
    }
    setBusy(true);
    try {
      const life = window.caulder.life;
      const next =
        mode === "set"
          ? await life.setPasscode(companyId, first)
          : mode === "change"
            ? await life.changePasscode(first, typed)
            : mode === "remove"
              ? await life.removePasscode(first)
              : await life.forgetPasscode();
      onDone(next);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const title = {
    set: "Lock past days",
    change: "Change the passcode",
    remove: "Take the passcode off",
    forget: "Forgot the passcode",
  }[mode];

  return (
    <form className="journallock" onSubmit={(event) => void submit(event)} aria-label={title}>
      <h3 className="journallock__title">{title}</h3>
      {mode === "set" && (
        <p className="card__hint">
          Today stays open to write in, and so does any day you add to later. A day that is over is locked, and reading it
          asks for this. <strong>If you forget it, nobody can open those days - not Caulder, not you.</strong>
        </p>
      )}
      {mode === "forget" ? (
        <>
          <p className="card__hint card__hint--warn">
            Without the passcode, the locked days cannot be opened by anyone. This takes the lock off and{" "}
            <strong>erases what it locked</strong>. The days, their moods and today&rsquo;s entry stay.
          </p>
          <label className="field">
            <span className="field__label">Type ERASE to go ahead</span>
            <input className="input" value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span className="field__label">{mode === "change" ? "The passcode now" : mode === "remove" ? "The passcode" : "A passcode"}</span>
            <input
              className="input"
              type="password"
              autoComplete={mode === "set" ? "new-password" : "current-password"}
              value={first}
              onChange={(event) => setFirst(event.target.value)}
              autoFocus
            />
          </label>
          {mode === "change" && (
            <label className="field">
              <span className="field__label">The new one</span>
              <input className="input" type="password" autoComplete="new-password" value={typed} onChange={(event) => setTyped(event.target.value)} />
            </label>
          )}
          {(mode === "set" || mode === "change") && (
            <label className="field">
              <span className="field__label">{mode === "set" ? "Once more" : "The new one, once more"}</span>
              <input className="input" type="password" autoComplete="new-password" value={second} onChange={(event) => setSecond(event.target.value)} />
            </label>
          )}
        </>
      )}
      <ErrorLine>{error}</ErrorLine>
      <div className="actions">
        <button
          type="submit"
          className={`btn btn--sm ${mode === "forget" ? "btn--danger" : "btn--primary"}`}
          disabled={busy || (mode === "forget" && typed !== "ERASE")}
        >
          {mode === "set" ? "Lock past days" : mode === "change" ? "Change it" : mode === "remove" ? "Take it off" : "Erase and unlock"}
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** A day that is over, locked: the passcode opens it. */
export function LockedDay({ onOpened }: { onOpened: (state: JournalLockState) => void }) {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onOpened(await window.caulder.life.unlock(passcode));
    } catch (cause) {
      setError(messageOf(cause));
      setPasscode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="journallock journallock--day" onSubmit={(event) => void submit(event)} aria-label="Unlock the journal">
      <Lock size={20} className="journallock__icon" aria-hidden />
      <p className="journallock__words">This day is locked. Your passcode opens it, and the rest, for a while.</p>
      <div className="journallock__row">
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          aria-label="Passcode"
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          autoFocus
        />
        <button type="submit" className="btn btn--primary" disabled={busy || passcode.length === 0}>
          Unlock
        </button>
      </div>
      <ErrorLine>{error}</ErrorLine>
    </form>
  );
}
