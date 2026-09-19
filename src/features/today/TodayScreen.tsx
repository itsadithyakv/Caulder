import { useCallback, useState } from "react";
import { CalendarClock, CalendarPlus, MailCheck, Receipt, RefreshCw, Snowflake, Sunrise } from "lucide-react";
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
import { useStartCall } from "@/features/calls/CallProvider";
import { describeRenewal } from "@shared/costs";
import { describeDeadline, sectionForDeadline, type Deadline } from "@shared/deadlines";
import type { BrainSectionId } from "@shared/brain";
import { JournalCard } from "@/features/life/JournalCard";
import { HabitsCard } from "@/features/life/HabitsCard";
import { YourWeekCard } from "@/features/life/YourWeekCard";
import { LevelStrip } from "@/features/life/LevelStrip";

/**
 * The home screen, and the reason the app is worth opening.
 *
 * One line at the top that takes anything and puts it where it belongs. Then,
 * in the order they need attention: what is late, what is due today, and
 * what is quietly going nowhere - and beside it the life half of the day:
 * how it felt, the habits to tick, the exam and the hobbies this week. The three sections about the email bridge -
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
  onOpenPage,
  onOpenSection,
  onOpenJournal,
  onOpenLife,
  quickNonce = 0,
}: {
  onOpenLead: (leadId: string) => void;
  onOpenPage: (pageId: string) => void;
  /** Today's entry, in the journal. */
  onOpenJournal: () => void;
  /** Life, on one of its tabs. */
  onOpenLife: (tab?: "habits") => void;
  /** A filing opens the brain's Tax section, a document its Documents, a person their page in People. */
  onOpenSection: (section: BrainSectionId, focus?: string) => void;
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
  /** Bumped when the line keeps something, so the cards it may have landed in read again. */
  const [kept, setKept] = useState(0);
  /** Bumped by a habit ticked or taken back: nothing else on Today reads habits, but your level does. */
  const [ticked, setTicked] = useState(0);
  const startCall = useStartCall();

  async function addTask(input: TaskInput) {
    if (!companyId) return;
    await window.caulder.tasks.create(companyId, input);
    setAdding(false);
    reload();
  }

  if (!companyId) return null;
  if (!today) return <ErrorLine>{error}</ErrorLine>;

  // A filing due today is something due today, whatever the task lists say.
  const nothingDue =
    today.overdue.length === 0 &&
    today.dueToday.length === 0 &&
    !today.deadlines.some((deadline) => deadline.daysLeft <= 0);

  /** Where a deadline lives: its page, or the section that holds it - with the person open, for a person. */
  const openDeadline = (deadline: Deadline) =>
    deadline.source === "page"
      ? onOpenPage(deadline.id)
      : onOpenSection(sectionForDeadline(deadline.source), deadline.source === "person" ? deadline.id : undefined);

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
      onCall={
        startCall && task.kind === "call" && task.leadId
          ? () => startCall(task.leadId as string, { taskId: task.id, onLogged: reload })
          : undefined
      }
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
            smart
            onAdded={() => {
              reload();
              setKept((n) => n + 1);
            }}
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

          {/* What the company pays for, before it lapses. A domain that
              expires takes the email with it. */}
          {today.renewals.length > 0 && (
            <Card
              tone={today.renewals.some((renewal) => renewal.daysLeft < 0) ? "alert" : undefined}
              icon={<RefreshCw size={15} aria-hidden />}
              title={today.renewals.length === 1 ? "1 thing to pay for" : `${today.renewals.length} things to pay for`}
            >
              <ul className="cold" aria-label="Renewing soon">
                {today.renewals.map((renewal) => (
                  <li key={renewal.pageId} className="renewrow">
                    <button type="button" className="coldrow" onClick={() => onOpenPage(renewal.pageId)}>
                      <span className="coldrow__name">{renewal.title}</span>
                      <span className="coldrow__meta">
                        {renewal.amount !== null && renewal.amount > 0
                          ? formatValue(renewal.amount, activeCompany?.currency)
                          : "Not priced"}
                      </span>
                      <span className={`coldrow__days${renewal.daysLeft < 0 ? " renewrow__late" : ""}`}>
                        {describeRenewal(renewal, today.day)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => void act(() => window.caulder.costs.renew(companyId, renewal.pageId))}
                      disabled={busy}
                      aria-label={`${renewal.title} is paid`}
                      title="Records the payment on Money and moves the date on"
                    >
                      Paid
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Filings, notice dates and expiries. A missed one costs a fine or
              a year's renewal, so they sit with the money, above the tasks. */}
          {today.deadlines.length > 0 && (
            <Card
              tone={today.deadlines.some((deadline) => deadline.daysLeft < 0) ? "alert" : undefined}
              icon={<CalendarClock size={15} aria-hidden />}
              title={today.deadlines.length === 1 ? "1 deadline" : `${today.deadlines.length} deadlines`}
            >
              <ul className="cold" aria-label="Deadlines">
                {today.deadlines.map((deadline) => (
                  <li key={deadline.key} className="renewrow">
                    <button type="button" className="coldrow" onClick={() => openDeadline(deadline)}>
                      <span className="coldrow__name">{deadline.title}</span>
                      <span className="coldrow__meta">
                        {deadline.period ? `For ${deadline.period}` : deadline.what}
                        {deadline.amount !== null && deadline.amount > 0
                          ? ` · ${formatValue(deadline.amount, activeCompany?.currency)}`
                          : ""}
                      </span>
                      <span className={`coldrow__days${deadline.daysLeft < 0 ? " renewrow__late" : ""}`}>
                        {describeDeadline(deadline)}
                      </span>
                    </button>
                    {deadline.source === "obligation" && (
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => void act(() => window.caulder.deadlines.done(deadline.id, deadline.dueOn))}
                        disabled={busy}
                        aria-label={`${deadline.title}${deadline.period ? ` for ${deadline.period}` : ""} is done`}
                        title="Marks this one done today. The next one comes round on its own."
                      >
                        Done
                      </button>
                    )}
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
          {/* The life half of the day first: it is the half no other screen puts in front of you. */}
          <LevelStrip companyId={companyId} version={kept + ticked} watch={today} onOpen={() => onOpenLife()} />
          <JournalCard key={`journal-${kept}`} companyId={companyId} onOpenJournal={onOpenJournal} />
          <HabitsCard companyId={companyId} onManage={() => onOpenLife("habits")} onChanged={() => setTicked((n) => n + 1)} />
          <YourWeekCard companyId={companyId} version={kept} onOpenPage={onOpenPage} onOpenLife={() => onOpenLife()} />

          {today.replies.length > 0 && (
            <Card
              icon={<MailCheck size={15} aria-hidden />}
              title="Replies"
              hint="To email sent from Caulder, in the last seven days."
            >
              <ul className="cold">
                {today.replies.map((reply) => (
                  <li key={reply.emailId}>
                    <button
                      type="button"
                      className="coldrow"
                      onClick={() => onOpenLead(reply.leadId)}
                    >
                      <span className="coldrow__name">{reply.leadName}</span>
                      <span className="coldrow__meta">Re: {reply.subject}</span>
                      <span className="coldrow__days">{relativeDay(reply.repliedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

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
            <NotesScreen key={`notes-${kept}`} onTasksChanged={reload} onOpenPage={onOpenPage} />
          </Card>
        </div>
      </div>
    </div>
  );
}
