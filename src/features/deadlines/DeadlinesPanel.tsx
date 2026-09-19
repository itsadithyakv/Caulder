import { useCallback, useId, useState } from "react";
import { CalendarClock, History, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  sectionForDeadline,
  OBLIGATION_KINDS,
  OBLIGATION_KIND_LABEL,
  PERIOD_LABEL,
  PERIOD_SHAPES,
  PRESET_SETS,
  describeDeadline,
  describeRule,
  obligationInput,
  periodOf,
  type Deadline,
  type DeadlinesOverview,
  type DueRule,
  type Obligation,
  type ObligationDone,
  type ObligationInput,
  type ObligationKind,
  type PeriodShape,
  type PresetOffer,
  type PresetSetId,
} from "@shared/deadlines";
import { ENTITY_TYPES, GST_STATUSES, type BrainSectionId } from "@shared/brain";
import { Card } from "@/components/Card";
import { Chips, Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { useResource } from "@/lib/resource";
import { formatDay, formatValue } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * The filing calendar, at the top of the brain's Tax and compliance section.
 *
 * Two lists and a way in. What is coming up - late, or inside its own notice -
 * with a Done for each; then every obligation, with its rule in words and when
 * it is next due. The way in is the presets: a new company ticks the ones that
 * fit and has its year of filings in one press, then edits the dates its
 * accountant says are different.
 */
export function DeadlinesPanel({
  companyId,
  onOpenPage,
  onOpenSection,
  onChanged,
}: {
  companyId: string;
  /** Said after every change, so the rail's count keeps up. */
  onChanged: () => void;
  /** A contract's notice date or a registration's renewal opens its page. */
  onOpenPage: (pageId: string) => void;
  /** A document's expiry opens Documents; a person's date, their page in People. */
  onOpenSection: (section: BrainSectionId, focus?: string) => void;
}) {
  const fetch = useCallback(() => window.caulder.deadlines.overview(companyId), [companyId]);
  const { data, error, setError } = useResource<DeadlinesOverview>(fetch);
  // Every change hands back the whole calendar, which is kept in place of a reload.
  const [fresh, setFresh] = useState<DeadlinesOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"idle" | "adding" | "presets">("idle");
  const [editing, setEditing] = useState<string | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const shown = fresh ?? data;

  async function run(work: () => Promise<DeadlinesOverview>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      setFresh(await work());
      after?.();
      onChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!shown) return <ErrorLine>{error}</ErrorLine>;
  const money = (value: number) => formatValue(value, shown.currency);
  const none = shown.obligations.length === 0;
  // With nothing set up, the presets are the first thing to see.
  const presetsOpen = mode === "presets" || (mode === "idle" && none);

  const openSource = (deadline: Deadline) =>
    deadline.source === "page"
      ? onOpenPage(deadline.id)
      : onOpenSection(sectionForDeadline(deadline.source), deadline.source === "person" ? deadline.id : undefined);

  return (
    <div className="deadlines">
      {shown.deadlines.length > 0 && (
        <Card
          icon={<CalendarClock size={15} aria-hidden />}
          title="Coming up"
          hint="Late, or inside its notice. Contracts, registrations and documents are read from their own dates."
        >
          <ul className="duelist" aria-label="Coming up">
            {shown.deadlines.map((deadline) => (
              <li key={deadline.key} className="duerow">
                {deadline.source === "obligation" ? (
                  <span className="duerow__main">
                    <DeadlineWords deadline={deadline} money={money} />
                  </span>
                ) : (
                  <button type="button" className="duerow__main" onClick={() => openSource(deadline)}>
                    <DeadlineWords deadline={deadline} money={money} />
                  </button>
                )}
                <span className="duerow__when">{formatDay(deadline.dueOn)}</span>
                <span className={`badge badge--${badgeTone(deadline.daysLeft)}`}>{describeDeadline(deadline)}</span>
                {deadline.source === "obligation" && (
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={busy}
                    aria-label={`${deadline.title}${deadline.period ? ` for ${deadline.period}` : ""} is done`}
                    onClick={() => void run(() => window.caulder.deadlines.done(deadline.id, deadline.dueOn))}
                  >
                    Done
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="The filing calendar"
        hint="What the company files and pays, again and again. Every date is a starting point: check them with your accountant."
        actions={
          mode === "idle" &&
          !none && (
            <div className="actions">
              <button type="button" className="btn btn--sm" onClick={() => setMode("presets")}>
                From the presets
              </button>
              <button type="button" className="btn btn--sm btn--primary" onClick={() => setMode("adding")}>
                <Plus size={15} aria-hidden />
                Add a deadline
              </button>
            </div>
          )
        }
      >
        <ErrorLine>{error}</ErrorLine>

        {mode === "adding" && (
          <ObligationForm
            busy={busy}
            onCancel={() => setMode("idle")}
            onSubmit={(input) => run(() => window.caulder.deadlines.create(companyId, input), () => setMode("idle"))}
          />
        )}

        {presetsOpen && (
          <PresetPicker
            overview={shown}
            busy={busy}
            onCancel={none ? undefined : () => setMode("idle")}
            onWriteOwn={() => setMode("adding")}
            onAdd={(ids) => run(() => window.caulder.deadlines.addPresets(companyId, ids), () => setMode("idle"))}
          />
        )}

        {!none && (
          <ul className="duelist duelist--obligations" aria-label="The filing calendar">
            {shown.obligations.map((obligation) =>
              editing === obligation.id ? (
                <li key={obligation.id} className="obligation">
                  <ObligationForm
                    obligation={obligation}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSubmit={(input) =>
                      run(() => window.caulder.deadlines.update(obligation.id, input), () => setEditing(null))
                    }
                  />
                </li>
              ) : (
                <li key={obligation.id} className={`obligation${obligation.active ? "" : " obligation--paused"}`}>
                  <div className="duerow">
                    <span className="duerow__main duerow__main--stack">
                      <span className="duerow__title">{obligation.title}</span>
                      <span className="duerow__what">
                        {OBLIGATION_KIND_LABEL[obligation.kind]} · {describeRule(obligation.rule)}
                        {obligation.amount !== null && obligation.amount > 0 && ` · ${money(obligation.amount)}`}
                      </span>
                      {obligation.lastDone && (
                        <span className="duerow__what">
                          Last done {formatDay(obligation.lastDone.doneOn)}
                          {forPeriod(obligation.period, obligation.lastDone.dueOn)}
                        </span>
                      )}
                    </span>
                    <span className="duerow__when">
                      {!obligation.active
                        ? "Not needed now"
                        : obligation.nextDue
                          ? `Next ${formatDay(obligation.nextDue)}`
                          : "Nothing more to come"}
                    </span>
                    {confirming === obligation.id ? (
                      <span className="detail__confirm">
                        <span className="card__hint">What was done for it goes too.</span>
                        <button
                          type="button"
                          className="btn btn--sm btn--danger"
                          disabled={busy}
                          onClick={() =>
                            void run(() => window.caulder.deadlines.remove(obligation.id), () => setConfirming(null))
                          }
                        >
                          Delete
                        </button>
                        <button type="button" className="btn btn--sm" onClick={() => setConfirming(null)}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <span className="duerow__actions">
                        <button
                          type="button"
                          className="btn btn--sm btn--ghost btn--icon"
                          aria-label={`What was done for ${obligation.title}`}
                          aria-expanded={history === obligation.id}
                          title="What was done, and when"
                          onClick={() => setHistory((open) => (open === obligation.id ? null : obligation.id))}
                        >
                          <History size={14} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--ghost btn--icon"
                          aria-label={`Edit ${obligation.title}`}
                          onClick={() => setEditing(obligation.id)}
                        >
                          <Pencil size={14} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--ghost btn--danger btn--icon"
                          aria-label={`Delete ${obligation.title}`}
                          onClick={() => setConfirming(obligation.id)}
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </span>
                    )}
                  </div>
                  {history === obligation.id && (
                    <DoneHistory
                      key={obligation.lastDone?.dueOn ?? "none"}
                      obligation={obligation}
                      busy={busy}
                      onUndo={(dueOn) => run(() => window.caulder.deadlines.undo(obligation.id, dueOn))}
                    />
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </Card>
    </div>
  );
}

function badgeTone(daysLeft: number): "danger" | "warn" | "neutral" {
  if (daysLeft < 0) return "danger";
  return daysLeft <= 3 ? "warn" : "neutral";
}

function forPeriod(shape: PeriodShape, dueOn: string): string {
  const period = periodOf(shape, dueOn);
  return period ? `, for ${period}` : "";
}

function DeadlineWords({ deadline, money }: { deadline: Deadline; money: (value: number) => string }) {
  return (
    <>
      <span className="duerow__title">{deadline.title}</span>
      <span className="duerow__what">
        {deadline.period ? `${deadline.what} for ${deadline.period}` : deadline.what}
        {deadline.amount !== null && deadline.amount > 0 && ` · ${money(deadline.amount)}`}
      </span>
    </>
  );
}

/** What was done for one obligation, newest first, each with an undo. */
function DoneHistory({
  obligation,
  busy,
  onUndo,
}: {
  obligation: Obligation;
  busy: boolean;
  onUndo: (dueOn: string) => Promise<void>;
}) {
  const fetch = useCallback(() => window.caulder.deadlines.history(obligation.id), [obligation.id]);
  const { data, error, reload } = useResource<ObligationDone[]>(fetch);

  if (!data) return <ErrorLine>{error}</ErrorLine>;
  if (data.length === 0) return <p className="obligation__history card__hint">Nothing marked done yet.</p>;

  return (
    <ul className="obligation__history" aria-label={`What was done for ${obligation.title}`}>
      {data.map((entry) => (
        <li key={entry.id} className="obligation__done">
          <span>
            {periodOf(obligation.period, entry.dueOn) ?? `Due ${formatDay(entry.dueOn)}`}
            <span className="duerow__what"> · done {formatDay(entry.doneOn)}</span>
          </span>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={busy}
            onClick={() => void onUndo(entry.dueOn).then(reload)}
          >
            Not done
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---- Presets ------------------------------------------------------------- */

function defaultPicks(offers: readonly PresetOffer[]): Set<string> {
  return new Set(
    offers.filter((offer) => offer.fits && !offer.preset.optional && !offer.added).map((offer) => offer.preset.id),
  );
}

/** Where the picks came from: the profile's entity type and GST scheme, or what it does not say. */
function profileLine(overview: DeadlinesOverview, set: PresetSetId): string {
  if (set === "generic") return "The shape of a year. Once they are added, set each date to the one your country uses.";
  const entity = ENTITY_TYPES.find((option) => option.value === overview.profile.entityType)?.label;
  const gst = GST_STATUSES.find((option) => option.value === overview.profile.gstStatus)?.label;
  const missing = [entity ? null : "what kind of company this is", gst ? null : "its GST status"].filter(Boolean);
  if (missing.length > 0) {
    return `The company profile does not say ${missing.join(" or ")}, so what depends on it is left for you to pick. Fill it in and these picks follow it.`;
  }
  return `Picked for what the company profile says: ${entity}, GST ${gst?.toLowerCase()}.`;
}

function PresetPicker({
  overview,
  busy,
  onAdd,
  onCancel,
  onWriteOwn,
}: {
  overview: DeadlinesOverview;
  busy: boolean;
  onAdd: (presetIds: string[]) => Promise<void>;
  /** Absent when there is nothing else to show: the picker is the section's way in. */
  onCancel?: () => void;
  onWriteOwn: () => void;
}) {
  const [set, setSet] = useState<PresetSetId>(overview.presetSet);
  const [picked, setPicked] = useState<Set<string>>(() => defaultPicks(overview.offers[overview.presetSet]));
  const [showOthers, setShowOthers] = useState(false);
  const offers = overview.offers[set];

  const groups = [
    { title: "What fits", offers: offers.filter((offer) => offer.fits && !offer.preset.optional) },
    { title: "Only if it applies", offers: offers.filter((offer) => offer.fits && offer.preset.optional) },
  ];
  const others = offers.filter((offer) => !offer.fits);

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const item = (offer: PresetOffer) => (
    <li key={offer.preset.id}>
      <label className={`checkline preset${offer.added ? " preset--added" : ""}`}>
        <input
          type="checkbox"
          className="tickbox"
          checked={offer.added || picked.has(offer.preset.id)}
          disabled={offer.added || busy}
          onChange={() => toggle(offer.preset.id)}
        />
        <span className="preset__body">
          <span className="preset__title">
            {offer.preset.title}
            {offer.added && <span className="badge badge--ok">Added</span>}
          </span>
          <span className="preset__rule">{describeRule(offer.preset.rule)}</span>
          <span className="preset__note">{offer.preset.note}</span>
        </span>
      </label>
    </li>
  );

  return (
    <div className="presets anim-spring" role="group" aria-label="Presets">
      <div className="presets__head">
        <Chips
          aria-label="Where the company is"
          value={set}
          disabled={busy}
          onChange={(next) => {
            setSet(next);
            setPicked(defaultPicks(overview.offers[next]));
            setShowOthers(false);
          }}
          options={PRESET_SETS.map((option) => ({ value: option.id, label: option.label }))}
        />
        <p className="card__hint">{profileLine(overview, set)}</p>
      </div>

      {groups.map(
        (group) =>
          group.offers.length > 0 && (
            <div key={group.title} className="presets__group">
              <h3 className="presets__title">{group.title}</h3>
              <ul className="presets__list">{group.offers.map(item)}</ul>
            </div>
          ),
      )}

      {others.length > 0 && (
        <div className="presets__group">
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            aria-expanded={showOthers}
            onClick={() => setShowOthers((open) => !open)}
          >
            {showOthers ? "Hide the rest" : `For other kinds of company (${others.length})`}
          </button>
          {showOthers && <ul className="presets__list">{others.map(item)}</ul>}
        </div>
      )}

      <div className="leadform__actions">
        <button type="button" className="btn btn--sm btn--ghost" onClick={onWriteOwn} disabled={busy}>
          Write your own instead
        </button>
        {onCancel && (
          <button type="button" className="btn btn--sm" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="btn btn--sm btn--primary"
          disabled={busy || picked.size === 0}
          onClick={() => void onAdd([...picked])}
        >
          {picked.size === 0 ? "Pick some to add" : picked.size === 1 ? "Add 1 deadline" : `Add ${picked.size} deadlines`}
        </button>
      </div>
    </div>
  );
}

/* ---- One obligation, written or changed ----------------------------------- */

const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, index) => ({ value: String(index + 1), label }));

const EVERY_OPTIONS: { value: DueRule["every"]; label: string }[] = [
  { value: "month", label: "Every month" },
  { value: "year", label: "On days each year" },
  { value: "once", label: "Once" },
];

function ObligationForm({
  obligation,
  busy,
  onSubmit,
  onCancel,
}: {
  obligation?: Obligation;
  busy: boolean;
  onSubmit: (input: ObligationInput) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const rule = obligation?.rule;
  const [title, setTitle] = useState(obligation?.title ?? "");
  const [kind, setKind] = useState<ObligationKind>(obligation?.kind ?? "filing");
  const [every, setEvery] = useState<DueRule["every"]>(rule?.every ?? "month");
  const [on, setOn] = useState(rule?.every === "once" ? rule.on : "");
  const [monthDay, setMonthDay] = useState(rule?.every === "month" ? String(rule.day) : "20");
  const [dates, setDates] = useState(
    rule?.every === "year"
      ? rule.dates.map((date) => ({ month: String(date.month), day: String(date.day) }))
      : [{ month: "3", day: "31" }],
  );
  const [period, setPeriod] = useState<PeriodShape>(obligation?.period ?? "none");
  const [remind, setRemind] = useState(String(obligation?.remindDays ?? 7));
  const [amount, setAmount] = useState(obligation?.amount == null ? "" : String(obligation.amount));
  const [notes, setNotes] = useState(obligation?.notes ?? "");
  const [active, setActive] = useState(obligation?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const whenOf = (): unknown => {
    if (every === "once") return { every, on };
    if (every === "month") return { every, day: Number(monthDay) };
    return { every, dates: dates.map((date) => ({ month: Number(date.month), day: Number(date.day) })) };
  };

  return (
    <form
      className="leadform anim-spring"
      aria-label={obligation ? `Edit ${obligation.title}` : "Add a deadline"}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const parsed = obligationInput.safeParse({
          title,
          kind,
          rule: whenOf(),
          period,
          remindDays: Number(remind),
          amount: amount.trim() === "" ? null : Number(amount.replace(/[,\s]/g, "")),
          notes: notes.trim() === "" ? null : notes,
          // What the form does not show is kept as it was.
          startsOn: obligation?.startsOn ?? null,
          endsOn: obligation?.endsOn ?? null,
          pageId: obligation?.pageId ?? null,
          leadId: obligation?.leadId ?? null,
          documentId: obligation?.documentId ?? null,
          active,
        });
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          setError(
            issue?.path[0] === "rule"
              ? "Check when it falls due."
              : issue?.path[0] === "amount"
                ? "The amount is a whole number."
                : (issue?.message ?? "Check the deadline."),
          );
          return;
        }
        void onSubmit(parsed.data);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || busy) return;
        event.preventDefault();
        onCancel();
      }}
      noValidate
    >
      <div className="field">
        <label className="field__label" htmlFor={`${id}-title`}>
          What has to be done
        </label>
        <input
          id={`${id}-title`}
          className="input"
          value={title}
          maxLength={160}
          autoFocus
          disabled={busy}
          placeholder="GSTR-1"
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="field">
        <span className="field__label">Kind</span>
        <Chips
          aria-label="Kind"
          value={kind}
          disabled={busy}
          onChange={setKind}
          options={OBLIGATION_KINDS.map((value) => ({ value, label: OBLIGATION_KIND_LABEL[value] }))}
        />
      </div>

      <div className="field">
        <span className="field__label">When it falls due</span>
        <Chips aria-label="When it falls due" value={every} disabled={busy} onChange={setEvery} options={EVERY_OPTIONS} />
      </div>

      {every === "once" && (
        <div className="field">
          <label className="field__label" htmlFor={`${id}-on`}>
            On
          </label>
          <input
            id={`${id}-on`}
            type="date"
            className="input rule__day"
            value={on}
            disabled={busy}
            onChange={(event) => setOn(event.target.value)}
          />
        </div>
      )}

      {every === "month" && (
        <div className="field">
          <label className="field__label" htmlFor={`${id}-day`}>
            Day of the month
          </label>
          <input
            id={`${id}-day`}
            className="input rule__num"
            inputMode="numeric"
            value={monthDay}
            disabled={busy}
            onChange={(event) => setMonthDay(event.target.value)}
          />
          <span className="field__hint">The 31st falls on the last day of a shorter month.</span>
        </div>
      )}

      {every === "year" && (
        <div className="field">
          <span className="field__label">The days</span>
          <ul className="rule__dates" aria-label="The days">
            {dates.map((date, index) => (
              <li key={index} className="rule__date">
                <Select
                  aria-label={`Month ${index + 1}`}
                  value={date.month}
                  options={MONTH_OPTIONS}
                  disabled={busy}
                  onChange={(month) =>
                    setDates((current) => current.map((each, at) => (at === index ? { ...each, month } : each)))
                  }
                />
                <input
                  className="input rule__num"
                  inputMode="numeric"
                  aria-label={`Day ${index + 1}`}
                  value={date.day}
                  disabled={busy}
                  onChange={(event) =>
                    setDates((current) =>
                      current.map((each, at) => (at === index ? { ...each, day: event.target.value } : each)),
                    )
                  }
                />
                <button
                  type="button"
                  className="btn btn--sm btn--ghost btn--icon"
                  aria-label={`Remove day ${index + 1}`}
                  disabled={busy || dates.length === 1}
                  onClick={() => setDates((current) => current.filter((_, at) => at !== index))}
                >
                  <X size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              disabled={busy || dates.length >= 12}
              onClick={() => setDates((current) => [...current, { month: "1", day: "1" }])}
            >
              <Plus size={14} aria-hidden />
              Add a day
            </button>
          </div>
        </div>
      )}

      <div className="leadform__row">
        <div className="field">
          <span className="field__label">Which period each one is for</span>
          <Select
            aria-label="Which period each one is for"
            value={period}
            disabled={busy}
            onChange={setPeriod}
            options={PERIOD_SHAPES.map((value) => ({ value, label: PERIOD_LABEL[value] }))}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-remind`}>
            Show it on Today this many days before
          </label>
          <input
            id={`${id}-remind`}
            className="input rule__num"
            inputMode="numeric"
            value={remind}
            disabled={busy}
            onChange={(event) => setRemind(event.target.value)}
          />
        </div>
      </div>

      <div className="leadform__row">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-amount`}>
            Usually costs
          </label>
          <input
            id={`${id}-amount`}
            className="input"
            inputMode="numeric"
            value={amount}
            disabled={busy}
            placeholder="Leave empty if it varies"
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        {obligation && (
          <label className="checkline obligation__active">
            <input
              type="checkbox"
              className="tickbox"
              checked={active}
              disabled={busy}
              onChange={(event) => setActive(event.target.checked)}
            />
            <span className="checkline__text">
              <span className="checkline__title">Still needed</span>
              <span className="card__hint">Untick to stop it coming up, and keep what was done.</span>
            </span>
          </label>
        )}
      </div>

      <div className="field">
        <label className="field__label" htmlFor={`${id}-notes`}>
          Notes
        </label>
        <textarea
          id={`${id}-notes`}
          className="input textarea"
          rows={2}
          value={notes}
          maxLength={2000}
          disabled={busy}
          placeholder="Who files it, where the login is, what it needs"
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <ErrorLine>{error}</ErrorLine>

      <div className="leadform__actions">
        <button type="button" className="btn btn--sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>
          {obligation ? "Save" : "Add the deadline"}
        </button>
      </div>
    </form>
  );
}
