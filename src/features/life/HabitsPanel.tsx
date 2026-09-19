import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, Flame, Pencil, Plus, Trash2 } from "lucide-react";
import { TASK_AREAS, TASK_AREA_LABEL, type TaskArea } from "@shared/domain";
import type { Habit, HabitInput, HabitsOverview } from "@shared/habits";
import { describeWeekdays } from "@shared/life";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorLine } from "@/components/ErrorLine";
import { Select } from "@/components/Select";
import { messageOf } from "@/lib/errors";

/**
 * Habits on Life (PLAN.md, part four): each with its days, its run and its
 * best, how often it has been kept in the last four weeks, and the last
 * twelve weeks as a grid - a filled square for a day kept, an empty one for a
 * day missed, nothing for a day it is not for. Today is where they are
 * ticked; this is where they are made, changed and put away.
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function HabitsPanel({ companyId }: { companyId: string }) {
  const [overview, setOverview] = useState<HabitsOverview | null>(null);
  const [editing, setEditing] = useState<Habit | "new" | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    window.caulder.habits.list(companyId, true).then(setOverview, (cause: unknown) => setError(messageOf(cause)));
  }, [companyId]);
  useEffect(load, [load]);

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      load();
      setEditing(null);
      setConfirm(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!overview) return <ErrorLine>{error}</ErrorLine>;
  const live = overview.habits.filter((habit) => !habit.archived);
  const away = overview.habits.filter((habit) => habit.archived);

  return (
    <>
      <Card
        title="Habits"
        hint="Ticked on Today. A day it is not for never breaks its run, and neither does today before it is over."
        actions={
          editing !== "new" && (
            <button type="button" className="btn btn--sm btn--primary" onClick={() => setEditing("new")}>
              <Plus size={14} aria-hidden />
              Add a habit
            </button>
          )
        }
      >
        {editing === "new" && (
          <HabitForm busy={busy} onCancel={() => setEditing(null)} onSave={(input) => void run(() => window.caulder.habits.add(companyId, input))} />
        )}
        {live.length === 0 && editing !== "new" ? (
          <EmptyState title="No habits yet" body="Something small, most days: read twenty pages, move for half an hour, no phone after ten." />
        ) : (
          <ul className="habitlist" aria-label="Habits">
            {live.map((habit) =>
              editing !== "new" && editing?.id === habit.id ? (
                <li key={habit.id}>
                  <HabitForm
                    habit={habit}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={(input) => void run(() => window.caulder.habits.update(habit.id, input))}
                  />
                </li>
              ) : (
                <li key={habit.id} className="habitlist__row">
                  <div className="habitlist__head">
                    <span className="habitlist__name">{habit.name}</span>
                    {habit.area && <span className="badge badge--neutral">{TASK_AREA_LABEL[habit.area as TaskArea] ?? habit.area}</span>}
                    <span className="habitlist__days">{describeWeekdays(habit.weekdays)}</span>
                    <span className="habitlist__actions">
                      <button type="button" className="btn btn--sm btn--ghost" aria-label={`Change ${habit.name}`} onClick={() => setEditing(habit)}>
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost"
                        aria-label={`Put ${habit.name} away`}
                        title="Off Today, ticks kept"
                        disabled={busy}
                        onClick={() => void run(() => window.caulder.habits.archive(habit.id, true))}
                      >
                        <Archive size={14} aria-hidden />
                      </button>
                    </span>
                  </div>
                  <p className="habitlist__facts">
                    <Flame size={13} aria-hidden /> {habit.streak} in a row, best {habit.best}
                    {habit.rate !== null ? ` · kept ${habit.rate}% of its days in four weeks` : ""}
                  </p>
                  <WeeksGrid habit={habit} />
                </li>
              ),
            )}
          </ul>
        )}
        <ErrorLine>{error}</ErrorLine>
      </Card>

      {away.length > 0 && (
        <Card title="Put away" hint="Off Today, with their ticks kept.">
          <ul className="habitlist" aria-label="Habits put away">
            {away.map((habit) => (
              <li key={habit.id} className="habitlist__head">
                <span className="habitlist__name">{habit.name}</span>
                <span className="habitlist__days">best run {habit.best}</span>
                <span className="habitlist__actions">
                  <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => void run(() => window.caulder.habits.archive(habit.id, false))}>
                    <ArchiveRestore size={14} aria-hidden />
                    Bring back
                  </button>
                  {confirm === habit.id ? (
                    <>
                      <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={() => void run(() => window.caulder.habits.remove(habit.id))}>
                        Delete it and its ticks
                      </button>
                      <button type="button" className="btn btn--sm" onClick={() => setConfirm(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn--sm btn--ghost btn--danger" aria-label={`Delete ${habit.name}`} onClick={() => setConfirm(habit.id)}>
                      <Trash2 size={14} aria-hidden />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

/** Twelve weeks as columns, Monday at the top: kept, missed, or not one of its days. */
function WeeksGrid({ habit }: { habit: Habit }) {
  const kept = habit.weeks.flat().filter((day) => day === true).length;
  const due = habit.weeks.flat().filter((day) => day !== null).length;
  return (
    <div className="weeksgrid" role="img" aria-label={`${habit.name}: kept on ${kept} of its ${due} days in the last twelve weeks`}>
      {habit.weeks.map((week, column) => (
        <span key={column} className="weeksgrid__week">
          {week.map((day, row) => (
            <span
              key={row}
              className={`weeksgrid__day${day === true ? " weeksgrid__day--kept" : day === false ? " weeksgrid__day--missed" : ""}`}
              title={day === null ? undefined : `${DAYS[row]}: ${day ? "kept" : "missed"}`}
            />
          ))}
        </span>
      ))}
    </div>
  );
}

function HabitForm({
  habit,
  busy,
  onSave,
  onCancel,
}: {
  habit?: Habit;
  busy: boolean;
  onSave: (input: HabitInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(habit?.name ?? "");
  const [area, setArea] = useState<string>(habit?.area ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? [1, 2, 3, 4, 5, 6, 7]);

  return (
    <form
      className="habitform anim-spring"
      aria-label={habit ? `Change ${habit.name}` : "A new habit"}
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ name, area: area ? (area as TaskArea) : null, weekdays });
      }}
    >
      <div className="habitform__row">
        <label className="field habitform__name">
          <span className="field__label">Habit</span>
          <input className="input" value={name} maxLength={80} autoFocus placeholder="Read 20 pages" onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="field">
          <span className="field__label">Area</span>
          <Select
            aria-label="Area"
            value={area}
            onChange={setArea}
            options={[{ value: "", label: "None" }, ...TASK_AREAS.map((each) => ({ value: each, label: TASK_AREA_LABEL[each] }))]}
          />
        </div>
      </div>
      <div className="chips" role="group" aria-label="Its days">
        {DAYS.map((label, index) => {
          const day = index + 1;
          const on = weekdays.includes(day);
          return (
            <button
              key={label}
              type="button"
              className={`chip${on ? " chip--on" : ""}`}
              aria-pressed={on}
              onClick={() => setWeekdays((current) => (on ? current.filter((each) => each !== day) : [...current, day].sort()))}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="actions">
        <button type="button" className="btn btn--sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn--sm btn--primary" disabled={busy || name.trim() === "" || weekdays.length === 0}>
          {habit ? "Save" : "Add it"}
        </button>
      </div>
    </form>
  );
}
