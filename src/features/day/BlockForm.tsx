import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { BLOCK_KINDS, BLOCK_KIND_LABEL, blockInput } from "@shared/domain";
import { WEEKDAYS, WEEKDAY_LABEL } from "@shared/repeat";
import { PRIORITIES, PRIORITY_LABEL, priorityOf } from "@shared/priority";
import { REMIND_CHOICES, leadLabel } from "@shared/remind";
import { Chips, Select } from "@/components/Select";
import { shiftDay, weekdayOf } from "@shared/dates";
import type { Block, BlockInput, Task } from "@shared/domain";
import { Portal } from "@/components/Portal";

/**
 * Putting something in an hour, or changing what is already there.
 *
 * The length is offered as a set of ordinary durations rather than an end
 * time. "An hour and a half" is the shape of the decision; working out that
 * 14:00 plus ninety minutes is 15:30 is arithmetic the app should be doing.
 */

const LENGTHS = [15, 30, 45, 60, 90, 120, 180, 240];

/** Short enough to sit in a row of chips: "45m", "1h 30m", "4h". */
const LENGTH_OPTIONS = LENGTHS.map((length) => ({
  value: String(length),
  label:
    length < 60 ? `${length}m` : length % 60 === 0 ? `${length / 60}h` : `${Math.floor(length / 60)}h ${length % 60}m`,
}));

const KIND_OPTIONS = BLOCK_KINDS.map((value) => ({ value, label: BLOCK_KIND_LABEL[value] }));
const PRIORITY_OPTIONS = PRIORITIES.map((value) => ({ value, label: PRIORITY_LABEL[value] }));

