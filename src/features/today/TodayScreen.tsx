import { useCallback, useState } from "react";
import { AtSign, CalendarClock, CalendarPlus, Mail, MailCheck, MessagesSquare, Phone, Receipt, RefreshCw, Send, Snowflake, Sunrise, type LucideIcon } from "lucide-react";
import { documentNumber } from "@shared/domain";
import { formatLongDay, formatValue, region, relativeDay } from "@/lib/format";
import type { Invoice, ReachWay, Task, TaskInput, Today } from "@shared/domain";
import { describeDue, today as todayIn } from "@shared/dates";
import { chaseOffer } from "@shared/chase";
import { ChaseForm } from "@/features/money/ChaseForm";
import { useResource } from "@/lib/resource";
import { NowLine } from "./NowLine";
import { WeekThree } from "./WeekThree";
import { Clashes } from "@/features/day/Clashes";
import { doubleBooked } from "@shared/day";
import { useWorkspace } from "@/lib/workspace";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorLine } from "@/components/ErrorLine";
import { TaskRow } from "./TaskRow";
import { TaskForm } from "./TaskForm";
import { NotesScreen } from "@/features/notes/NotesScreen";
import { groupDue } from "./grouping";
import { ShowMore, useShowing } from "@/lib/showing";
import { saySent } from "@shared/reached";
import type { RouteId } from "@/app/routes";
import { SetupNudge } from "@/features/onboarding/SetupNudge";
import { SupportAsk } from "./SupportAsk";
import { QuickAdd } from "./QuickAdd";
import { Hello } from "./Hello";
import { useStartCall } from "@/features/calls/CallProvider";
import { describeRenewal } from "@shared/costs";
import { describeDeadline, sectionForDeadline, type Deadline } from "@shared/deadlines";
import type { BrainSectionId } from "@shared/brain";

