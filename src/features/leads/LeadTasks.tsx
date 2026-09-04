import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Undo2 } from "lucide-react";
import { TASK_KIND_LABEL, type Task, type TaskInput } from "@shared/domain";
import { describeDue, shiftDay, today as todayIn } from "@shared/dates";
import { useWorkspace } from "@/lib/workspace";
import { TaskForm } from "@/features/today/TaskForm";

/**
 * The follow-ups on one lead.
 *
 * This is where a next step is usually set: you have just logged a call, and
 * the thing to do now is decide when to call again. Adding it here rather than
 * only from Today is what keeps the going-quiet list from filling up.
 */
export function LeadTasks({
  leadId,
  onTimelineChanged,
}: {
  leadId: string;
  /**
   * Completing a task writes a `task_done` entry on the lead's history, which
   * is rendered by the parent. Without this the entry appears only after
   * navigating away and back, and the screen quietly lies about what happened.
   */
  onTimelineChanged: () => void;
}) {
  const { activeCompany } = useWorkspace();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const day = todayIn(activeCompany?.timezone ?? "UTC");

  const load = useCallback(() => {
    window.caulder.tasks
      .forLead(leadId)
      .then(setTasks)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, [leadId]);

  useEffect(load, [load]);

  const act = useCallback(
    async (run: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await run();
        load();
        onTimelineChanged();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [load, onTimelineChanged],
  );

  async function add(input: TaskInput) {
    if (!activeCompany) return;
    await window.caulder.tasks.create(activeCompany.id, { ...input, leadId });
    setAdding(false);
    load();
  }

  const open = tasks.filter((task) => task.status === "open");
  const done = tasks.filter((task) => task.status === "done");

  return (
    <div className="leadtasks">
      <div className="leadtasks__head">
        <h2 className="card__title">Next steps</h2>
        {!adding && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setAdding(true)}
            disabled={busy}
          >
            <Plus size={14} aria-hidden />
            Add a task
          </button>
        )}
      </div>

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      {adding && (
        <TaskForm
          day={day}
          leadId={leadId}
          busy={busy}
          onSubmit={add}
          onCancel={() => setAdding(false)}
        />
      )}

      {open.length === 0 && !adding && (
        <p className="card__hint">
          Nothing planned. A lead with no next step is how one goes quiet.
        </p>
      )}

      {open.length > 0 && (
        <ul className="tasks">
          {open.map((task) => (
            <li
              key={task.id}
              className={`taskrow${task.dueOn < day ? " taskrow--overdue" : ""}`}
            >
              <button
                type="button"
                className="taskrow__tick"
                onClick={() => void act(() => window.caulder.tasks.complete(task.id))}
                disabled={busy}
                aria-label={`Mark "${task.title}" done`}
              >
                <Check size={14} aria-hidden />
              </button>

              <div className="taskrow__body">
                <div className="taskrow__head">
                  <span className="taskrow__title">{task.title}</span>
                  <span className="badge badge--neutral taskrow__kindLabel">
                    {TASK_KIND_LABEL[task.kind]}
                  </span>
                </div>
                <div className="taskrow__meta">
                  <span
                    className={
                      task.dueOn < day ? "taskrow__due taskrow__due--late" : "taskrow__due"
                    }
                  >
                    {describeDue(task.dueOn, day)}
                  </span>
                </div>
              </div>

              <div className="taskrow__actions">
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() =>
                    void act(() =>
                      window.caulder.tasks.reschedule(task.id, shiftDay(day, 7)),
                    )
                  }
                  disabled={busy}
                >
                  Next week
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <ul className="tasks">
          {done.slice(0, 5).map((task) => (
            <li key={task.id} className="taskrow taskrow--done">
              <button
                type="button"
                className="taskrow__tick"
                onClick={() => void act(() => window.caulder.tasks.reopen(task.id))}
                disabled={busy}
                aria-label={`Reopen "${task.title}"`}
                title="Reopen"
              >
                <Undo2 size={13} aria-hidden />
              </button>
              <div className="taskrow__body">
                <div className="taskrow__head">
                  <span className="taskrow__title">{task.title}</span>
                </div>
              </div>
              <span />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
