import { useCallback, useState } from "react";
import { Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import {
  CANDIDATE_STAGES,
  CANDIDATE_STAGE_LABEL,
  OPENING_STATUS_LABEL,
  PAY_PERIOD_LABEL,
  PERSON_KIND_LABEL,
  equitySplit,
  type CandidateStage,
  type Opening,
  type PeopleOverview,
  type Person,
  type PersonKind,
} from "@shared/people";
import { Card } from "@/components/Card";
import { Select } from "@/components/Select";
import { EmptyState } from "@/components/EmptyState";
import { ErrorLine } from "@/components/ErrorLine";
import { useResource } from "@/lib/resource";
import { formatDay, formatValue } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { OpeningForm, PersonForm } from "./PersonForm";
import { PersonView } from "./PersonView";

/**
 * The brain's People section: the team, who is being hired and for what, and
 * the people who have left. A row opens the person, with their terms, their
 * vesting, and the onboarding that turns a checklist into tasks.
 */
export function PeoplePanel({
  companyId,
  focus,
  onOpenContact,
  onChanged,
}: {
  companyId: string;
  /** Somebody to open straight away: from search, or from a date on Today. */
  focus: string | null;
  onOpenContact: (leadId: string) => void;
  /** Said after every change, so the rail's count keeps up. */
  onChanged: () => void;
}) {
  const fetch = useCallback(() => window.caulder.people.overview(companyId), [companyId]);
  const { data, error, reload, setError } = useResource<PeopleOverview>(fetch);
  const [fresh, setFresh] = useState<PeopleOverview | null>(null);
  const [openId, setOpenId] = useState<string | null>(focus);
  const [adding, setAdding] = useState<PersonKind | null>(null);
  const [roleForm, setRoleForm] = useState<Opening | "new" | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = fresh ?? data;

  async function run(work: () => Promise<PeopleOverview>, after?: () => void) {
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

  const backToList = () => {
    setOpenId(null);
    setFresh(null);
    reload();
  };

  if (openId) {
    return (
      <PersonView
        personId={openId}
        onBack={backToList}
        onGone={() => {
          backToList();
          onChanged();
        }}
        onOpenContact={onOpenContact}
        onChanged={onChanged}
      />
    );
  }

  if (!shown) return <ErrorLine>{error}</ErrorLine>;
  const money = (value: number) => formatValue(value, shown.currency);

  const team = shown.people.filter((person) => person.status === "current" || person.status === "starting");
  const past = shown.people.filter((person) => person.status === "past");
  const candidates = shown.people.filter((person) => person.status === "candidate");
  const split = equitySplit(shown.people);
  const unplaced = candidates.filter((person) => !shown.openings.some((opening) => opening.id === person.openingId));

  async function add(input: Parameters<typeof window.caulder.people.create>[1]) {
    setBusy(true);
    setError(null);
    try {
      const made = await window.caulder.people.create(companyId, input);
      setAdding(null);
      onChanged();
      setOpenId(made.person.id);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const candidateRow = (person: Person) => (
    <li key={person.id} className={`duerow${person.stage === "declined" ? " candidate--declined" : ""}`}>
      <button type="button" className="duerow__main" onClick={() => setOpenId(person.id)}>
        <span className="duerow__title">{person.name}</span>
        {(person.role || person.email || person.phone) && (
          <span className="duerow__what">{[person.role, person.email, person.phone].filter(Boolean).join(" · ")}</span>
        )}
      </button>
      <Select
        compact
        aria-label={`Where ${person.name} is up to`}
        value={person.stage ?? "applied"}
        disabled={busy}
        options={CANDIDATE_STAGES.filter((stage) => stage !== "hired").map((stage) => ({
          value: stage,
          label: CANDIDATE_STAGE_LABEL[stage],
        }))}
        onChange={(stage: CandidateStage) => void run(() => window.caulder.people.stage(person.id, stage))}
      />
    </li>
  );

  return (
    <div className="people">
      <ErrorLine>{error}</ErrorLine>

      <Card
        title="The team"
        hint="Founders, employees, interns, freelancers and advisors, with what they are paid or own."
        actions={
          adding === null && (
            <button type="button" className="btn btn--sm btn--primary" onClick={() => setAdding("employee")}>
              <UserPlus size={15} aria-hidden />
              Add someone
            </button>
          )
        }
      >
        {adding !== null && adding !== "candidate" && (
          <PersonForm
            startKind={adding}
            openings={shown.openings}
            busy={busy}
            onCancel={() => setAdding(null)}
            onSubmit={add}
          />
        )}

        {team.length === 0 ? (
          adding === null && (
            <EmptyState
              title="Nobody here yet"
              body="Start with the founders: what each one owns, and their equity. Everybody else - the team, interns, freelancers, advisors - goes here as they join."
            />
          )
        ) : (
          <ul className="duelist" aria-label="The team">
            {team.map((person) => (
              <li key={person.id} className="duerow">
                <button type="button" className="duerow__main" onClick={() => setOpenId(person.id)}>
                  <span className="duerow__title">{person.name}</span>
                  <span className="duerow__what">
                    {PERSON_KIND_LABEL[person.kind]}
                    {person.role ? ` · ${person.role}` : ""}
                    {termsOf(person, money)}
                  </span>
                </button>
                {person.onboarding && person.onboarding.done < person.onboarding.total && (
                  <span className="badge badge--info">
                    Onboarding {person.onboarding.done} of {person.onboarding.total}
                  </span>
                )}
                <span className="duerow__when">
                  {person.status === "starting" && person.startsOn
                    ? `Starts ${formatDay(person.startsOn)}`
                    : person.endsOn
                      ? `Until ${formatDay(person.endsOn)}`
                      : person.startsOn
                        ? `Since ${formatDay(person.startsOn)}`
                        : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

        {split.holders.length > 0 && (
          <p className={`people__equity${split.given > 100 ? " people__equity--over" : ""}`}>
            <strong>Equity given: {split.given}%</strong>
            {" - "}
            {split.holders.map((holder) => `${holder.name} ${holder.equity}%`).join(", ")}.
            {split.given > 100
              ? " That is more than there is: check the numbers against the cap table."
              : split.given < 100
                ? ` ${Math.round((100 - split.given) * 100) / 100}% not given to anybody here.`
                : ""}
          </p>
        )}
      </Card>

      <Card
        title="Hiring"
        hint="The roles you are hiring for, and where each candidate is up to."
        actions={
          <div className="actions">
            <button
              type="button"
              className="btn btn--sm"
              disabled={roleForm !== null}
              onClick={() => setRoleForm("new")}
            >
              <Plus size={15} aria-hidden />
              Add a role
            </button>
            <button
              type="button"
              className="btn btn--sm"
              disabled={adding !== null}
              onClick={() => setAdding("candidate")}
            >
              <UserPlus size={15} aria-hidden />
              Add a candidate
            </button>
          </div>
        }
      >
        {roleForm === "new" && (
          <OpeningForm
            busy={busy}
            onCancel={() => setRoleForm(null)}
            onSubmit={(input) =>
              run(() => window.caulder.people.createOpening(companyId, input), () => setRoleForm(null))
            }
          />
        )}
        {adding === "candidate" && (
          <PersonForm
            startKind="candidate"
            openings={shown.openings}
            busy={busy}
            onCancel={() => setAdding(null)}
            onSubmit={add}
          />
        )}

        {shown.openings.length === 0 && candidates.length === 0 && roleForm === null && adding !== "candidate" && (
          <p className="card__hint">Nobody being hired. Add a role when you start looking.</p>
        )}

        {shown.openings.map((opening) =>
          roleForm !== "new" && roleForm?.id === opening.id ? (
            <OpeningForm
              key={opening.id}
              opening={opening}
              busy={busy}
              onCancel={() => setRoleForm(null)}
              onSubmit={(input) =>
                run(() => window.caulder.people.updateOpening(opening.id, input), () => setRoleForm(null))
              }
            />
          ) : (
            <section key={opening.id} className="opening" aria-label={opening.title}>
              <div className="opening__head">
                <h3 className="opening__title">{opening.title}</h3>
                <span className={`badge badge--${opening.status === "open" ? "ok" : "neutral"}`}>
                  {OPENING_STATUS_LABEL[opening.status]}
                </span>
                {opening.pay && <span className="duerow__what">{opening.pay}</span>}
                {confirming === opening.id ? (
                  <span className="detail__confirm">
                    <span className="card__hint">Its candidates stay, without a role.</span>
                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      disabled={busy}
                      onClick={() =>
                        void run(() => window.caulder.people.removeOpening(opening.id), () => setConfirming(null))
                      }
                    >
                      Delete
                    </button>
                    <button type="button" className="btn btn--sm" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <span className="duerow__actions opening__actions">
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost btn--icon"
                      aria-label={`Edit the role ${opening.title}`}
                      onClick={() => setRoleForm(opening)}
                    >
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost btn--danger btn--icon"
                      aria-label={`Delete the role ${opening.title}`}
                      onClick={() => setConfirming(opening.id)}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </span>
                )}
              </div>
              {opening.notes && <p className="opening__notes">{opening.notes}</p>}
              {candidates.some((person) => person.openingId === opening.id) ? (
                <ul className="duelist" aria-label={`Candidates for ${opening.title}`}>
                  {candidates.filter((person) => person.openingId === opening.id).map(candidateRow)}
                </ul>
              ) : (
                <p className="card__hint">No candidates yet.</p>
              )}
            </section>
          ),
        )}

        {unplaced.length > 0 && (
          <section className="opening" aria-label="Not for a role">
            <div className="opening__head">
              <h3 className="opening__title">Not for a particular role</h3>
            </div>
            <ul className="duelist" aria-label="Candidates not for a role">
              {unplaced.map(candidateRow)}
            </ul>
          </section>
        )}
      </Card>

      {past.length > 0 && (
        <div className="sectionview__archived">
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            aria-expanded={showPast}
            onClick={() => setShowPast((open) => !open)}
          >
            {showPast ? "Hide the people who have left" : `People who have left (${past.length})`}
          </button>
          {showPast && (
            <ul className="duelist people__past" aria-label="People who have left">
              {past.map((person) => (
                <li key={person.id} className="duerow">
                  <button type="button" className="duerow__main" onClick={() => setOpenId(person.id)}>
                    <span className="duerow__title">{person.name}</span>
                    <span className="duerow__what">
                      {PERSON_KIND_LABEL[person.kind]}
                      {person.role ? ` · ${person.role}` : ""}
                    </span>
                  </button>
                  <span className="duerow__when">{person.endsOn ? `Left ${formatDay(person.endsOn)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Their terms in a few words: " · ₹40,000 a month", " · 25%, 6.25% vested". */
function termsOf(person: Person, money: (value: number) => string): string {
  const parts: string[] = [];
  if (person.pay !== null && person.pay > 0) {
    parts.push(`${money(person.pay)}${person.payPer ? ` ${PAY_PERIOD_LABEL[person.payPer]}` : ""}`);
  }
  if (person.equity) {
    const vesting = person.vesting;
    parts.push(
      vesting && vesting.vested < vesting.equity
        ? `${person.equity}%, ${vesting.vested}% vested`
        : `${person.equity}%`,
    );
  }
  return parts.length > 0 ? ` · ${parts.join(" · ")}` : "";
}
