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
import type { RouteId } from "@/app/routes";
import { SetupNudge } from "@/features/onboarding/SetupNudge";
import { PulseCard } from "@/features/life/PulseCard";
import { QuickAdd } from "./QuickAdd";
import { useStartCall } from "@/features/calls/CallProvider";
import { describeRenewal } from "@shared/costs";
import { describeDeadline, sectionForDeadline, type Deadline } from "@shared/deadlines";
import type { BrainSectionId } from "@shared/brain";
import { JournalCard } from "@/features/life/JournalCard";
import { HabitsCard } from "@/features/life/HabitsCard";
import { YourWeekCard } from "@/features/life/YourWeekCard";
import { LevelStrip } from "@/features/life/LevelStrip";
import { TodayTheme } from "@/features/life/TodayTheme";

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
  onGoTo,
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
  /** "Go to the calendar", said to the line. */
  onGoTo: (route: RouteId) => void;
  /** Bumped by the A key, to put the cursor in the quick-add line. */
  quickNonce?: number;
}) {
  const { activeCompany, home } = useWorkspace();
  const companyId = activeCompany?.id ?? null;
  // Your own things - the journal, habits, your week, your level - come from
  // home, whichever company is chosen; the work is both, merged by the main process.
  const homeId = home?.id ?? companyId;
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

  const rowFor = (task: Today["overdue"][number], overdue = false, hide?: { area?: boolean; kind?: boolean; due?: boolean }) => (
    <TaskRow
      key={task.id}
      task={task}
      day={today.day}
      busy={busy}
      overdue={overdue}
      {...(hide ? { hide } : {})}
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

  // Deadlines are urgent when one is late or three days off: then they sit
  // with the late things. Otherwise they wait below the day's work - a filing
  // twelve days away is not more pressing than a call due this morning.
  const deadlinesSoon = today.deadlines.some((deadline) => deadline.daysLeft <= 3);
  const late = today.overdue.length + today.unpaid.length + today.deadlines.filter((deadline) => deadline.daysLeft < 0).length;
  const due = today.dueToday.length;

  return (
    <div className="today anim-stagger">
      {/* The day in one line: which day, and how much of it is waiting. */}
      <p className="today__day">
        <span className="today__date">{longDay(today.day)}</span>
        <TodayTheme companyId={homeId} day={today.day} />
        <span className="today__summary">{summaryOf(due, late)}</span>
      </p>

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
        // The line first, the form a click away. Most tasks are one sentence,
        // and the form is for the ones that need a lead attached or a note.
        <section className="card today__quick">
          <QuickAdd
            companyId={companyId}
            timezone={timezone}
            personal={activeCompany?.kind === "personal"}
            focusNonce={quickNonce}
            smart
            homeId={homeId ?? undefined}
            onGo={onGoTo}
            onOpenContact={(leadId, how) => {
              // A call starts the prompter, with their number and the script; anything
              // else opens the contact - at the email composer, when that was the ask.
              if (how === "call" && startCall) return startCall(leadId, { onLogged: reload });
              onOpenLead(leadId);
              if (how === "email") setTimeout(() => document.getElementById("lead-email")?.scrollIntoView({ block: "start" }), 250);
            }}
            onAdded={() => {
              reload();
              setKept((n) => n + 1);
            }}
          />
          <button type="button" className="btn btn--sm btn--ghost today__form" onClick={() => setAdding(true)}>
            <CalendarPlus size={15} aria-hidden />
            Full form
          </button>
        </section>
      )}

      {/* Whatever was never connected, offered until it is or is waved away. */}
      <SetupNudge companyId={companyId} onSetUp={() => onGoTo("setup")} />

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

          {/* Filings, notice dates and expiries, when one is close. A missed one
              costs a fine or a year's renewal. */}
          {today.deadlines.length > 0 && deadlinesSoon && (
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
          {today.dueToday.length > 0 && (
            <Card title="Due today">
              {groupDue(today.dueToday).map((group) => (
                <div key={group.key} className="today__group">
                  <h3 className="today__groupTitle">
                    {group.title} <span className="today__count">{group.tasks.length}</span>
                  </h3>
                  <ul className="tasks">
                    {group.tasks.map((task) => rowFor(task, false, { due: true, [group.by]: true }))}
                  </ul>
                </div>
              ))}
            </Card>
          )}

          {nothingDue && (
            <Card className="today__clear">
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
          {today.deadlines.length > 0 && !deadlinesSoon && (
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
          {today.upcoming.length > 0 && !nothingDue && (
            <Card title="Coming up">
              <ul className="tasks">{today.upcoming.slice(0, 5).map((task) => rowFor(task))}</ul>
            </Card>
          )}

          {/* Notes at the foot of the work: a thought caught by Ctrl+N lands
              beside the day it was had on. */}
          <Card title="Notes">
            <NotesScreen key={`notes-${kept}`} onTasksChanged={reload} onOpenPage={onOpenPage} />
          </Card>
        </div>

        {/* The life half of the day: the half no other screen puts in front of you. */}
        <div className="today__side anim-stagger">
          <LevelStrip companyId={homeId ?? companyId} version={kept + ticked} watch={today} onOpen={() => onOpenLife()} />
          <JournalCard key={`journal-${kept}`} companyId={homeId ?? companyId} onOpenJournal={onOpenJournal} />
          {/* How the weeks have been, from your own history - and what yesterday was, if it was quiet. */}
          <PulseCard companyId={homeId ?? companyId} version={kept + ticked} />
          <HabitsCard companyId={homeId ?? companyId} onManage={() => onOpenLife("habits")} onChanged={() => setTicked((n) => n + 1)} />
          <YourWeekCard companyId={homeId ?? companyId} version={kept} onOpenPage={onOpenPage} onOpenLife={() => onOpenLife()} />
        </div>
      </div>
    </div>
  );
}

/** "Saturday, 19 September": the day as it is said, built from its parts so it is never the day before. */
function longDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1),
  );
}

/** How much of the day is waiting, in words - late things named first, because they are. */
function summaryOf(due: number, late: number): string {
  const today = due === 1 ? "1 thing to do today" : `${due} things to do today`;
  if (late > 0 && due > 0) return `${today}, and ${late} late`;
  if (late > 0) return late === 1 ? "1 thing is late" : `${late} things are late`;
  if (due > 0) return today;
  return "A clear day";
}
