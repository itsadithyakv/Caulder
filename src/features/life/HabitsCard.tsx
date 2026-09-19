import { useCallback, useEffect, useState } from "react";
import { Check, Flame, Plus, Repeat } from "lucide-react";
import type { Habit, HabitsOverview } from "@shared/habits";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";

/**
 * Habits on Today (PLAN.md, part four): today's ticked in one press, each with
 * its run of days. The ones not for today are counted, not shown - they are
 * tomorrow's. Adding one is a name and Enter; its days and area are on Life.
 */
export function HabitsCard({
  companyId,
  onManage,
  onChanged,
}: {
  companyId: string;
  onManage: () => void;
  /** A tick made or taken back: your level on Today reads again. */
  onChanged?: () => void;
}) {
  const [overview, setOverview] = useState<HabitsOverview | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    window.caulder.habits.list(companyId).then(setOverview, (cause: unknown) => setError(messageOf(cause)));
  }, [companyId]);
  useEffect(load, [load]);

  async function run(work: () => Promise<HabitsOverview>) {
    setBusy(true);
    setError(null);
    try {
      setOverview(await work());
      onChanged?.();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!overview) return <ErrorLine>{error}</ErrorLine>;

  const today = overview.habits.filter((habit) => habit.dueToday);
  const later = overview.habits.length - today.length;
  const done = today.filter((habit) => habit.doneToday).length;

  return (
    <Card
      icon={<Repeat size={15} aria-hidden />}
      title="Habits"
      actions={
        overview.habits.length > 0 ? (
          <span className="habits__tally">
            {done} of {today.length} today
          </span>
        ) : undefined
      }
    >
      {today.length > 0 && (
        <ul className="habits" aria-label="Today's habits">
          {today.map((habit) => (
            <HabitRow key={habit.id} habit={habit} busy={busy} onTick={(on) => void run(() => window.caulder.habits.tick(habit.id, null, on))} />
          ))}
        </ul>
      )}
      {overview.habits.length === 0 && !adding && (
        <p className="card__hint">What you want to do most days - read, move, no phone after ten - ticked here, with its run of days.</p>
      )}
      {later > 0 && <p className="card__hint">And {later} on other days.</p>}

      {adding ? (
        <form
          className="habits__add"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => window.caulder.habits.add(companyId, { name })).then(() => {
              setName("");
              setAdding(false);
            });
          }}
        >
          <input
            className="input"
            value={name}
            maxLength={80}
            autoFocus
            aria-label="The habit"
            placeholder="Read 20 pages"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setAdding(false);
            }}
          />
          <button type="submit" className="btn btn--sm btn--primary" disabled={busy || name.trim() === ""}>
            Add
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="actions">
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden />
            Add a habit
          </button>
          {overview.habits.length > 0 && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={onManage}>
              Their weeks, on Life
            </button>
          )}
        </div>
      )}
      <ErrorLine>{error}</ErrorLine>
    </Card>
  );
}

function HabitRow({ habit, busy, onTick }: { habit: Habit; busy: boolean; onTick: (on: boolean) => void }) {
  return (
    <li className={`habit${habit.doneToday ? " habit--done" : ""}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={habit.doneToday}
        className="habit__tick"
        disabled={busy}
        onClick={() => onTick(!habit.doneToday)}
      >
        {habit.doneToday && <Check size={14} className="anim-spring-pop" aria-hidden />}
        <span className="visually-hidden">{habit.name}</span>
      </button>
      <span className="habit__name" aria-hidden>
        {habit.name}
      </span>
      {habit.streak > 0 && (
        <span className="habit__streak" title={`Best run: ${habit.best}`}>
          <Flame size={13} aria-hidden />
          {habit.streak}
          <span className="visually-hidden"> {habit.streak === 1 ? "day" : "days"} in a row</span>
        </span>
      )}
    </li>
  );
}
