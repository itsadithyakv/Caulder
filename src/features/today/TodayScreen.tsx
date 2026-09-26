import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CalendarPlus, MailCheck, Receipt, RefreshCw, Snowflake, Sunrise } from "lucide-react";
import { documentNumber } from "@shared/domain";
import { dateFormatter, formatValue, region, relativeDay } from "@/lib/format";
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
import { SupportAsk } from "./SupportAsk";
import { PulseCard } from "@/features/life/PulseCard";
import { QuickAdd } from "./QuickAdd";
import { AskLine } from "./AskLine";
import { ContextLine } from "./ContextLine";
import { LineModes } from "./LineModes";
import { cueEmber } from "@/features/ember/stage";
import { lineMode, writingMode, type LineMode } from "@shared/ember";
import type { AskState } from "@shared/ask";
import { Aside, ClearDay, Hello } from "./Hello";
import { Remember } from "./Remember";
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
 * The work comes first, because it is what the screen is opened for: hello and
 * the day in two short lines, what you should be doing right now, the one line
 * that takes anything and puts it where it belongs - and then, in the order
 * they need attention, what is late, what is due today, and what is quietly
 * going nowhere. Beside it goes the life half of the day and everything that
 * is nice to see but asks nothing of you: the joke, the memory, the habits to
 * tick, how the week has been, your level.
 *
 * It used to stack all of that above the work - a joke, a memory, a setup
 * card, a box for notes lower down - until on a first run the first overdue
 * task started at the bottom edge of the window. The three sections about the
 * email bridge - a log not back, replies waiting, emails ready - went with the
 * bridge.
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
  /** The task whose row is open as a form, to change what the quick line cannot. */
  const [editing, setEditing] = useState<string | null>(null);
  /**
   * Which line is on the screen, of the three: the one Caulder reads itself,
   * the same line asked of your AI, or a topic whose context goes on the
   * clipboard. The flames switch them, and the choice is kept here rather
   * than in the database because it is a preference of this screen on this
   * machine, like a collapsed section.
   *
   * Which of the two writing flames is a fact about the workspace, not a
   * fourth choice: a personal workspace has no funnel to file anything into.
   */
  const [mode, setMode] = useState<LineMode>(() => remembersMode());
  const writing = writingMode(activeCompany?.kind === "personal");
  const [ai, setAi] = useState<AskState | null>(null);
  useEffect(() => {
    let live = true;
    window.caulder.ask.state().then(
      (state) => live && setAi(state),
      () => live && setAi(null),
    );
    return () => {
      live = false;
    };
  }, []);
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

  async function saveTask(id: string, input: TaskInput) {
    await window.caulder.tasks.update(id, input);
    setEditing(null);
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

  const rowFor = (task: Today["overdue"][number], overdue = false, hide?: { area?: boolean; kind?: boolean; due?: boolean }) =>
    // The form opens where the row was, so the eye does not have to go
    // looking for it at the top of the screen.
    editing === task.id ? (
      <li key={task.id} className="taskedit">
        <TaskForm
          day={today.day}
          task={task}
          busy={busy}
          onSubmit={(input) => saveTask(task.id, input)}
          onCancel={() => setEditing(null)}
        />
      </li>
    ) : (
      <TaskRow
        key={task.id}
        task={task}
        day={today.day}
        busy={busy}
        overdue={overdue}
        {...(hide ? { hide } : {})}
        onOpenLead={onOpenLead}
        onComplete={() =>
          void act(async () => {
            await window.caulder.tasks.complete(task.id);
            // Ember was watching. The last overdue thing gone gets the whole
            // routine; anything else, a cheer.
            cueEmber(overdue && today.overdue.length === 1 ? "cleared" : "done");
          })
        }
        onReschedule={(dueOn) => void act(() => window.caulder.tasks.reschedule(task.id, dueOn))}
        onDelete={() => void act(() => window.caulder.tasks.remove(task.id))}
        onEdit={() => setEditing(task.id)}
        onCall={
          // Not for a contact marked do not contact, as on the contact's own page.
          startCall && task.kind === "call" && task.leadId && !task.leadDoNotContact
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
      <header className="today__head">
        <Hello day={today.day} timezone={timezone} due={due} late={late} />

        {/* The day in one line: which day, and how much of it is waiting. */}
        <p className="today__day">
          <span className="today__date">{longDay(today.day)}</span>
          <TodayTheme companyId={homeId} day={today.day} />
          {due + late > 0 ? (
            <span className="today__summary">{summaryOf(due, late)}</span>
          ) : (
            <ClearDay day={today.day} timezone={timezone} />
          )}
        </p>
      </header>

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
          {mode === "copy" ? (
            <ContextLine
              companyId={companyId}
              writing={writing}
              focusNonce={quickNonce}
              onMode={(next) => rememberMode(setMode, next)}
            />
          ) : mode === "ask" && ai?.connected ? (
            <AskLine
              companyId={companyId}
              focusNonce={quickNonce}
              model={whoAnswers(ai)}
              writing={writing}
              onMode={(next) => rememberMode(setMode, next)}
              onOpenPage={onOpenPage}
              onOpenContact={onOpenLead}
            />
          ) : (
            <>
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
            modes={
              <LineModes
                mode={writing}
                writing={writing}
                mood="resting"
                canAsk={ai?.connected === true}
                onMode={(next) => rememberMode(setMode, next)}
              />
            }
          />
          <button type="button" className="btn btn--sm btn--ghost today__form" onClick={() => setAdding(true)}>
            <CalendarPlus size={15} aria-hidden />
            Full form
          </button>
            </>
          )}
        </section>
      )}

      {/* Whatever was never connected, offered until it is or is waved away -
          in one line under the quick line, so it moves the work down by a
          line and no more. */}
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
                        region(),
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

          {/* Notes at the foot of the work: what the quick line or the capture
              key kept to file later. No box to write in - the line is that -
              and no card at all when there is nothing to file. */}
          <NotesScreen key={`notes-${kept}`} onTasksChanged={reload} onOpenPage={onOpenPage} />
        </div>

        {/* The life half of the day: the half no other screen puts in front of
            you, beside the work rather than above it. What asks something of
            you today - a habit to tick, a line in the journal - comes before
            what is only there to be seen. */}
        <div className="today__side anim-stagger">
          {/* A joke and a memory: nice to have, never in the way of the work. */}
          <div className="today__ambient">
            <Aside day={today.day} timezone={timezone} />
            <Remember day={today.day} onOpenPage={onOpenPage} />
          </div>
          <HabitsCard companyId={homeId ?? companyId} onManage={() => onOpenLife("habits")} onChanged={() => setTicked((n) => n + 1)} />
          <JournalCard key={`journal-${kept}`} companyId={homeId ?? companyId} onOpenJournal={onOpenJournal} />
          <YourWeekCard companyId={homeId ?? companyId} version={kept} onOpenPage={onOpenPage} onOpenLife={() => onOpenLife()} />
          {/* How the weeks have been, from your own history - and what yesterday was, if it was quiet. */}
          <PulseCard companyId={homeId ?? companyId} version={kept + ticked} />
          <LevelStrip companyId={homeId ?? companyId} version={kept + ticked} watch={today} onOpen={() => onOpenLife()} />
        </div>
      </div>

      {/* Caulder is free: now and then, one line at the foot of the day says
          who made it and how to help (part six). Quiet while money is late. */}
      <SupportAsk quiet={today.unpaid.length > 0} />
    </div>
  );
}