/**
 * The home screen, and the reason the app is worth opening.
 *
 * Two columns, and each answers one question. On the left, **what do I do**:
 * hello and the day in two short lines, what you should be at right now, the
 * one line that takes anything and puts it where it belongs, and then, in
 * the order they need attention, what is late, what is due today and what is
 * coming. On the right, **who do I talk to**: who to reach out to today, who
 * has written back, and who is going quiet - with the notes kept to file
 * later under them.
 *
 * The right-hand column used to be the life half of the day - habits, the
 * journal, a pulse, a level. That half went on 10 October 2026 (PLAN.md,
 * part seven), and the people moved into the room it left: outreach is the
 * work a founder puts off, so it is beside the day rather than under it.
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
const NONE: readonly Task[] = [];

export function TodayScreen({
  onOpenLead,
  onGoToDay,
  onGoToMoney,
  onGoTo,
  onOpenPage,
  onOpenSection,
  quickNonce = 0,
}: {
  onOpenLead: (leadId: string) => void;
  onOpenPage: (pageId: string) => void;
  /** A filing opens the brain's Tax section, a document its Documents, a person their page in People. */
  onOpenSection: (section: BrainSectionId, focus?: string) => void;
  onGoToDay: () => void;
  onGoToMoney: () => void;
  /** "Go to the calendar", said to the line. */
  onGoTo: (route: RouteId) => void;
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
  /** The unpaid invoice a reminder is being written about. */
  const [chasing, setChasing] = useState<Invoice | null>(null);
  /** The task whose row is open as a form, to change what the quick line cannot. */
  const [editing, setEditing] = useState<string | null>(null);
  /** Bumped when the line keeps something, so the cards it may have landed in read again. */
  const [kept, setKept] = useState(0);
  const startCall = useStartCall();
  // Ten late tasks drawn, the rest on a press: a thousand rows froze the window.
  const overdueRows = useShowing(today?.overdue ?? NONE, 10, 50);

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

  /** Where a deadline lives: its page, or the section that holds it. */
  const openDeadline = (deadline: Deadline) =>
    deadline.source === "page"
      ? onOpenPage(deadline.id)
      : onOpenSection(sectionForDeadline(deadline.source));

  const rowFor = (task: Today["overdue"][number], overdue = false, hide?: { kind?: boolean; due?: boolean }) =>
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
        onComplete={() => void act(() => window.caulder.tasks.complete(task.id))}
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
  // Somebody named under Reach out is not named again under Going quiet: one
  // person is one row on the screen, in the list that says what to do. A
  // prospect nobody has written to has not gone quiet; they are still waiting.
  const waiting = new Set(today.reach.next.map((each) => each.id));
  const quiet = today.cold.filter((lead) => !waiting.has(lead.id));

  return (
    <div className="today anim-stagger">
      {/* The day in one line: hello, which day, and how much of it is waiting. */}
      <header className="today__head">
        <p className="today__day">
          <Hello timezone={timezone} />
          <span className="today__date">{formatLongDay(today.day)}</span>
          <span className="today__summary">{due + late > 0 ? summaryOf(due, late) : "Nothing due today."}</span>
        </p>
      </header>

      <NowLine blocks={today.blocks} timezone={timezone} onOpenDay={onGoToDay} />
      <WeekThree companyId={companyId} />
      {/* Two things at once today: said here, where the day is looked at first. */}
      <Clashes clashes={doubleBooked(today.blocks)} onOpen={onGoToDay} />

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
            focusNonce={quickNonce}
            smart
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

      {/* Whatever was never connected, offered until it is or is waved away -
          in one line under the quick line, so it moves the work down by a
          line and no more. */}
      <SetupNudge companyId={companyId} onSetUp={() => onGoTo("setup")} />

      <div className="today__grid">
        <div className="today__work anim-stagger">
          {chasing && (
            <ChaseForm
              invoice={chasing}
              company={activeCompany?.name ?? ""}
              currency={activeCompany?.currency ?? ""}
              day={todayIn(timezone)}
              onClose={() => setChasing(null)}
              onSent={() => {
                setChasing(null);
                reload();
              }}
            />
          )}
          {/* A retainer's invoice, drafted and waiting: looked at and sent from Money, never by itself. */}
          {today.drafted.length > 0 && (
            <Card
              icon={<Receipt size={15} aria-hidden />}
              title={`${today.drafted.length} retainer ${today.drafted.length === 1 ? "invoice is" : "invoices are"} drafted, to look at and send`}
            >
              <ul className="cold">
                {today.drafted.map((invoice) => (
                  <li key={invoice.id}>
                    <button type="button" className="coldrow" onClick={onGoToMoney}>
                      <span className="coldrow__name">
                        {documentNumber("invoice", invoice.number)} · {invoice.leadName}
                      </span>
                      <span className="coldrow__meta">{formatValue(invoice.total, activeCompany?.currency)}</span>
                      <span className="coldrow__days">for {relativeDay(invoice.issuedOn)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
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
                  <li key={invoice.id} className="renewrow">
                    <button type="button" className="coldrow" onClick={onGoToMoney}>
                      <span className="coldrow__name">
                        {documentNumber("invoice", invoice.number)} · {invoice.leadName}
                      </span>
                      <span className="coldrow__meta">
                        {formatValue(invoice.total - invoice.paid, activeCompany?.currency)}
                      </span>
                      <span className="coldrow__days">
                        due {relativeDay(invoice.dueOn)}
                        {invoice.reminded ? ` · reminded ${relativeDay(invoice.reminded.at)}` : ""}
                      </span>
                    </button>
                    {/* Chased from the row it is on: a first reminder, and another a week after the last. */}
                    {(() => {
                      const offer = chaseOffer(invoice, todayIn(timezone));
                      return offer === "first" || offer === "again" ? (
                        <button type="button" className="btn btn--sm" onClick={() => setChasing(invoice)}>
                          {offer === "again" ? "Remind again" : "Send a reminder"}
                        </button>
                      ) : null;
                    })()}
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
              <ul className="tasks">{overdueRows.shown.map((task) => rowFor(task, true))}</ul>
              <ShowMore left={overdueRows.left} step={overdueRows.step} onMore={overdueRows.more} />
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
                    {group.tasks.map((task) => rowFor(task, false, { due: true, kind: true }))}
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

        </div>

        {/* Who to talk to, beside what to do: outreach is the work that gets
            put off, so it is not left for the foot of the page. */}
        <div className="today__side anim-stagger">
          {/* First on this side: the people nobody has written to yet. It is
              the work a founder puts off, so it is said in numbers - who was
              reached today, who is waiting - and each name is one press from
              their page, where every way of writing to them is. */}
          {(today.reach.next.length > 0 || today.reach.today > 0 || today.reach.sent.people > 0) && (
            <Card
              icon={<Send size={15} aria-hidden />}
              title="Reach out"
              hint={[`${reachedSaid(today.reach.today)} today, ${today.reach.week} in the last seven days.`, saySent(today.reach.sent)]
                .filter(Boolean)
                .join(" ")}
            >
              {today.reach.next.length > 0 ? (
                <>
                  <ul className="cold" aria-label="Waiting for a first message">
                    {today.reach.next.map((lead) => (
                      <li key={lead.id}>
                        <button type="button" className="coldrow" onClick={() => onOpenLead(lead.id)}>
                          <span className="coldrow__name">{lead.name}</span>
                          <span className="coldrow__meta">
                            {[lead.person, lead.city].filter(Boolean).join(" · ") || lead.stageName || "No stage"}
                          </span>
                          <span className="coldrow__days reach__ways">
                            {lead.ways.length > 0 ? (
                              lead.ways.map((way) => {
                                const Icon = WAY_ICON[way];
                                return <Icon key={way} size={14} aria-label={WAY_SAID[way]} />;
                              })
                            ) : (
                              <span>no way to reach them yet</span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {today.reach.waiting > today.reach.next.length && (
                    <p className="card__hint">
                      And {today.reach.waiting - today.reach.next.length} more waiting.
                    </p>
                  )}
                </>
              ) : (
                <p className="card__hint">Everybody you are selling to has heard from you at least once.</p>
              )}
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
          {quiet.length > 0 && (
            <Card
              icon={<Snowflake size={15} aria-hidden />}
              title="Going quiet"
              hint={`Still open, nothing planned, and quiet for ${today.coldAfterDays} days or more.`}
            >
              <ul className="cold">
                {quiet.slice(0, 12).map((lead) => (
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
              {quiet.length > 12 && (
                <p className="card__hint">
                  And {quiet.length - 12} more.
                </p>
              )}
            </Card>
          )}
          {/* What the line or the capture key kept to file later. No box to
              write in - the line is that - and no card when there is nothing. */}
          <NotesScreen key={`notes-${kept}`} onTasksChanged={reload} onOpenPage={onOpenPage} />
        </div>
      </div>

      {/* Caulder is free: now and then, one line at the foot of the day says
          who made it and how to help (part six). Quiet while money is late. */}
      <SupportAsk quiet={today.unpaid.length > 0} />
    </div>
  );
}

const WAY_ICON: Record<ReachWay, LucideIcon> = { email: Mail, phone: Phone, linkedin: MessagesSquare, instagram: AtSign };
const WAY_SAID: Record<ReachWay, string> = { email: "Email", phone: "Phone", linkedin: "LinkedIn", instagram: "Instagram" };

/** "Nobody reached", "1 person reached", "4 people reached". */
function reachedSaid(count: number): string {
  return count === 0 ? "Nobody reached" : count === 1 ? "1 person reached" : `${count} people reached`;
}


/** How much of the day is waiting, in words - late things named first, because they are. */
function summaryOf(due: number, late: number): string {
  const today = due === 1 ? "1 thing to do today" : `${due} things to do today`;
  if (late > 0 && due > 0) return `${today}, and ${late} late`;
  if (late > 0) return late === 1 ? "1 thing is late" : `${late} things are late`;
  return today;
}
