import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  CALL_OUTCOMES,
  CALL_OUTCOME_LABEL,
  INTEREST_LABEL,
  INTEREST_LEVELS,
  suggestNext,
  suggestStage,
  type CallAnswer,
  type CallContext,
  type CallOutcome,
  type Interest,
} from "@shared/calls";
import { LOSS_REASONS, LOSS_REASON_LABEL } from "@shared/domain";
import { shiftDay } from "@shared/dates";
import { Chips, Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";

export type WrapUp = {
  outcome: CallOutcome;
  interest: Interest | null;
  next: { title: string; dueOn: string } | null;
  /** Undefined leaves the deal where it is. */
  stageId?: string | null;
  lossReason: string | null;
};

type When = "none" | "1" | "2" | "7" | "date";

const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: "none", label: "Nothing planned" },
  { value: "1", label: "Tomorrow" },
  { value: "2", label: "In 2 days" },
  { value: "7", label: "Next week" },
  { value: "date", label: "Pick a date" },
];

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes === 0 ? `${rest} s` : `${minutes} min ${rest} s`;
}

/**
 * Hanging up: how it went, and what that changes.
 *
 * Everything after the outcome is a suggestion worked out from it - the next
 * step, where the deal goes - until somebody changes it, and then it is
 * theirs. Nothing is saved until Save.
 */