/** Who is answering, by the name the service gave its model. */
function whoAnswers(state: AskState): string {
  return state.models.find((option) => option.id === state.model)?.label ?? state.model ?? "The AI";
}

/* Which line was last on the screen. Browser storage can throw - a locked
 * profile, a wiped machine - and a line that does not draw is worse than a
 * line in the wrong mode, so both ways are caught. */
const ASKING = "caulder.today.ask";

function remembersMode(): LineMode {
  try {
    // "on" is what the two-way version of this wrote, and somebody upgrading
    // has one in their browser storage. It meant the AI line, and still does.
    const saved = localStorage.getItem(ASKING);
    return lineMode(saved === "on" ? "ask" : saved);
  } catch {
    return "work";
  }
}

function rememberMode(set: (mode: LineMode) => void, mode: LineMode): void {
  set(mode);
  try {
    localStorage.setItem(ASKING, mode);
  } catch {
    // Not worth a word on the screen: the line still switched.
  }
}

/** "Saturday, 19 September": the day as it is said, built from its parts so it is never the day before. */
function longDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return dateFormatter({ weekday: "long", day: "numeric", month: "long" }).format(
    new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1),
  );
}

/** How much of the day is waiting, in words - late things named first, because they are. */
function summaryOf(due: number, late: number): string {
  const today = due === 1 ? "1 thing to do today" : `${due} things to do today`;
  if (late > 0 && due > 0) return `${today}, and ${late} late`;
  if (late > 0) return late === 1 ? "1 thing is late" : `${late} things are late`;
  return today;
}
