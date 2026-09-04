import { useState } from "react";
import {
  CalendarClock,
  Check,
  Mail,
  Phone,
  Repeat,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { TASK_KIND_LABEL, type Task, type TaskKind } from "@shared/domain";
import { describeDue, shiftDay } from "@shared/dates";

const ICON: Record<TaskKind, LucideIcon> = {
  call: Phone,
  email: Mail,
  follow_up: Repeat,
  meeting: CalendarClock,
  todo: Check,
};

/**
 * How long a completed row is held on screen before the parent is told.
 * Matches --dur, so the row has finished leaving by the time the list closes
 * over the gap. Short enough that reduced motion just sees a brief pause.
 */
const LEAVE_MS = 180;

/**
 * One line of work.
 *
 * The tick is the primary action and sits first, because the common gesture is
 * "done that". Snoozing is next to it, because the second most common answer
 * to a follow-up is "not today".
 */
export function TaskRow({
  task,
  day,
  busy,
  overdue,
  onOpenLead,
  onComplete,
  onReschedule,
  onDelete,
}: {
  task: Task;
  day: string;
  busy: boolean;
  overdue?: boolean;
  onOpenLead: (leadId: string) => void;
  onComplete: () => void;
  onReschedule: (dueOn: string) => void;
  onDelete: () => void;
}) {
  const Icon = ICON[task.kind];

  // Ticking removes the row, and a row that vanishes mid-click leaves you
  // unsure which one you got. So it leaves on its own first, and the parent
  // is only told once it has gone.
  //
  // A plain timer, not `animationend`: under reduced motion there is no
  // animation and therefore no event, and a tick that silently does nothing
  // is far worse than one that is not animated.
  const [leaving, setLeaving] = useState(false);

  function complete() {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onComplete, LEAVE_MS);
  }

  return (
    <li
      className={`taskrow${overdue ? " taskrow--overdue" : ""}${
        leaving ? " anim-leave" : ""
      }`}
    >
      <button
        type="button"
        className="taskrow__tick"
        onClick={complete}
        disabled={busy || leaving}
        aria-label={`Mark "${task.title}" done`}
        title="Mark done"
      >
        <Check size={14} aria-hidden />
      </button>

      <div className="taskrow__body">
        <div className="taskrow__head">
          <Icon size={13} className="taskrow__kind" aria-hidden />
          <span className="taskrow__title">{task.title}</span>
          <span className="badge badge--neutral taskrow__kindLabel">
            {TASK_KIND_LABEL[task.kind]}
          </span>
        </div>

        <div className="taskrow__meta">
          {task.leadId && task.leadName && (
            <button
              type="button"
              className="taskrow__lead"
              onClick={() => onOpenLead(task.leadId as string)}
            >
              {task.leadName}
            </button>
          )}
          <span className={overdue ? "taskrow__due taskrow__due--late" : "taskrow__due"}>
            {describeDue(task.dueOn, day)}
          </span>
        </div>

        {task.notes && <p className="taskrow__notes">{task.notes}</p>}
      </div>

      <div className="taskrow__actions">
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => onReschedule(shiftDay(day, 1))}
          disabled={busy}
          title="Move to tomorrow"
        >
          Tomorrow
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => onReschedule(shiftDay(day, 7))}
          disabled={busy}
          title="Move a week out"
        >
          Next week
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost btn--danger"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Delete "${task.title}"`}
          title="Delete"
        >
          <Trash2 size={13} aria-hidden />
        </button>
      </div>
    </li>
  );
}
