import { useState, type FormEvent } from "react";
import { KeyRound, Lock, LockOpen } from "lucide-react";
import type { JournalLockState } from "@shared/life";
import { passcodeStrength } from "@shared/passcode";
import { MenuButton } from "@/components/MenuButton";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";

/**
 * The journal's passcode, from the journal itself: a menu in its heading,
 * and the few forms it needs, inline rather than in a dialog. Writing never
 * asks for it - only reading a locked day does - and every form says what
 * happens if it is forgotten.
 *
 * A recovery key is made with the passcode and shown once, to be written on
 * paper: it opens the journal when the passcode is forgotten. Caulder keeps
 * no copy of it and offers no button to copy it, because a clipboard is
 * remembered by other programs.
 */

export type LockMode = "set" | "change" | "remove" | "forget" | "recover" | "recovery";

export function PasscodeMenu({
  state,
  onPick,
}: {
  state: JournalLockState;
  onPick: (mode: LockMode | "lock" | "today") => void;
}) {
  const items = !state.set
    ? [{ label: "Lock the journal with a passcode", hint: "Writing never needs it; reading a locked day does.", onSelect: () => onPick("set") }]
    : [
        ...(state.open ? [{ label: "Lock now", icon: <Lock size={14} aria-hidden />, onSelect: () => onPick("lock") }] : []),
        state.lockToday
          ? { label: "Leave today open until midnight", hint: "Today can be read without the passcode until the day is over.", onSelect: () => onPick("today") }
          : { label: "Lock today as I write it", hint: "Today needs the passcode to read too. Writing still does not.", onSelect: () => onPick("today") },
        {
          label: state.recovery ? "Make a new recovery key" : "Make a recovery key",
          hint: "Opens the journal if you forget the passcode.",
          onSelect: () => onPick("recovery"),
        },
        { label: "Change the passcode", onSelect: () => onPick("change") },
        { label: "Take the passcode off", hint: "Every locked day is opened and kept as it was.", onSelect: () => onPick("remove") },
        { label: "I forgot the passcode", danger: !state.recovery, onSelect: () => onPick(state.recovery ? "recover" : "forget") },
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

/** How strong a new passcode is, as it is typed. */
function Strength({ value }: { value: string }) {
  if (!value) return null;
  const strength = passcodeStrength(value);
  return (
    <div className={`passstrength passstrength--${strength.score}`} role="status">
      <span className="passstrength__bar" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={`passstrength__step${strength.score >= step ? " passstrength__step--on" : ""}`} />
        ))}
      </span>
      <span className="passstrength__label">{strength.label}</span>
      {strength.hint && <span className="passstrength__hint">{strength.hint}</span>}
    </div>
  );
}