type Props = {
  day: string;
  startsAt: string;
  block: Block | null;
  tasks: readonly Task[];
  /**
   * What the workspace does about reminders, so the default option can say
   * what choosing it actually means rather than "default".
   */
  workspaceLead: number | null;
  /** Pre-filled when the block is being made for a particular task. */
  forTask?: Task | null;
  onClose: () => void;
  onSave: (input: BlockInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  /**
   * Marks it as not having happened, or puts that back.
   *
   * The whole of the daily friction, and only offered on a block whose day
   * has come. A block counts as kept unless this is used, which is the
   * bargain: almost nothing to do, and a record that flatters you if you
   * never do it.
   */
  onSkip?: () => Promise<void>;
  /** Offered instead when the block is one of a repeat. */
  onEndSeries?: () => Promise<void>;
  /** A block set aside for a brain page - a course, a hobby - opens it. */
  onOpenPage?: (pageId: string) => void;
};

export function BlockForm({
  day,
  startsAt,
  block,
  tasks,
  workspaceLead,
  forTask,
  onClose,
  onSave,
  onDelete,
  onSkip,
  onEndSeries,
  onOpenPage,
}: Props) {
  const [title, setTitle] = useState(block?.title ?? forTask?.title ?? "");
  const [time, setTime] = useState(block?.startsAt ?? startsAt);
  const [minutes, setMinutes] = useState(block?.minutes ?? 60);
  const [kind, setKind] = useState(block?.kind ?? "focus");
  // Seeded from what this kind of block usually is, so the common case is
  // already right and nobody sets a priority twice a day.
  const [priority, setPriority] = useState<string>(
    () => block?.priority ?? priorityOf(block?.kind ?? "focus", null),
  );
  // A string because a picker's value is one, and because there are three
  // answers here rather than two: follow the workspace, a lead of your own,
  // or never.
  const [remind, setRemind] = useState(() =>
    block?.remindMinutes === null || block?.remindMinutes === undefined
      ? ""
      : String(block.remindMinutes),
  );
  const [taskId, setTaskId] = useState(block?.taskId ?? forTask?.id ?? "");
  const [notes, setNotes] = useState(block?.notes ?? "");
  // Most of a student's week is the same week again, so the repeat is on
  // the form rather than behind a second step. It only appears for a new
  // block: changing the rule of one that already exists means rewriting
  // occurrences somebody may have edited, which is a different feature.
  const [repeats, setRepeats] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([weekdayOf(day)]);
  const [until, setUntil] = useState(() => shiftDay(day, 7 * 12));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Escape closes, and says so was handled, so one press does not also close a
  // menu behind this. The rule the lead form already follows.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = blockInput.safeParse({
      day,
      startsAt: time,
      minutes,
      title,
      kind,
      notes,
      taskId: taskId.length > 0 ? taskId : null,
      priority,
      remindMinutes: remind === "" ? null : Number(remind),
      repeat: repeats && !block ? { weekdays, until } : null,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "That will not save.");
      return;
    }

    setBusy(true);
    try {
      await onSave(parsed.data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Portal>
      <div className="modal" role="dialog" aria-modal="true" aria-label="A block of time">
        <form className="modal__panel anim-modal" onSubmit={(event) => void submit(event)}>
          <h2 className="card__title">{block ? "This block" : "A block of time"}</h2>
          {block?.pageId && onOpenPage && (
            <p className="blockform__page">
              Time for <strong>{block.pageTitle ?? "a page"}</strong>, set aside from the brain.{" "}
              <button type="button" className="linkbtn" onClick={() => onOpenPage(block.pageId as string)}>
                Open the page
              </button>
            </p>
          )}

          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}

          <label className="field">
            <span className="field__label">What</span>
            <input
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Write the January mailshot"
              autoFocus
            />
          </label>

          <div className="blockform__row">
            <label className="field">
              <span className="field__label">Starts</span>
              <input
                className="input"
                type="time"
                step={900}
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </label>

          </div>

          <div className="field">
            <span className="field__label">For</span>
            <Chips
              value={String(minutes)}
              options={
                // A length that is not one of the chips - a block dragged to 50
                // minutes on the grid - is offered as itself rather than lost.
                LENGTHS.includes(minutes)
                  ? LENGTH_OPTIONS
                  : [...LENGTH_OPTIONS, { value: String(minutes), label: `${minutes}m` }]
              }
              onChange={(value) => setMinutes(Number(value))}
              aria-label="How long"
            />
          </div>

          <div className="field">
            <span className="field__label">Kind</span>
            <Chips
              value={kind}
              options={
                (BLOCK_KINDS as readonly string[]).includes(kind)
                  ? KIND_OPTIONS
                  : [...KIND_OPTIONS, { value: kind, label: kind }]
              }
              onChange={(value) => {
                setKind(value);
                // Follows the kind until it is set by hand, which is the only
                // way a default is worth having.
                setPriority(priorityOf(value, null));
              }}
              aria-label="Kind"
            />
          </div>

          <div className="field">
            <span className="field__label">How much it matters</span>
            <Chips
              value={priority}
              options={PRIORITY_OPTIONS}
              onChange={setPriority}
              aria-label="How much it matters"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="block-remind">
              Remind me
            </label>
            <Select
              id="block-remind"
              value={remind}
              onChange={setRemind}
              options={REMIND_CHOICES.map((choice) => ({
                value: choice.value === null ? "" : String(choice.value),
                label:
                  choice.value === null && workspaceLead !== null
                    ? `${choice.label} (${leadLabel(workspaceLead).toLowerCase()})`
                    : choice.label,
              }))}
            />
            {workspaceLead === null && (
              <span className="field__hint">
                Reminders are off for this workspace, so nothing will be said
                whichever of these is chosen. Settings turns them on.
              </span>
            )}
          </div>

          {tasks.length > 0 && (
            <div className="field">
              <label className="field__label" htmlFor="block-task">
                For a task
              </label>
              <Select
                id="block-task"
                value={taskId}
                onChange={setTaskId}
                options={[
                  { value: "", label: "Not about a task" },
                  ...tasks.map((task) => ({ value: task.id, label: task.title })),
                ]}
              />
            </div>
          )}

          {!block && (
            <div className="repeat">
              <label className="checkline">
                <input
                  type="checkbox"
                  className="tickbox"
                  checked={repeats}
                  onChange={(event) => setRepeats(event.target.checked)}
                  aria-label="Repeat this every week"
                />
                <span className="checkline__text">
                  <span className="checkline__title">Repeat it every week</span>
                </span>
              </label>

              {repeats && (
                <>
                  <div className="repeat__days" role="group" aria-label="Which days">
                    {WEEKDAYS.map((weekday) => {
                      const on = weekdays.includes(weekday);
                      return (
                        <button
                          key={weekday}
                          type="button"
                          className={`tab${on ? " tab--on" : ""}`}
                          aria-pressed={on}
                          onClick={() =>
                            setWeekdays((current) =>
                              on
                                ? current.filter((value) => value !== weekday)
                                : [...current, weekday],
                            )
                          }
                        >
                          {WEEKDAY_LABEL[weekday]}
                        </button>
                      );
                    })}
                  </div>

                  <label className="field">
                    <span className="field__label">Until</span>
                    <input
                      className="input"
                      type="date"
                      value={until}
                      onChange={(event) => setUntil(event.target.value)}
                    />
                  </label>

                  <p className="card__hint">
                    Every one is written as its own block, so moving a single week
                    later is just dragging that one.
                  </p>
                </>
              )}
            </div>
          )}

          <label className="field">
            <span className="field__label">Notes</span>
            <textarea
              className="input"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <div className="modal__actions">
            {onDelete && (
              <button
                type="button"
                className="btn btn--sm btn--ghost btn--danger"
                onClick={() => void onDelete()}
              >
                <Trash2 size={15} aria-hidden />
                {onEndSeries ? "Just this one" : "Remove"}
              </button>
            )}
            {onEndSeries && (
              <button
                type="button"
                className="btn btn--sm btn--ghost btn--danger"
                onClick={() => void onEndSeries()}
                title="Leaves the ones already past"
              >
                This and the rest
              </button>
            )}
            {onSkip && (
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => void onSkip()}>
                {block?.outcome === "skipped" ? "It did happen" : "Did not happen"}
              </button>
            )}
            <span className="modal__spacer" />
            <button type="button" className="btn btn--sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>
              {block ? "Save" : "Add it"}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
