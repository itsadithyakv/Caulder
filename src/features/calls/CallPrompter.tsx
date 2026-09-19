import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, FilePlus2, PenLine, Phone, PhoneOff, Timer, X } from "lucide-react";
import {
  CALL_OUTCOME_LABEL,
  CALL_TONES,
  CALL_TONE_HINT,
  CALL_TONE_LABEL,
  INTEREST_LABEL,
  parseScript,
  type CallAnswer,
  type CallContext,
  type CallTone,
  type ScriptContext,
} from "@shared/calls";
import { today as todayIn } from "@shared/dates";
import { Portal } from "@/components/Portal";
import { Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { StageBadge } from "@/features/leads/StageBadge";
import { formatValue, relativeDay } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { useWorkspace } from "@/lib/workspace";
import { ScriptView } from "./ScriptView";
import { CallWrapUp, type WrapUp } from "./CallWrapUp";

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The call prompter.
 *
 * Across the top, who and how to reach them, and a clock. On the left what to
 * keep in mind: the contact's notes, its deals, the last few calls. On the
 * right the script, filled in for this contact. Along the bottom, notes.
 * Ending the call turns the same window into the wrap-up, so nothing typed is
 * lost on the way.
 */
export function CallPrompter({
  leadId,
  taskId,
  onClose,
  onLogged,
  onOpenPage,
}: {
  leadId: string;
  taskId: string | null;
  onClose: () => void;
  onLogged: () => void;
  onOpenPage: (pageId: string) => void;
}) {
  const { activeCompany } = useWorkspace();
  const [context, setContext] = useState<CallContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scriptId, setScriptId] = useState("");
  const [dealId, setDealId] = useState("");
  const [choosingTone, setChoosingTone] = useState(false);

  const [step, setStep] = useState<"call" | "wrap">("call");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [keepInMind, setKeepInMind] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const seeded = useRef(false);

  const load = useCallback(
    (pick?: string) => {
      window.caulder.calls
        .context(leadId)
        .then((found) => {
          setContext(found);
          if (!seeded.current) {
            seeded.current = true;
            setKeepInMind(found.lead.notes ?? "");
          }
          setScriptId((current) => {
            if (pick) return pick;
            if (found.scripts.some((script) => script.id === current)) return current;
            return found.lastScriptId ?? found.scripts[0]?.id ?? "";
          });
          setDealId((current) =>
            found.deals.some((deal) => deal.id === current) ? current : (found.deals[0]?.id ?? ""),
          );
        })
        .catch((cause: unknown) => setError(messageOf(cause)));
    },
    [leadId],
  );

  useEffect(() => load(), [load]);

  // The clock runs from the first dial until the call is ended.
  useEffect(() => {
    if (startedAt === null || endedAt !== null) return;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, endedAt]);

  const script = context?.scripts.find((candidate) => candidate.id === scriptId) ?? null;
  const parts = useMemo(() => (script ? parseScript(script.body) : []), [script]);

  const fill: ScriptContext | null = context
    ? {
        leadName: context.lead.name,
        leadContact: context.lead.contactPerson,
        leadCity: context.lead.city,
        companyName: context.companyName,
        myName: script?.caller ?? null,
        oneLiner: context.oneLiner,
      }
    : null;

  const answerList: CallAnswer[] = Object.entries(answers)
    .filter(([, answer]) => answer.trim().length > 0)
    .map(([question, answer]) => ({ question, answer: answer.trim() }));

  const typed = notes.trim().length > 0 || answerList.length > 0;
  const seconds = startedAt === null ? null : Math.round(((endedAt ?? tick) - startedAt) / 1000);

  const close = useCallback(() => {
    if (typed || startedAt !== null) setConfirmingClose(true);
    else onClose();
  }, [typed, startedAt, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      if (confirmingClose) setConfirmingClose(false);
      else close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, confirmingClose]);

  function start() {
    setStartedAt((current) => current ?? Date.now());
    setTick(Date.now());
  }

  async function dial(which: "phone" | "alt") {
    setError(null);
    try {
      await window.caulder.calls.dial(leadId, which);
      start();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function copy(number: string) {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("The number could not be copied. Select it and copy it instead.");
    }
  }

  async function startScript(tone: CallTone) {
    if (!context) return;
    setBusy(true);
    setError(null);
    try {
      const made = await window.caulder.calls.startScript(context.lead.companyId, tone);
      setChoosingTone(false);
      load(made.id);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  function hangUp() {
    if (startedAt !== null) setEndedAt(Date.now());
    setStep("wrap");
  }

  async function save(wrap: WrapUp) {
    if (!context) return;
    setBusy(true);
    setError(null);
    try {
      const unchanged = keepInMind.trim() === (context.lead.notes ?? "").trim();
      await window.caulder.calls.log(context.lead.companyId, {
        leadId,
        dealId: dealId || null,
        scriptId: script?.id ?? null,
        taskId,
        outcome: wrap.outcome,
        interest: wrap.interest,
        notes,
        answers: answerList,
        ...(unchanged ? {} : { keepInMind }),
        next: wrap.next,
        ...(wrap.stageId === undefined ? {} : { stageId: wrap.stageId }),
        lossReason: wrap.lossReason,
        startedAt: startedAt === null ? null : new Date(startedAt).toISOString(),
        seconds,
      });
      onLogged();
    } catch (cause) {
      setError(messageOf(cause));
      setBusy(false);
    }
  }

  const lead = context?.lead ?? null;
  const title = lead ? `Call ${lead.name}` : "Call";
  const stageOf = (stageId: string | null) => context?.stages.find((stage) => stage.id === stageId);
  const currency = activeCompany?.currency;

  return (
    <Portal>
      <div className="modal prompter" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__panel prompter__panel anim-modal">
          <header className="prompter__head">
            <div className="prompter__who">
              <span className="prompter__kicker">
                <Phone size={13} aria-hidden />
                {step === "call" ? "On a call with" : "How did it go with"}
              </span>
              <h2 className="prompter__name">{lead?.name ?? "Loading"}</h2>
              {lead && (lead.contactPerson || lead.city) && (
                <span className="prompter__sub">{[lead.contactPerson, lead.city].filter(Boolean).join(" · ")}</span>
              )}
            </div>

            {lead && step === "call" && (
              <div className="prompter__numbers">
                {lead.phone ? (
                  <div className="prompter__number">
                    <span className="prompter__digits">{lead.phone}</span>
                    <button
                      type="button"
                      className="btn btn--sm btn--primary"
                      onClick={() => void dial("phone")}
                      disabled={lead.doNotContact}
                      autoFocus
                    >
                      <Phone size={14} aria-hidden />
                      Dial
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--icon"
                      aria-label="Copy the number"
                      title={copied ? "Copied" : "Copy the number"}
                      onClick={() => void copy(lead.phone ?? "")}
                    >
                      <Copy size={14} aria-hidden />
                    </button>
                  </div>
                ) : (
                  <span className="card__hint">No phone number on this contact.</span>
                )}
                {lead.altPhone && (
                  <div className="prompter__number prompter__number--alt">
                    <span className="prompter__digits">{lead.altPhone}</span>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => void dial("alt")}
                      disabled={lead.doNotContact}
                    >
                      Dial the other number
                    </button>
                  </div>
                )}
                {copied && <span className="prompter__copied" role="status">Copied</span>}
              </div>
            )}

            <div className="prompter__clock">
              <Timer size={15} aria-hidden />
              <span className="prompter__time" aria-label="Time on the call">
                {clock(seconds ?? 0)}
              </span>
              {step === "call" && startedAt === null && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={start}>
                  Start the clock
                </button>
              )}
            </div>

            <button type="button" className="btn btn--sm btn--ghost btn--icon" aria-label="Close" onClick={close}>
              <X size={16} aria-hidden />
            </button>
          </header>

          {lead?.doNotContact && (
            <p className="prompter__warn" role="alert">
              {lead.name} is marked do not contact.
            </p>
          )}

          {confirmingClose && (
            <div className="prompter__confirm anim-spring" role="alert">
              <span>Close without saving? The notes and answers from this call go.</span>
              <button type="button" className="btn btn--sm btn--danger" onClick={onClose}>
                Close anyway
              </button>
              <button type="button" className="btn btn--sm" onClick={() => setConfirmingClose(false)}>
                Keep the call
              </button>
            </div>
          )}

          <ErrorLine>{step === "call" ? error : null}</ErrorLine>

          {!context || !fill ? (
            <div className="prompter__loading">{error ? null : "Getting the call ready"}</div>
          ) : step === "wrap" ? (
            <CallWrapUp
              context={context}
              dealId={dealId}
              day={todayIn(activeCompany?.timezone ?? "UTC")}
              notes={notes}
              onNotes={setNotes}
              keepInMind={keepInMind}
              onKeepInMind={setKeepInMind}
              answers={answerList}
              seconds={seconds}
              busy={busy}
              error={error}
              onBack={() => {
                setEndedAt(null);
                setStep("call");
              }}
              onSave={(wrap) => void save(wrap)}
            />
          ) : (
            <div className="prompter__body">
              <aside className="prompter__context" aria-label="Before you speak">
                <section className="prompter__block">
                  <label className="prompter__label" htmlFor="call-remember">
                    Keep in mind
                  </label>
                  <textarea
                    id="call-remember"
                    className="textarea prompter__remember"
                    value={keepInMind}
                    maxLength={4000}
                    placeholder="Nothing noted yet. Who picks up, when to call, what matters to them."
                    onChange={(event) => setKeepInMind(event.target.value)}
                  />
                </section>

                {context.deals.length > 0 && (
                  <section className="prompter__block">
                    <h3 className="prompter__label">
                      {context.deals.length > 1 ? "Which deal is this about?" : "The deal"}
                    </h3>
                    <ul className="prompter__deals" role={context.deals.length > 1 ? "radiogroup" : undefined}>
                      {context.deals.map((deal) => {
                        const on = deal.id === dealId;
                        const body = (
                          <>
                            <span className="prompter__dealTitle">{deal.title}</span>
                            <span className="prompter__dealMeta">
                              <StageBadge stage={stageOf(deal.stageId)} />
                              {deal.value !== null && <span>{formatValue(deal.value, currency)}</span>}
                            </span>
                          </>
                        );
                        return (
                          <li key={deal.id}>
                            {context.deals.length > 1 ? (
                              <button
                                type="button"
                                role="radio"
                                aria-checked={on}
                                className={`prompter__deal${on ? " prompter__deal--on" : ""}`}
                                onClick={() => setDealId(deal.id)}
                              >
                                {body}
                              </button>
                            ) : (
                              <div className="prompter__deal">{body}</div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                <section className="prompter__block">
                  <h3 className="prompter__label">Last calls</h3>
                  {context.calls.length === 0 ? (
                    <p className="card__hint">
                      {lead?.lastContactedAt
                        ? `No calls from the prompter yet. Last spoke ${relativeDay(lead.lastContactedAt)}.`
                        : "The first call."}
                    </p>
                  ) : (
                    <ul className="prompter__calls">
                      {context.calls.map((call) => (
                        <li key={call.id} className="prompter__call">
                          <span className="prompter__callHead">
                            {CALL_OUTCOME_LABEL[call.outcome]}
                            {call.interest !== null && ` · ${INTEREST_LABEL[call.interest]}`}
                          </span>
                          <span className="prompter__callWhen">{relativeDay(call.createdAt)}</span>
                          {call.notes && <p className="prompter__callNotes">{call.notes}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </aside>

              <section className="prompter__script" aria-label="Script">
                <div className="prompter__scriptBar">
                  {context.scripts.length > 0 && (
                    <Select
                      compact
                      aria-label="Script"
                      value={scriptId}
                      onChange={setScriptId}
                      options={[
                        ...context.scripts.map((option) => ({
                          value: option.id,
                          label: option.tone ? `${option.title} · ${CALL_TONE_LABEL[option.tone]}` : option.title,
                        })),
                        { value: "", label: "No script" },
                      ]}
                    />
                  )}
                  {script && (
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => onOpenPage(script.id)}
                      disabled={typed || startedAt !== null}
                      title={typed || startedAt !== null ? "Finish the call to edit the script" : undefined}
                    >
                      <PenLine size={14} aria-hidden />
                      Edit the script
                    </button>
                  )}
                  {context.scripts.length > 0 && (
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      aria-expanded={choosingTone}
                      onClick={() => setChoosingTone((open) => !open)}
                    >
                      <FilePlus2 size={14} aria-hidden />
                      New script
                    </button>
                  )}
                </div>

                {(context.scripts.length === 0 || choosingTone) && (
                  <div className="tones anim-spring">
                    <p className="tones__lead">
                      {context.scripts.length === 0
                        ? "No call script yet. Start from one of these and make it yours in Brain, under Playbooks."
                        : "Start another script from a tone."}
                    </p>
                    <div className="tones__grid">
                      {CALL_TONES.map((tone) => (
                        <button
                          key={tone}
                          type="button"
                          className="tone"
                          disabled={busy}
                          onClick={() => void startScript(tone)}
                        >
                          <span className="tone__name">{CALL_TONE_LABEL[tone]}</span>
                          <span className="tone__hint">{CALL_TONE_HINT[tone]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {script ? (
                  <ScriptView
                    parts={parts}
                    fill={fill}
                    answers={answers}
                    onAnswer={(question, answer) => setAnswers((current) => ({ ...current, [question]: answer }))}
                  />
                ) : (
                  context.scripts.length > 0 && (
                    <p className="card__hint">No script for this call. Notes below still go on the history.</p>
                  )
                )}
              </section>
            </div>
          )}

          {context && step === "call" && (
            <footer className="prompter__foot">
              <textarea
                className="textarea prompter__notes"
                value={notes}
                maxLength={8000}
                placeholder="Notes as you talk"
                aria-label="Notes as you talk"
                onChange={(event) => setNotes(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    hangUp();
                  }
                }}
              />
              <button type="button" className="btn btn--danger prompter__hangup" onClick={hangUp}>
                <PhoneOff size={16} aria-hidden />
                End the call
              </button>
            </footer>
          )}
        </div>
      </div>
    </Portal>
  );
}