/** A recovery key, shown the one time it exists outside the lock. */
function RecoveryKey({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
  const [written, setWritten] = useState(false);
  return (
    <div className="journallock" aria-label="Your recovery key">
      <h3 className="journallock__title">Your recovery key</h3>
      <p className="card__hint">
        Write it on paper and keep it somewhere safe. If you forget the passcode, this opens the journal instead.{" "}
        <strong>It is shown this once:</strong> Caulder does not keep it, and cannot show it again.
      </p>
      <p className="recoverykey" aria-label={recoveryKey.split("").join(" ")}>
        {recoveryKey}
      </p>
      <label className="checkline">
        <input type="checkbox" className="tickbox" checked={written} onChange={(event) => setWritten(event.target.checked)} />
        I have written it down
      </label>
      <div className="actions">
        <button type="button" className="btn btn--sm btn--primary" disabled={!written} onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

/** The one form for all of it; what it asks depends on what is being done. */
export function PasscodeForm({
  mode,
  state,
  companyId,
  onDone,
  onCancel,
  onMode,
}: {
  mode: LockMode;
  state: JournalLockState;
  companyId: string;
  onDone: (state: JournalLockState) => void;
  onCancel: () => void;
  /** From "forgot" to its other road: the recovery key, or erasing. */
  onMode: (mode: LockMode) => void;
}) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [typed, setTyped] = useState("");
  const [lockToday, setLockToday] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A key just made: shown before the form is done with. */
  const [shown, setShown] = useState<{ key: string; state: JournalLockState } | null>(null);

  if (shown) return <RecoveryKey recoveryKey={shown.key} onDone={() => onDone(shown.state)} />;

  /** The field the new passcode is typed in, which the strength is shown for. */
  const fresh = mode === "set" ? first : mode === "change" || mode === "recover" ? typed : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if ((mode === "set" || mode === "change" || mode === "recover") && second !== fresh) {
      setError("The two do not match.");
      return;
    }
    setBusy(true);
    try {
      const life = window.caulder.life;
      if (mode === "set") {
        const made = await life.setPasscode(companyId, first);
        const next = lockToday ? await life.lockToday(companyId, true) : made.state;
        setShown({ key: made.recoveryKey, state: next });
      } else if (mode === "recovery") {
        const made = await life.makeRecoveryKey();
        setShown({ key: made.recoveryKey, state: made.state });
      } else {
        onDone(
          mode === "change"
            ? await life.changePasscode(first, typed)
            : mode === "remove"
              ? await life.removePasscode(first)
              : mode === "recover"
                ? await life.recover(first, typed)
                : await life.forgetPasscode(),
        );
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const title = {
    set: "Lock the journal",
    change: "Change the passcode",
    remove: "Take the passcode off",
    forget: "Forgot the passcode",
    recover: "Forgot the passcode",
    recovery: state.recovery ? "A new recovery key" : "A recovery key",
  }[mode];

  const button = {
    set: "Lock it",
    change: "Change it",
    remove: "Take it off",
    forget: "Erase and unlock",
    recover: "Open it with the key",
    recovery: "Make it",
  }[mode];

  const ready =
    mode === "forget"
      ? typed === "ERASE"
      : mode === "recovery"
        ? state.open
        : first.length > 0 && (mode === "remove" || (mode === "set" ? passcodeStrength(first).ok : passcodeStrength(typed).ok));

  return (
    <form className="journallock" onSubmit={(event) => void submit(event)} aria-label={title}>
      <h3 className="journallock__title">{title}</h3>
      {mode === "set" && (
        <p className="card__hint">
          Writing never asks for it. A day that is over is locked, and reading it asks for this. You will be given a recovery
          key to write down, in case you forget it; <strong>lose both, and nobody can open those days - not Caulder, not you.</strong>
        </p>
      )}
      {mode === "recovery" && (
        <p className="card__hint">
          {state.open
            ? `A recovery key opens the journal if you forget the passcode.${state.recovery ? " The one you have now will stop working." : ""}`
            : "Unlock the journal first: a recovery key is made from the key the passcode opens."}
        </p>
      )}
      {mode === "recover" && (
        <p className="card__hint">
          Type the recovery key you wrote down, and a new passcode. Every locked day stays as it is.{" "}
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => onMode("forget")}>
            I do not have the key either
          </button>
        </p>
      )}
      {mode === "forget" ? (
        <>
          <p className="card__hint card__hint--warn">
            Without the passcode {state.recovery ? "or the recovery key " : ""}the locked days cannot be opened by anyone. This takes
            the lock off and <strong>erases what it locked</strong>. The days, their moods and today&rsquo;s entry stay.
          </p>
          <label className="field">
            <span className="field__label">Type ERASE to go ahead</span>
            <input className="input" value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus />
          </label>
        </>
      ) : mode === "recovery" ? null : (
        <>
          <label className="field">
            <span className="field__label">
              {mode === "change" ? "The passcode now" : mode === "remove" ? "The passcode" : mode === "recover" ? "The recovery key" : "A passcode"}
            </span>
            <input
              className={`input${mode === "recover" ? " input--mono" : ""}`}
              type={mode === "recover" ? "text" : "password"}
              autoComplete={mode === "set" ? "new-password" : mode === "recover" ? "off" : "current-password"}
              spellCheck={false}
              placeholder={mode === "recover" ? "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" : mode === "set" ? "A few words is easiest" : undefined}
              value={first}
              onChange={(event) => setFirst(event.target.value)}
              autoFocus
            />
          </label>
          {mode === "set" && <Strength value={first} />}
          {(mode === "change" || mode === "recover") && (
            <label className="field">
              <span className="field__label">The new passcode</span>
              <input className="input" type="password" autoComplete="new-password" value={typed} onChange={(event) => setTyped(event.target.value)} />
            </label>
          )}
          {(mode === "change" || mode === "recover") && <Strength value={typed} />}
          {(mode === "set" || mode === "change" || mode === "recover") && (
            <label className="field">
              <span className="field__label">{mode === "set" ? "Once more" : "The new one, once more"}</span>
              <input className="input" type="password" autoComplete="new-password" value={second} onChange={(event) => setSecond(event.target.value)} />
            </label>
          )}
          {mode === "set" && (
            <label className="checkline">
              <input type="checkbox" className="tickbox" checked={lockToday} onChange={(event) => setLockToday(event.target.checked)} />
              Lock today as I write it, not only at midnight
            </label>
          )}
        </>
      )}
      <ErrorLine>{error}</ErrorLine>
      <div className="actions">
        <button
          type="submit"
          className={`btn btn--sm ${mode === "forget" ? "btn--danger" : "btn--primary"}`}
          disabled={busy || !ready}
        >
          {button}
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * A locked day: the passcode opens it. Today, locked as it is written, can
 * still be added to without it - the words are sealed as they are kept.
 */
export function LockedDay({
  onOpened,
  isToday = false,
  onAdd,
}: {
  onOpened: (state: JournalLockState) => void;
  isToday?: boolean;
  onAdd?: (text: string) => Promise<void>;
}) {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [added, setAdded] = useState(0);

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

  async function add() {
    if (!onAdd || !adding.trim()) return;
    setBusy(true);
    setAddError(null);
    try {
      await onAdd(adding);
      setAdding("");
      setAdded((n) => n + 1);
    } catch (cause) {
      setAddError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="journallock journallock--day">
      <form className="journallock__open" onSubmit={(event) => void submit(event)} aria-label="Unlock the journal">
        <Lock size={20} className="journallock__icon" aria-hidden />
        <p className="journallock__words">
          {isToday ? "Today is locked as you write it." : "This day is locked."} Your passcode opens it, and the rest, for a while.
        </p>
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
      {onAdd && (
        <div className="journallock__add">
          <label className="field">
            <span className="field__label">Or add to today without unlocking</span>
            <textarea
              className="input"
              rows={3}
              value={adding}
              onChange={(event) => setAdding(event.target.value)}
              placeholder="It is locked the moment it is kept."
            />
          </label>
          <div className="actions">
            <button type="button" className="btn btn--sm" disabled={busy || !adding.trim()} onClick={() => void add()}>
              Add it, locked
            </button>
            {added > 0 && (
              <span className="journallock__added" role="status">
                Added and locked.
              </span>
            )}
          </div>
          <ErrorLine>{addError}</ErrorLine>
        </div>
      )}
    </div>
  );
}