export function CallWrapUp({
  context,
  dealId,
  day,
  notes,
  onNotes,
  keepInMind,
  onKeepInMind,
  answers,
  seconds,
  busy,
  error,
  onBack,
  onSave,
}: {
  context: CallContext;
  dealId: string;
  /** Today, in the company's timezone. */
  day: string;
  notes: string;
  onNotes: (notes: string) => void;
  keepInMind: string;
  onKeepInMind: (text: string) => void;
  answers: readonly CallAnswer[];
  seconds: number | null;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSave: (wrap: WrapUp) => void;
}) {
  const { lead, stages } = context;
  const [outcome, setOutcome] = useState<CallOutcome | "">("");
  const [interest, setInterest] = useState<Interest>(3);

  const [when, setWhen] = useState<When | null>(null);
  const [date, setDate] = useState(shiftDay(day, 3));
  const [title, setTitle] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null | undefined>(undefined);
  const [lossReason, setLossReason] = useState<string | null>(null);

  const spoke = outcome === "spoke";
  const deal = context.deals.find((candidate) => candidate.id === dealId) ?? null;

  // What the answers so far suggest; a field somebody has touched keeps their value.
  const suggestion = outcome ? suggestNext(outcome, spoke ? interest : null, lead.name) : null;
  const whenShown: When = when ?? (suggestion ? (String(suggestion.days) as When) : "none");
  const titleShown = title ?? suggestion?.title ?? `Follow up with ${lead.name}`;
  const suggestedStage =
    outcome && deal ? suggestStage(stages, deal.stageId, outcome, spoke ? interest : null) : (deal?.stageId ?? null);
  const stageShown = stage === undefined ? suggestedStage : stage;
  const stageKind = stages.find((candidate) => candidate.id === stageShown)?.kind ?? "open";
  const losing = deal !== null && stageKind === "lost" && stageShown !== deal.stageId;

  function save() {
    if (!outcome) return;
    const dueOn =
      whenShown === "none" ? null : whenShown === "date" ? date : shiftDay(day, Number(whenShown));
    onSave({
      outcome,
      interest: spoke ? interest : null,
      next: dueOn ? { title: titleShown.trim() || `Follow up with ${lead.name}`, dueOn } : null,
      stageId: deal && stageShown !== deal.stageId ? stageShown : undefined,
      lossReason: losing ? lossReason : null,
    });
  }

  return (
    <div className="wrapup">
      <div className="wrapup__main">
        <section className="wrapup__block">
          <h3 className="wrapup__title">How did it go?</h3>
          <Chips
            aria-label="How did it go"
            value={outcome}
            onChange={setOutcome}
            disabled={busy}
            options={CALL_OUTCOMES.map((value) => ({ value, label: CALL_OUTCOME_LABEL[value] }))}
          />
          {seconds !== null && seconds > 0 && (
            <p className="card__hint">{duration(seconds)} on the call.</p>
          )}
        </section>

        {spoke && (
          <section className="wrapup__block anim-spring">
            <label className="wrapup__title" htmlFor="call-interest">
              How interested are they?
            </label>
            <div className={`interest interest--${interest}`}>
              <input
                id="call-interest"
                className="interest__range"
                type="range"
                min={1}
                max={5}
                step={1}
                value={interest}
                disabled={busy}
                aria-valuetext={INTEREST_LABEL[interest]}
                style={{ ["--fill" as string]: `${((interest - 1) / 4) * 100}%` }}
                onChange={(event) => {
                  const level = Number(event.target.value);
                  if (INTEREST_LEVELS.includes(level as Interest)) setInterest(level as Interest);
                }}
              />
              <div className="interest__scale" aria-hidden>
                {INTEREST_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    tabIndex={-1}
                    className={`interest__step${level === interest ? " interest__step--on" : ""}`}
                    onClick={() => setInterest(level)}
                    disabled={busy}
                  >
                    {INTEREST_LABEL[level]}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="wrapup__block">
          <label className="wrapup__title" htmlFor="call-notes">
            Notes from the call
          </label>
          <textarea
            id="call-notes"
            className="textarea wrapup__notes"
            value={notes}
            maxLength={8000}
            disabled={busy}
            placeholder="What was said, what they need, what you promised"
            onChange={(event) => onNotes(event.target.value)}
          />
          {answers.length > 0 && (
            <dl className="wrapup__answers" aria-label="Answers">
              {answers.map((pair) => (
                <div key={pair.question} className="wrapup__answer">
                  <dt>{pair.question}</dt>
                  <dd>{pair.answer}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="wrapup__block">
          <label className="wrapup__title" htmlFor="call-keep">
            Keep in mind next time
          </label>
          <textarea
            id="call-keep"
            className="textarea"
            value={keepInMind}
            maxLength={4000}
            disabled={busy}
            placeholder="Who picks up, the best time to call, what matters to them"
            onChange={(event) => onKeepInMind(event.target.value)}
          />
          <p className="card__hint">This is the contact&apos;s notes; the prompter shows it before every call.</p>
        </section>
      </div>

      <aside className="wrapup__side">
        <section className="wrapup__block">
          <h3 className="wrapup__title">Next step</h3>
          <Chips aria-label="Next step" value={whenShown} onChange={setWhen} disabled={busy} options={WHEN_OPTIONS} />
          {whenShown === "date" && (
            <input
              className="input"
              type="date"
              aria-label="Next step on"
              value={date}
              min={day}
              disabled={busy}
              onChange={(event) => setDate(event.target.value)}
            />
          )}
          {whenShown !== "none" && (
            <input
              className="input"
              aria-label="What happens next"
              value={titleShown}
              maxLength={200}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </section>

        {deal && (
          <section className="wrapup__block">
            <label className="wrapup__title" htmlFor="call-stage">
              Move {context.deals.length > 1 ? deal.title : "the deal"} to
            </label>
            <Select
              id="call-stage"
              value={stageShown ?? ""}
              disabled={busy}
              onChange={(value) => setStage(value === "" ? null : value)}
              options={[
                ...stages.map((option) => ({
                  value: option.id,
                  label: option.id === deal.stageId ? `${option.name} (where it is)` : option.name,
                })),
                { value: "", label: "No stage" },
              ]}
            />
            {losing && (
              <div className="wrapup__why anim-spring">
                <span className="card__hint">Why was it lost?</span>
                <Chips
                  aria-label="Why was it lost"
                  value={lossReason ?? ""}
                  onChange={(value) => setLossReason(value === lossReason ? null : value)}
                  disabled={busy}
                  options={LOSS_REASONS.filter((reason) => reason !== "other").map((reason) => ({
                    value: LOSS_REASON_LABEL[reason],
                    label: LOSS_REASON_LABEL[reason],
                  }))}
                />
              </div>
            )}
          </section>
        )}

        <ErrorLine>{error}</ErrorLine>

        <div className="wrapup__actions">
          <button type="button" className="btn" onClick={onBack} disabled={busy}>
            <ArrowLeft size={15} aria-hidden />
            Back to the call
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={busy || !outcome}>
            Save the call
          </button>
        </div>
        {!outcome && <p className="card__hint">Say how it went to save it.</p>}
      </aside>
    </div>
  );
}
