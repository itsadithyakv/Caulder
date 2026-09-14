import { useCallback, useState } from "react";
import { CalendarPlus, Receipt, Snowflake, Sunrise } from "lucide-react";
import { documentNumber } from "@shared/domain";
import { formatValue, relativeDay } from "@/lib/format";
import type { TaskInput, Today } from "@shared/domain";
import { describeDue } from "@shared/dates";
import { useResource } from "@/lib/resource";
import { NowLine } from "./NowLine";
import { useWorkspace } from "@/lib/workspace";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorLine } from "@/components/ErrorLine";
import { TaskRow } from "./TaskRow";
import { TaskForm } from "./TaskForm";
import { NotesScreen } from "@/features/notes/NotesScreen";
import { groupDue } from "./grouping";
import { QuickAdd } from "./QuickAdd";

/**
 * The home screen, and the reason the app is worth opening.
 *
 * In the order they need attention: what is late, what is due today, and
 * what is quietly going nowhere. The three sections about the email bridge -
 * a log not back, replies waiting, emails ready - went with the bridge.
 *
 * Every section used to carry a sentence saying why it was there. They are
 * gone: the heading says what the section is, and the reasoning is in
 * reference/features.md for whoever wants it. A home screen is read forty
 * times a week and should not explain itself forty times.
 */
export function TodayScreen({
  onOpenLead,
  onGoToDay,
  onGoToMoney,
  quickNonce = 0,
}: {
  onOpenLead: (leadId: string) => void;
  onGoToDay: () => void;
  onGoToMoney: () => void;
  /** Bumped by the A key, to put the cursor in the quick-add line. */
  quickNonce?: number;
}) {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;
  const timezone = activeCompany?.timezone ?? "UTC";

  const fetchToday = useCallback(
    () => window.caulder.today.get(companyId as string),
    [companyId],
  );
  const { data: today, error, busy, reload, act } = useResource<Today>(
    companyId ? fetchToday : null,
  );
  const [adding, setAdding] = useState(false);

  async function addTask(input: TaskInput) {
    if (!companyId) return;
    await window.caulder.tasks.create(companyId, input);
    setAdding(false);
    reload();
  }

  if (!companyId) return null;
  if (!today) return <ErrorLine>{error}</ErrorLine>;

  const nothingDue = today.overdue.length === 0 && today.dueToday.length === 0;

  const rowFor = (task: Today["overdue"][number], overdue = false) => (
    <TaskRow
      key={task.id}
      task={task}
      day={today.day}
      busy={busy}
      overdue={overdue}
      onOpenLead={onOpenLead}
      onComplete={() => void act(() => window.caulder.tasks.complete(task.id))}
      onReschedule={(dueOn) => void act(() => window.caulder.tasks.reschedule(task.id, dueOn))}
      onDelete={() => void act(() => window.caulder.tasks.remove(task.id))}
    />
  );

  return (
    <div className="today anim-stagger">
      <NowLine blocks={today.blocks} timezone={timezone} onOpenDay={onGoToDay} />

      <ErrorLine>{error}</ErrorLine>

      {adding ? (
        <Card title="Add a task">
          <TaskForm
            day={today.day}
            busy={busy}
            onSubmit={addTask}
            onCancel={() => setAdding(false)}
          />
        </Card>
      ) : (
        // The line first, the form beside it. Most tasks are one sentence,
        // and the form is for the ones that need a lead attached or a note.
        <section className="card today__quick">
          <QuickAdd
            companyId={companyId}
            timezone={timezone}
            personal={activeCompany?.kind === "personal"}
            focusNonce={quickNonce}
            onAdded={reload}
          />
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAdding(true)}>
            <CalendarPlus size={15} aria-hidden />
            Full form
          </button>
        </section>
      )}

      <div className="today__grid">
        <div className="today__work anim-stagger">
          {/* Money that is late is later than a call that is late. */}
          {today.unpaid.length > 0 && (
            <Card
              tone="alert"
              icon={<Receipt size={15} aria-hidden />}
              title={`${today.unpaid.length} ${
                today.unpaid.length === 1 ? "invoice is" : "invoices are"
              } overdue`}
            >
              <ul className="cold">
                {today.unpaid.map((invoice) => (
                  <li key={invoice.id}>
                    <button type="button" className="coldrow" onClick={onGoToMoney}>
                      <span className="coldrow__name">
                        {documentNumber("invoice", invoice.number)} · {invoice.leadName}
                      </span>
                      <span className="coldrow__meta">
                        {formatValue(invoice.total - invoice.paid, activeCompany?.currency)}
                      </span>
                      <span className="coldrow__days">due {relativeDay(invoice.dueOn)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {today.overdue.length > 0 && (
            <Card
              tone="alert"
              title={`${today.overdue.length} ${
                today.overdue.length === 1 ? "thing is" : "things are"
              } overdue`}
            >
              <ul className="tasks">{today.overdue.map((task) => rowFor(task, true))}</ul>
            </Card>
          )}

          {today.dueToday.length > 0 && (
            <Card title="Due today">
              {groupDue(today.dueToday).map((group) => (
                <div key={group.key} className="today__group">
                  <h3 className="today__groupTitle">
                    {group.title} <span className="today__count">{group.tasks.length}</span>
                  </h3>
                  <ul className="tasks">{group.tasks.map((task) => rowFor(task))}</ul>
                </div>
              ))}
            </Card>
          )}

          {nothingDue && (
            <Card>
              <EmptyState
                icon={<Sunrise size={24} className="empty__icon" aria-hidden />}
                title="Nothing is due today"
                body={
                  today.upcoming.length > 0
                    ? `Next up: ${today.upcoming[0]?.title} ${describeDue(
                        today.upcoming[0]?.dueOn ?? today.day,
                        today.day,
                      ).toLowerCase()}.`
                    : today.cold.length > 0
                      ? "Add a task, or pick someone up from Going quiet."
                      : "Type one into the line above, the way you would say it."
                }
              />
            </Card>
          )}

        </div>

        <div className="today__side anim-stagger">
          {today.cold.length > 0 && (
            <Card
              icon={<Snowflake size={15} aria-hidden />}
              title="Going quiet"
              hint={`Still open, nothing planned, and quiet for ${today.coldAfterDays} days or more.`}
            >
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
            </Card>
          )}

          {today.upcoming.length > 0 && !nothingDue && (
            <Card title="Coming up">
              <ul className="tasks">{today.upcoming.slice(0, 5).map((task) => rowFor(task))}</ul>
            </Card>
          )}

          {/* Notes live here rather than on a row of their own: a thought
              caught by Ctrl+N lands beside the day it was had on. */}
          <Card title="Notes">
            <NotesScreen />
          </Card>
        </div>
      </div>
    </div>
  );
}
