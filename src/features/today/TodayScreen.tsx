import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Mail, Reply, Snowflake, Sunrise, TriangleAlert } from "lucide-react";
import {
  TASK_KINDS,
  TASK_KIND_GROUP,
  type Task,
  type TaskInput,
  type TaskKind,
  type Today,
} from "@shared/domain";
import { describeDue } from "@shared/dates";
import { relativeDay } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace";
import { TaskRow } from "./TaskRow";
import { TaskForm } from "./TaskForm";

/**
 * The home screen, and the reason the app is worth opening.
 *
 * Five sections, in the order they need attention: whether the bridge is out of
 * step, who has replied and is waiting, what is ready to send, what is late,
 * what is due today, and what is quietly going nowhere.
 *
 * A reply outranks an overdue task on purpose. Somebody who has answered is
 * the warmest thing in the app, and a late call still being late tomorrow
 * costs less than leaving a reply unanswered today.
 *
 * Today is rebuilt after every change rather than patched. Completing an
 * overdue call empties one list and can add its lead to another, so
 * recomputing is both simpler and always right.
 */
export function TodayScreen({
  onOpenLead,
  onGoToEmail,
}: {
  onOpenLead: (leadId: string) => void;
  onGoToEmail: () => void;
}) {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!companyId) return;
    window.caulder.today
      .get(companyId)
      .then((next) => {
        setToday(next);
        setError(null);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, [companyId]);

  useEffect(load, [load]);

  const act = useCallback(
    async (run: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await run();
        load();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  async function addTask(input: TaskInput) {
    if (!companyId) return;
    await window.caulder.tasks.create(companyId, input);
    setAdding(false);
    load();
  }

  if (!companyId || !today) return null;

  const nothingDue = today.overdue.length === 0 && today.dueToday.length === 0;

  return (
    <div className="today anim-stagger">
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      {adding ? (
        <section className="card">
          <h2 className="card__title">Add a task</h2>
          <TaskForm
            day={today.day}
            busy={busy}
            onSubmit={addTask}
            onCancel={() => setAdding(false)}
          />
        </section>
      ) : (
        <div className="today__actions">
          <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
            <CalendarPlus size={15} aria-hidden />
            Add a task
          </button>
        </div>
      )}

      {today.syncOverdue && (
        <section className="card card--warn">
          <h2 className="card__title">
            <TriangleAlert size={15} aria-hidden /> A log has not come back yet
          </h2>
          <p className="card__hint">
            An outbox went out {today.lastSyncAt ? "since the last log was read" : "and no log has ever been read"}.
            Until you import the log, the statuses here are the ones Caulder last
            knew, not the ones Google has.
          </p>
          <button type="button" className="btn btn--sm" onClick={onGoToEmail}>
            Import a log
          </button>
        </section>
      )}

      {today.awaitingReply.length > 0 && (
        <section className="card">
          <h2 className="card__title">
            <Reply size={15} aria-hidden /> {today.awaitingReply.length}{" "}
            {today.awaitingReply.length === 1 ? "reply is" : "replies are"} waiting on you
          </h2>
          <p className="card__hint">
            They answered and have heard nothing since. This is the warmest thing
            on the screen.
          </p>
          <ul className="cold">
            {today.awaitingReply.map((reply) => (
              <li key={reply.leadId}>
                <button
                  type="button"
                  className="coldrow"
                  onClick={() => onOpenLead(reply.leadId)}
                >
                  <span className="coldrow__name">{reply.leadName ?? "A lead"}</span>
                  <span className="coldrow__meta">{reply.subject}</span>
                  <span className="coldrow__days">
                    {reply.repliedAt ? relativeDay(reply.repliedAt) : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {today.emailsReady > 0 && (
        <section className="card">
          <h2 className="card__title">
            <Mail size={15} aria-hidden /> {today.emailsReady}{" "}
            {today.emailsReady === 1 ? "email is" : "emails are"} ready to go
          </h2>
          <p className="card__hint">
            Caulder does not send. Export the outbox and let the script pick it up.
          </p>
          <button type="button" className="btn btn--sm btn--primary" onClick={onGoToEmail}>
            Export the outbox
          </button>
        </section>
      )}

      {today.overdue.length > 0 && (
        <section className="card card--alert">
          <h2 className="card__title">
            {today.overdue.length} {today.overdue.length === 1 ? "thing is" : "things are"}{" "}
            overdue
          </h2>
          <p className="card__hint">The oldest first. These were due before today.</p>
          <ul className="tasks">
            {today.overdue.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                day={today.day}
                busy={busy}
                overdue
                onOpenLead={onOpenLead}
                onComplete={() => void act(() => window.caulder.tasks.complete(task.id))}
                onReschedule={(dueOn) =>
                  void act(() => window.caulder.tasks.reschedule(task.id, dueOn))
                }
                onDelete={() => void act(() => window.caulder.tasks.remove(task.id))}
              />
            ))}
          </ul>
        </section>
      )}

      {today.dueToday.length > 0 && (
        <section className="card">
          <h2 className="card__title">Due today</h2>
          <p className="card__hint">
            Grouped by what they are, because calls are made in a batch.
          </p>
          {groupByKind(today.dueToday).map(([kind, tasks]) => (
            <div key={kind} className="today__group">
              <h3 className="today__groupTitle">
                {TASK_KIND_GROUP[kind]} <span className="today__count">{tasks.length}</span>
              </h3>
              <ul className="tasks">
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    day={today.day}
                    busy={busy}
                    onOpenLead={onOpenLead}
                    onComplete={() => void act(() => window.caulder.tasks.complete(task.id))}
                    onReschedule={(dueOn) =>
                      void act(() => window.caulder.tasks.reschedule(task.id, dueOn))
                    }
                    onDelete={() => void act(() => window.caulder.tasks.remove(task.id))}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {nothingDue && (
        <section className="card">
          <div className="empty">
            <Sunrise size={24} className="empty__icon" aria-hidden />
            <p className="empty__title">Nothing is due today</p>
            <p className="empty__body">
              {today.upcoming.length > 0
                ? `Next up: ${today.upcoming[0]?.title} ${describeDue(
                    today.upcoming[0]?.dueOn ?? today.day,
                    today.day,
                  ).toLowerCase()}.`
                : "Add a task, or pick someone up from the list below."}
            </p>
          </div>
        </section>
      )}

      {today.cold.length > 0 && (
        <section className="card">
          <h2 className="card__title">
            <Snowflake size={15} aria-hidden /> Going quiet
          </h2>
          <p className="card__hint">
            Still open, nothing planned, and nothing has happened for{" "}
            {today.coldAfterDays} days or more. This is what a spreadsheet cannot
            tell you.
          </p>
          <ul className="cold">
            {today.cold.slice(0, 12).map((lead) => (
              <li key={lead.id}>
                <button
                  type="button"
                  className="coldrow"
                  onClick={() => onOpenLead(lead.id)}
                >
                  <span className="coldrow__name">{lead.name}</span>
                  <span className="coldrow__meta">
                    {lead.stageName ?? "No stage"}
                    {lead.city ? ` · ${lead.city}` : ""}
                  </span>
                  <span className="coldrow__days">{lead.daysQuiet} days</span>
                </button>
              </li>
            ))}
          </ul>
          {today.cold.length > 12 && (
            <p className="card__hint">
              And {today.cold.length - 12} more. The quietest are shown first.
            </p>
          )}
        </section>
      )}

      {today.upcoming.length > 0 && !nothingDue && (
        <section className="card">
          <h2 className="card__title">Coming up</h2>
          <ul className="tasks">
            {today.upcoming.slice(0, 5).map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                day={today.day}
                busy={busy}
                onOpenLead={onOpenLead}
                onComplete={() => void act(() => window.caulder.tasks.complete(task.id))}
                onReschedule={(dueOn) =>
                  void act(() => window.caulder.tasks.reschedule(task.id, dueOn))
                }
                onDelete={() => void act(() => window.caulder.tasks.remove(task.id))}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Groups the day's tasks by kind, in the order the kinds are declared. */
function groupByKind(tasks: Task[]): [TaskKind, Task[]][] {
  return TASK_KINDS.map(
    (kind) => [kind, tasks.filter((task) => task.kind === kind)] as [TaskKind, Task[]],
  ).filter(([, group]) => group.length > 0);
}
