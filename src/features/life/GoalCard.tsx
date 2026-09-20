import { useState, type FormEvent } from "react";
import { Check, PartyPopper } from "lucide-react";
import { TASK_AREA_LABEL, type TaskArea } from "@shared/domain";
import { describeDue } from "@shared/dates";
import { daysInWords, type GoalDetail } from "@shared/goals";
import { ErrorLine } from "@/components/ErrorLine";
import { formatDay } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { GoalChart } from "./GoalChart";

/**
 * One goal, kept up with in a press: how it is doing against its day in a
 * word ("2 weeks ahead"), the line it has drawn, and the ways to move it -
 * "+1" for the everyday case, *Update* to add some or say where it stands now
 * with a word about it, and the last check-in taken back if it was a slip.
 * Reached, it asks to be marked so, which is what counts it towards your
 * level.
 */

const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** The word for how a goal is doing, and what it is for the colour. */
function standing(goal: GoalDetail): { words: string; tone: "good" | "warn" | "quiet" } | null {
  const pace = goal.pace;
  if (goal.done) return { words: "Done", tone: "good" };
  if (goal.reached) return { words: "Reached", tone: "good" };
  if (!pace) return null;
  switch (pace.status) {
    case "ahead":
      return { words: `${daysInWords(pace.aheadDays)} ahead`, tone: "good" };
    case "behind":
      return { words: `${daysInWords(pace.aheadDays)} behind`, tone: "warn" };
    case "on-pace":
      return { words: "On pace", tone: "good" };
    case "not-moving":
      return { words: "Not started", tone: "quiet" };
    case "new":
      return { words: "Just set", tone: "quiet" };
    default:
      return null;
  }
}

function inDays(days: number): string {
  if (days < 0) return "passed";
  if (days === 0) return "today";
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

export function GoalCard({
  goal,
  onChanged,
  onOpen,
}: {
  goal: GoalDetail;
  onChanged: (next: GoalDetail) => void;
  onOpen: (pageId: string) => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [how, setHow] = useState<"add" | "set">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unit = goal.unit ?? "";
  // A weight to lose moves down: its everyday press is -1.
  const down = goal.target !== null && goal.target < goal.startValue;
  const step = down ? -1 : 1;
  const said = standing(goal);
  const last = goal.checkins.at(-1) ?? null;

  async function run(work: () => Promise<GoalDetail>) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await work());
      return true;
    } catch (cause) {
      setError(messageOf(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!amount.trim() || !Number.isFinite(value)) {
      setError(how === "add" ? "Say how much to add." : "Say where it stands now.");
      return;
    }
    const input = how === "add" ? { add: value } : { setTo: value };
    const ok = await run(() => window.caulder.life.checkIn(goal.id, note.trim() ? { ...input, note: note.trim() } : input));
    if (ok) {
      setUpdating(false);
      setAmount("");
      setNote("");
    }
  }

  const words = [
    goal.target !== null ? `${format(goal.progress ?? 0)} of ${format(goal.target)}${unit ? ` ${unit}` : ""}` : null,
    goal.byOn && !goal.done ? `by ${formatDay(goal.byOn)} (${inDays(goal.daysLeft ?? 0)})` : null,
    goal.pace?.projectedOn && !goal.done && !goal.reached ? `at this pace, ${formatDay(goal.pace.projectedOn)}` : null,
  ].filter(Boolean);
  const summary = `${goal.title}: ${words.join(", ")}${said ? `. ${said.words}` : ""}.`;

  return (
    <li className={`goalcard${goal.done ? " goalcard--done" : ""}${goal.reached ? " goalcard--reached anim-spring" : ""}`}>
      <div className="goalcard__head">
        <button type="button" className="goalcard__name" onClick={() => onOpen(goal.id)}>
          {goal.done && <Check size={14} aria-hidden />}
          {goal.title}
        </button>
        {goal.area && (
          <span className={`badge badge--neutral area--${goal.area}`}>{TASK_AREA_LABEL[goal.area as TaskArea] ?? goal.area}</span>
        )}
        {said && <span className={`goalcard__standing goalcard__standing--${said.tone}`}>{said.words}</span>}
      </div>

      <p className="goalcard__words">{words.length > 0 ? words.join(" · ") : goal.done ? "Done" : "No number to reach"}</p>

      {/* The line needs more than a day to be a line: from the day after the goal was set. */}
      {goal.target !== null && !goal.done && goal.startedOn < goal.today && <GoalChart goal={goal} summary={summary} />}

      {!goal.done && (
        <div className="goalcard__act">
          {goal.reached ? (
            <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => void run(() => window.caulder.life.goalDone(goal.id, true))}>
              <PartyPopper size={14} aria-hidden />
              Mark it reached
            </button>
          ) : goal.target !== null ? (
            <>
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy}
                onClick={() => void run(() => window.caulder.life.checkIn(goal.id, { add: step }))}
                aria-label={`${down ? "Take 1 off" : "Add 1"}${unit ? ` ${unit}` : ""} to ${goal.title}`}
              >
                {down ? "−1" : "+1"}
                {unit ? ` ${unit}` : ""}
              </button>
              <button type="button" className="btn btn--sm btn--ghost" aria-expanded={updating} onClick={() => setUpdating((open) => !open)}>
                Update
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void run(() => window.caulder.life.goalDone(goal.id, true))}>
              <Check size={14} aria-hidden />
              Mark it done
            </button>
          )}
          {last && (
            <span className="goalcard__last">
              Last: {describeDue(last.day, goal.today).toLowerCase()}
              {last.note ? `, "${last.note}"` : ""}
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                disabled={busy}
                onClick={() => void run(() => window.caulder.life.undoCheckIn(last.id))}
                title="Take the last check-in back"
              >
                Undo
              </button>
            </span>
          )}
        </div>
      )}

      {updating && (
        <form className="goalcard__form anim-menu" onSubmit={(event) => void submit(event)} aria-label={`Update ${goal.title}`}>
          <div className="journalentry__modes" role="radiogroup" aria-label="How">
            {(["add", "set"] as const).map((each) => (
              <button
                key={each}
                type="button"
                role="radio"
                aria-checked={how === each}
                className={`journalentry__mode${how === each ? " journalentry__mode--on" : ""}`}
                onClick={() => setHow(each)}
              >
                {each === "add" ? (down ? "Take off" : "Add") : "Set to"}
              </button>
            ))}
          </div>
          <input
            className="input goalcard__amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={how === "add" ? "1" : format(goal.progress ?? 0)}
            aria-label={how === "add" ? "How much" : "Where it stands now"}
            autoFocus
          />
          {unit && <span className="goalcard__unit">{unit}</span>}
          <input
            className="input goalcard__note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="A word about it, if you like"
            aria-label="A word about it"
            maxLength={200}
          />
          <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>
            Keep it
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setUpdating(false)}>
            Cancel
          </button>
        </form>
      )}
      <ErrorLine>{error}</ErrorLine>
    </li>
  );
}
