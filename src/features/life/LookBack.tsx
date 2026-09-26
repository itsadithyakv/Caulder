import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { History, Laptop, Lock, RefreshCw, Send, X } from "lucide-react";
import {
  LOOKBACK_SPANS,
  type LocalModel,
  type LookBackMonth,
  type LookBackPlan,
  type LookBackReading,
  type LookBackSpan,
} from "@shared/lookback";
import { Chips, Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { dateFormatter, formatDay, numberText } from "@/lib/format";
import type { JournalLockState } from "@shared/life";
import { Markdown } from "../brain/Markdown";

/**
 * Looking back: the journal over a stretch of time, read by a model, to show
 * how the person has changed (`shared/lookback.ts`).
 *
 * The numbers come first and need no model. The reading is done on this
 * computer by Ollama unless the person opens the other way, reads who will
 * receive how much, and types their passcode (or SEND) to mean it.
 *
 * Nothing here is kept: the reading lives in this component's state and goes
 * when it closes, and the passcode is cleared the moment it has been used.
 * While it is open, the window is left out of screenshots and shared screens.
 */

const SPAN_OPTIONS = LOOKBACK_SPANS.map((span) => ({ value: span.id, label: span.label }));

const MOOD_WORDS = ["Rough", "Low", "Okay", "Good", "Great"] as const;


/** "2026-09" as "Sep 2026", built from its parts so no time zone moves it. */
function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return dateFormatter({ month: "short", year: "numeric" }).format(new Date(year ?? 1970, (m ?? 1) - 1, 1));
}

function moodWord(mood: number): string {
  return MOOD_WORDS[Math.min(4, Math.max(0, Math.round(mood) - 1))] ?? "Okay";
}

function plural(n: number, one: string, many: string): string {
  return `${numberText(n)} ${n === 1 ? one : many}`;
}

type Busy = null | "local" | "away";

