import { useState, type ReactNode } from "react";
import { Check, Phone, Trash2 } from "lucide-react";
import { TASK_AREA_LABEL, TASK_KIND_LABEL, type Task, type TaskArea } from "@shared/domain";
import { describeDue, shiftDay } from "@shared/dates";
import { useOpenRef } from "@/lib/navigate";

/**
 * How long a completed row is held on screen before the parent is told.
 * Matches --dur, so the row has finished leaving by the time the list closes
 * over the gap. Short enough that reduced motion just sees a brief pause.
 */
const LEAVE_MS = 180;

/**
 * One line of work: the tick, the title, and after it in quiet type only what
 * the list around it has not already said.
 *
 * The tick is the primary action and sits first, because the common gesture is
 * "done that". Snoozing is next to it, because the second most common answer
 * to a follow-up is "not today".
 *
 * A row under "Due today", in a group headed "Company", does not also say
 * "Today" and "Company" - that is what `hide` is for, and the list says which.
 * "To do" is never said: it is what a task is unless it is something more.
 * It was a boxed card of three lines per task - an icon and a chip that both
 * said the kind, a dot and a word for the area, the day - and most of that
 * was the heading above it, again.
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
  onCall,
  hide = {},
}: {
  task: Task;
  day: string;
  busy: boolean;
  overdue?: boolean;
  /** What the list already says, so the row does not: its area, its kind, its day. */
  hide?: { area?: boolean; kind?: boolean; due?: boolean };
  onOpenLead: (leadId: string) => void;
  onComplete: () => void;
  onReschedule: (dueOn: string) => void;
  onDelete: () => void;
  /** Given for a call with a contact: opens the prompter, which ticks the task off. */
  onCall?: () => void;
}) {
  const openRef = useOpenRef();

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

  // After the title, in this order, each only when the list has not said it.
  const meta: ReactNode[] = [];
  if (task.priority === "must") {
    // Only the level that changes what you do. Marking "should" on every
    // ordinary row would be a label on everything, which is a label on nothing.
    meta.push(
      <span key="must" className="taskrow__must">
        Has to happen
      </span>,
    );
  }
  if (!hide.kind && task.kind !== "todo") meta.push(<span key="kind">{TASK_KIND_LABEL[task.kind]}</span>);
  if (task.leadId && task.leadName) {
    meta.push(
      <button key="lead" type="button" className="taskrow__lead" onClick={() => onOpenLead(task.leadId as string)}>
        {task.leadName}
      </button>,
    );
  }
  if (task.pageId && task.pageTitle) {
    // A playbook's step says which playbook, and opens it.
    meta.push(
      <button
        key="page"
        type="button"
        className="taskrow__lead taskrow__page"
        onClick={() => openRef({ kind: "page", id: task.pageId as string })}
      >
        from {task.pageTitle}
      </button>,
    );
  }
  if (!hide.area && task.area) meta.push(<span key="area">{areaLabel(task.area)}</span>);
  if (!hide.due) {
    meta.push(
      <span key="due" className={overdue ? "taskrow__due taskrow__due--late" : "taskrow__due"}>
        {describeDue(task.dueOn, day)}
      </span>,
    );
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
        <p className="taskrow__line">
          <span className="taskrow__title">{task.title}</span>
          {meta.length > 0 && <span className="taskrow__meta">{meta}</span>}
        </p>
        {task.notes && <p className="taskrow__notes">{task.notes}</p>}
      </div>

      <div className="taskrow__actions">
        {onCall && (
          <button
            type="button"
            className="btn btn--sm btn--primary taskrow__call"
            onClick={onCall}
            disabled={busy || leaving}
            aria-label={`Call for "${task.title}"`}
          >
            <Phone size={13} aria-hidden />
            Call
          </button>
        )}
        {/* Asked for less than the tick: over the row's end while it is pointed at, not a column kept for them. */}
        <div className="taskrow__more">
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
      </div>
    </li>
  );
}

/** The label for a known area, or the typed text for one that is not. */
function areaLabel(area: string): string {
  return area in TASK_AREA_LABEL ? TASK_AREA_LABEL[area as TaskArea] : area;
}
