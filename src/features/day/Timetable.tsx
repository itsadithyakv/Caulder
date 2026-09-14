import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { BLOCK_KINDS, BLOCK_KIND_LABEL, blockInput } from "@shared/domain";
import { WEEKDAYS, WEEKDAY_LABEL } from "@shared/repeat";
import { shiftDay, weekdayOf } from "@shared/dates";
import { Select } from "@/components/Select";
import { Portal } from "@/components/Portal";
import { messageOf } from "@/lib/errors";

/**
 * A whole timetable, entered once.
 *
 * Six classes as six separate repeat forms is twelve minutes of typing twice a
 * year, and the second semester is the one where somebody gives up and goes
 * back to a paper timetable. This is the week laid out in one place: each row
 * is a class, its days and its time, and one button turns the lot into a term.
 *
 * Each row becomes its own repeat rather than one big one, so afterwards a
 * single lecture can move without disturbing anything else — and "the Tuesday
 * lecture is at ten now" edits that run alone.
 */

type Row = {
  key: string;
  title: string;
  kind: string;
  weekdays: number[];
  startsAt: string;
  minutes: number;
};

const LENGTHS = [30, 45, 60, 90, 120, 180];

function blankRow(day: string): Row {
  return {
    key: Math.random().toString(36).slice(2),
    title: "",
    kind: "class",
    weekdays: [weekdayOf(day)],
    startsAt: "09:00",
    minutes: 60,
  };
}

export function Timetable({
  day,
  onClose,
  onApply,
}: {
  day: string;
  onClose: () => void;
  /** Called once per row. The caller writes them and reloads the day. */
  onApply: (
    rows: { input: ReturnType<typeof blockInput.parse>; }[],
    term: { name: string; fromDay: string; untilDay: string },
  ) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [until, setUntil] = useState(() => shiftDay(day, 7 * 15));
  const [rows, setRows] = useState<Row[]>(() => [blankRow(day)]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function edit(key: string, change: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  }

  async function apply() {
    setError(null);

    const filled = rows.filter((row) => row.title.trim().length > 0);
    if (filled.length === 0) {
      setError("Add at least one thing to the week.");
      return;
    }
    if (filled.some((row) => row.weekdays.length === 0)) {
      setError("Every row needs at least one day.");
      return;
    }
    if (name.trim().length === 0) {
      setError("Give the term a name, so you can tell this timetable from the next one.");
      return;
    }

    const parsed = filled.map((row) => {
      // The repeat starts on the first day of the week that this row actually
      // falls on, not on today - otherwise a Monday class added on a Wednesday
      // would miss its first week.
      const input = blockInput.safeParse({
        day,
        startsAt: row.startsAt,
        minutes: row.minutes,
        title: row.title.trim(),
        kind: row.kind,
        repeat: { weekdays: row.weekdays, until },
      });
      if (!input.success) throw new Error(input.error.issues[0]?.message ?? "That will not save.");
      return { input: input.data };
    });

    setBusy(true);
    try {
      await onApply(parsed, { name: name.trim(), fromDay: day, untilDay: until });
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Portal>
      <div className="modal" role="dialog" aria-modal="true" aria-label="A timetable">
        <form
          className="modal__panel modal__panel--wide anim-modal"
          onSubmit={(event) => {
            event.preventDefault();
            void apply();
          }}
        >
          <h2 className="card__title">Your week</h2>
          <p className="card__hint">
            Put the week in once and it runs to the end of term. Each row becomes its
            own repeat, so a single class can move later without touching the rest.
          </p>

          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}

          <div className="blockform__row">
            <label className="field">
              <span className="field__label">Which term</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Autumn"
              />
            </label>
            <label className="field">
              <span className="field__label">Runs until</span>
              <input
                className="input"
                type="date"
                value={until}
                onChange={(event) => setUntil(event.target.value)}
              />
            </label>
          </div>

          <ul className="timetable">
            {rows.map((row) => (
              <li key={row.key} className="timetable__row">
                <input
                  className="input timetable__title"
                  value={row.title}
                  onChange={(event) => edit(row.key, { title: event.target.value })}
                  placeholder="Databases lecture"
                  aria-label="What it is"
                />

                <div className="repeat__days" role="group" aria-label="Which days">
                  {WEEKDAYS.map((weekday) => {
                    const on = row.weekdays.includes(weekday);
                    return (
                      <button
                        key={weekday}
                        type="button"
                        className={`tab${on ? " tab--on" : ""}`}
                        aria-pressed={on}
                        onClick={() =>
                          edit(row.key, {
                            weekdays: on
                              ? row.weekdays.filter((value) => value !== weekday)
                              : [...row.weekdays, weekday],
                          })
                        }
                      >
                        {WEEKDAY_LABEL[weekday]}
                      </button>
                    );
                  })}
                </div>

                <input
                  className="input timetable__time"
                  type="time"
                  step={900}
                  value={row.startsAt}
                  onChange={(event) => edit(row.key, { startsAt: event.target.value })}
                  aria-label="Starts at"
                />

                <Select
                  compact
                  className="timetable__len"
                  value={String(row.minutes)}
                  onChange={(value) => edit(row.key, { minutes: Number(value) })}
                  aria-label="How long"
                  options={LENGTHS.map((length) => ({
                    value: String(length),
                    label: length < 60 ? `${length}m` : `${length / 60}h`,
                  }))}
                />

                <Select
                  compact
                  className="timetable__kind"
                  value={row.kind}
                  onChange={(value) => edit(row.key, { kind: value })}
                  aria-label="Kind"
                  options={BLOCK_KINDS.map((option) => ({
                    value: option as string,
                    label: BLOCK_KIND_LABEL[option],
                  }))}
                />

                <button
                  type="button"
                  className="btn btn--sm btn--ghost btn--danger"
                  aria-label="Remove this row"
                  onClick={() =>
                    setRows((current) =>
                      current.length === 1
                        ? current
                        : current.filter((entry) => entry.key !== row.key),
                    )
                  }
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          <div className="actions">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setRows((current) => [...current, blankRow(day)])}
            >
              <Plus size={15} aria-hidden />
              Another
            </button>
          </div>

          <div className="modal__actions">
            <span className="modal__spacer" />
            <button type="button" className="btn btn--sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>
              {busy ? "Building" : "Build the term"}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