export function LookBack({
  companyId,
  onClose,
  onUnlocked,
}: {
  companyId: string;
  onClose: () => void;
  /** The journal was opened from here: the screen behind should know. */
  onUnlocked?: (state: JournalLockState) => void;
}) {
  const [span, setSpan] = useState<LookBackSpan>("season");
  const [plan, setPlan] = useState<LookBackPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [reading, setReading] = useState<LookBackReading | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [awayOpen, setAwayOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const asked = useRef(0);

  // Private words are on the screen for as long as this is open.
  useEffect(() => {
    void window.caulder.life.shield(true).catch(() => undefined);
    return () => {
      void window.caulder.life.shield(false).catch(() => undefined);
    };
  }, []);

  const loadPlan = useCallback(
    async (which: LookBackSpan) => {
      const ask = ++asked.current;
      setPlanning(true);
      setPlanError(null);
      try {
        const next = await window.caulder.life.lookBackPlan(companyId, which);
        if (ask === asked.current) setPlan(next);
      } catch (cause) {
        if (ask === asked.current) setPlanError(messageOf(cause));
      } finally {
        if (ask === asked.current) setPlanning(false);
      }
    },
    [companyId],
  );

  useEffect(() => {
    void loadPlan(span);
  }, [loadPlan, span]);

  function pickSpan(next: LookBackSpan) {
    if (next === span) return;
    setReading(null);
    setError(null);
    setSpan(next);
  }

  async function read(via: "local" | "away") {
    if (busy) return;
    const typed = confirm;
    setConfirm("");
    setBusy(via);
    setError(null);
    try {
      const input =
        via === "local" || plan?.away?.onThisComputer
          ? { span, via }
          : plan?.passcode
            ? { span, via, passcode: typed }
            : { span, via, confirm: typed };
      setReading(await window.caulder.life.lookBack(companyId, input));
      setAwayOpen(false);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  function readAgain() {
    if (!reading) return;
    const via = reading.via;
    setReading(null);
    setError(null);
    // Sent away, it is a decision each time: back to the passcode.
    if (via === "local" || plan?.away?.onThisComputer) void read(via);
    else setAwayOpen(true);
  }

  const locked = plan !== null && plan.sealed > 0;
  const nothing = plan !== null && plan.days === 0;
  const blocked = busy !== null || planning || plan === null || locked || nothing;

  return (
    <section className="card lookback" aria-label="Looking back" aria-busy={busy !== null || planning}>
      <header className="lookback__head">
        <h2 className="lookback__title">
          <History size={16} aria-hidden />
          Looking back
        </h2>
        <button type="button" className="btn btn--sm btn--ghost btn--icon" aria-label="Close" onClick={onClose}>
          <X size={16} aria-hidden />
        </button>
      </header>
      <p className="card__hint lookback__lede">A reading of your journal: how you have changed, what kept coming up, what went well.</p>

      <Chips value={span} options={SPAN_OPTIONS} onChange={pickSpan} aria-label="How far back" disabled={busy !== null} />

      <ErrorLine>{planError}</ErrorLine>

      {plan && (
        <>
          <Numbers plan={plan} />

          {locked && (
            <Unlock
              sealed={plan.sealed}
              onOpened={(state) => {
                onUnlocked?.(state);
                void loadPlan(span);
              }}
            />
          )}

          {reading ? (
            <Reading reading={reading} onAgain={readAgain} onClose={onClose} busy={busy !== null} />
          ) : (
            !nothing && (
              <div className="lookback__where">
                <h3 className="lookback__subtitle">Where it is read</h3>
                <Local
                  local={plan.local}
                  disabled={blocked}
                  busy={busy !== null}
                  planning={planning}
                  onRead={() => void read("local")}
                  onLookAgain={() => void loadPlan(span)}
                  onChanged={(local) => setPlan((current) => (current ? { ...current, local } : current))}
                />
                {plan.away &&
                  (awayOpen ? (
                    <Away
                      plan={plan}
                      away={plan.away}
                      confirm={confirm}
                      onConfirm={setConfirm}
                      disabled={blocked}
                      onSend={() => void read("away")}
                      onCancel={() => {
                        setAwayOpen(false);
                        setConfirm("");
                      }}
                    />
                  ) : (
                    <div>
                      <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAwayOpen(true)} disabled={busy !== null}>
                        <Send size={13} aria-hidden />
                        Send to {plan.away.service} instead…
                      </button>
                    </div>
                  ))}
              </div>
            )
          )}
        </>
      )}

      {busy && (
        <p className="lookback__busy" role="status">
          {busy === "local" ? "Reading… a model on this computer can take a few minutes." : `Waiting for ${plan?.away?.service ?? "your AI"}…`}
        </p>
      )}
      <ErrorLine>{error}</ErrorLine>
    </section>
  );
}

/** The stretch in numbers, month by month: worked out here, no model needed. */
function Numbers({ plan }: { plan: LookBackPlan }) {
  if (plan.days === 0) {
    return <p className="lookback__empty">Nothing is written in that stretch yet.</p>;
  }
  const most = Math.max(1, ...plan.months.map((month) => month.days));
  const from = plan.from ?? plan.months[0]?.month ?? plan.to;
  return (
    <div className="lookback__numbers">
      <p className="card__hint lookback__summary">
        {plural(plan.days, "day", "days")} written, from {from.length === 7 ? monthLabel(from) : formatDay(from)} to {formatDay(plan.to)}.
      </p>
      <div className="lookback__tableWrap">
        <table className="lookback__table">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Days written</th>
              <th scope="col">Words</th>
              <th scope="col">Mood</th>
              <th scope="col">Tasks done</th>
              <th scope="col">Calls</th>
              <th scope="col">Habits kept</th>
              <th scope="col">Contacts added</th>
            </tr>
          </thead>
          <tbody>
            {plan.months.map((month) => (
              <MonthRow key={month.month} month={month} most={most} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthRow({ month, most }: { month: LookBackMonth; most: number }) {
  return (
    <tr>
      <th scope="row">{monthLabel(month.month)}</th>
      <td>
        <span className="lookback__days">
          <span className="lookback__bar" aria-hidden>
            <span className="lookback__barFill" style={{ width: `${(month.days / most) * 100}%` }} />
          </span>
          {month.days}
        </span>
      </td>
      <td>{numberText(month.words)}</td>
      <td>
        {month.mood === null ? (
          <span className="lookback__none">-</span>
        ) : (
          <span className="lookback__mood" title={`${month.mood} out of 5`}>
            <span className="lookback__moodDots" aria-hidden>
              {[1, 2, 3, 4, 5].map((step) => (
                <span key={step} className={`lookback__dot${step <= Math.round(month.mood ?? 0) ? " lookback__dot--on" : ""}`} />
              ))}
            </span>
            {moodWord(month.mood)}
          </span>
        )}
      </td>
      <td>{month.tasksDone}</td>
      <td>{month.calls}</td>
      <td>{month.habitsKept}</td>
      <td>{month.contactsAdded}</td>
    </tr>
  );
}

/** Locked days in the stretch: the passcode opens them, and a reading of half would say something untrue. */
function Unlock({ sealed, onOpened }: { sealed: number; onOpened: (state: JournalLockState) => void }) {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const typed = passcode;
    setPasscode("");
    try {
      onOpened(await window.caulder.life.unlock(typed));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="journallock lookback__unlock" onSubmit={(event) => void submit(event)} aria-label="Unlock the journal">
      <p className="journallock__words">
        <Lock size={14} aria-hidden className="lookback__inlineIcon" />
        {sealed === 1 ? "1 day in this stretch is locked. Your passcode opens it" : `${sealed} days in this stretch are locked. Your passcode opens them`}{" "}
        for the reading.
      </p>
      <div className="journallock__row">
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          aria-label="Passcode"
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
        />
        <button type="submit" className="btn btn--sm btn--primary" disabled={busy || passcode.length === 0}>
          Unlock
        </button>
      </div>
      <ErrorLine>{error}</ErrorLine>
    </form>
  );
}

/** Ollama on this computer: found and ready, found with nothing to run, or not there yet. */
function Local({
  local,
  disabled,
  busy,
  planning,
  onRead,
  onLookAgain,
  onChanged,
}: {
  local: LocalModel;
  disabled: boolean;
  busy: boolean;
  planning: boolean;
  onRead: () => void;
  onLookAgain: () => void;
  onChanged: (local: LocalModel) => void;
}) {
  const [address, setAddress] = useState(local.address);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setAddress(local.address), [local.address]);

  async function save(input: { address: string; model: string | null }) {
    setSaving(true);
    setError(null);
    try {
      onChanged(await window.caulder.life.setLookBackLocal(input));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  }

  const lookAgain = (
    <button type="button" className="btn btn--sm btn--ghost" onClick={onLookAgain} disabled={busy || planning}>
      <RefreshCw size={13} aria-hidden />
      Look again
    </button>
  );

  return (
    <div className="lookback__choice lookback__choice--local">
      <p className="lookback__choiceTitle">
        <Laptop size={15} aria-hidden />
        On this computer
        <span className="badge badge--accent">Recommended</span>
      </p>

      {local.found && local.models.length > 0 ? (
        <>
          <div className="lookback__model">
            <span className="card__hint">Ollama, on this computer ·</span>
            <Select
              compact
              aria-label="Model"
              value={local.model ?? local.models[0] ?? ""}
              options={local.models.map((model) => ({ value: model, label: model }))}
              onChange={(model) => void save({ address: local.address, model })}
              disabled={busy || saving}
            />
          </div>
          <p className="card__hint">Nothing leaves this computer.</p>
          <div className="actions">
            <button type="button" className="btn btn--sm btn--primary" onClick={onRead} disabled={disabled || saving || !local.model}>
              Read it here
            </button>
          </div>
        </>
      ) : local.found ? (
        <>
          <p className="card__hint">
            Ollama is running, but it has no models yet. In a terminal, run <code className="lookback__code">ollama pull llama3.2</code>, then
            look again.
          </p>
          <div className="actions">{lookAgain}</div>
        </>
      ) : (
        <>
          <p className="card__hint">
            A model on this computer needs Ollama. Install it from ollama.com, then in a terminal run{" "}
            <code className="lookback__code">ollama pull llama3.2</code>.
          </p>
          <p className="card__hint">Caulder looked for it at {local.address} and found nothing there.</p>
          <div className="actions">{lookAgain}</div>
        </>
      )}

      {!(local.found && local.models.length > 0) && (
        <details className="explain lookback__address">
          <summary className="explain__summary">Change the address</summary>
          <form
            className="actions"
            onSubmit={(event) => {
              event.preventDefault();
              void save({ address, model: local.model });
            }}
          >
            <input
              className="input"
              aria-label="Ollama's address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="http://localhost:11434"
              spellCheck={false}
            />
            <button type="submit" className="btn btn--sm" disabled={saving || busy || address.trim() === ""}>
              Save
            </button>
          </form>
        </details>
      )}
      <ErrorLine>{error}</ErrorLine>
    </div>
  );
}

/** The AI connected in Settings: what would be sent, to whom, and the passcode to mean it. */
function Away({
  plan,
  away,
  confirm,
  onConfirm,
  disabled,
  onSend,
  onCancel,
}: {
  plan: LookBackPlan;
  away: NonNullable<LookBackPlan["away"]>;
  confirm: string;
  onConfirm: (value: string) => void;
  disabled: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  const cancel = (
    <button type="button" className="btn btn--sm btn--ghost" onClick={onCancel}>
      Cancel
    </button>
  );

  if (away.onThisComputer) {
    return (
      <div className="lookback__choice">
        <p className="lookback__choiceTitle">
          <Send size={15} aria-hidden />
          {away.service}
        </p>
        <p className="card__hint">This AI is on this computer too.</p>
        <div className="actions">
          <button type="button" className="btn btn--sm btn--primary" onClick={onSend} disabled={disabled}>
            Read it with {away.service}
          </button>
          {cancel}
        </div>
      </div>
    );
  }

  const ready = plan.passcode ? confirm.length > 0 : confirm.trim().toUpperCase() === "SEND";
  return (
    <form
      className="lookback__choice lookback__choice--away"
      aria-label={`Send to ${away.service}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !disabled) onSend();
      }}
    >
      <p className="lookback__choiceTitle">
        <Send size={15} aria-hidden />
        Send to {away.service}
      </p>
      <p className="card__hint card__hint--warn">
        This sends {plural(plan.days, "day", "days")} of your journal - about {Math.max(1, Math.round(plan.characters / 1000))}k characters - to{" "}
        {away.service}. Caulder keeps nothing, but once it is sent it cannot be called back. Private lines never go.
      </p>
      <label className="field">
        <span className="field__label">{plan.passcode ? "Type your passcode to send it" : "Type SEND to send it"}</span>
        <input
          className="input"
          type={plan.passcode ? "password" : "text"}
          autoComplete={plan.passcode ? "current-password" : "off"}
          spellCheck={false}
          value={confirm}
          onChange={(event) => onConfirm(event.target.value)}
          disabled={disabled}
        />
      </label>
      <div className="actions">
        <button type="submit" className="btn btn--sm btn--danger" disabled={disabled || !ready}>
          Send and read
        </button>
        {cancel}
      </div>
    </form>
  );
}

/** The reading itself, and where it went. It is on the screen only. */
function Reading({ reading, onAgain, onClose, busy }: { reading: LookBackReading; onAgain: () => void; onClose: () => void; busy: boolean }) {
  return (
    <div className="lookback__reading anim-spring">
      <Markdown source={reading.text} />
      <p className="lookback__meta">
        Read by {reading.service}
        {reading.model ? ` · ${reading.model}` : ""} · {plural(reading.days, "day", "days")} · {plural(reading.requests, "request", "requests")}
      </p>
      <p className="lookback__meta">
        {reading.via === "away" ? `Sent to ${reading.service}; not kept here.` : "Nothing left this computer, and nothing is kept."}
      </p>
      <div className="actions">
        <button type="button" className="btn btn--sm" onClick={onAgain} disabled={busy}>
          <RefreshCw size={13} aria-hidden />
          Read again
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
