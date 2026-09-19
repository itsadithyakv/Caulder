import { useCallback, useId, useState } from "react";
import { ArrowLeft, Check, Circle, ListChecks, Trash2 } from "lucide-react";
import {
  CANDIDATE_STAGE_LABEL,
  HIRED_KINDS,
  ONBOARDING,
  PAY_PERIOD_LABEL,
  PERSON_KIND_LABEL,
  describeVesting,
  type HiredKind,
  type PersonDetail,
} from "@shared/people";
import { Card } from "@/components/Card";
import { Chips, Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { useResource } from "@/lib/resource";
import { formatDay, formatValue } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { useOpenRef } from "@/lib/navigate";
import { BrainLinks } from "@/features/brain/BrainLinks";
import { PersonForm } from "./PersonForm";

/**
 * One person: their terms, how much of their equity they have earned, and
 * onboarding. A candidate's page is where they are hired, which asks what as
 * and from when, and marks the role filled.
 */
export function PersonView({
  personId,
  onBack,
  onGone,
  onOpenContact,
  onChanged,
}: {
  personId: string;
  onBack: () => void;
  onGone: () => void;
  onOpenContact: (leadId: string) => void;
  onChanged: () => void;
}) {
  const fetch = useCallback(() => window.caulder.people.detail(personId), [personId]);
  const { data, error, setError } = useResource<PersonDetail>(fetch);
  const [fresh, setFresh] = useState<PersonDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = fresh ?? data;
  const openRef = useOpenRef();

  async function run(work: () => Promise<PersonDetail>, after?: () => void) {
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
  const { person, tasks } = shown;
  const money = (value: number) => formatValue(value, shown.currency);
  const candidate = person.kind === "candidate";
  const vesting = person.vesting;

  return (
    <div className="personview">
      <div className="detail__bar">
        <button type="button" className="btn btn--sm" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden />
          Everybody
        </button>
        <div className="detail__barActions">
          {!editing && (
            <button type="button" className="btn btn--sm" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {!confirming ? (
            <button type="button" className="btn btn--sm btn--ghost btn--danger" onClick={() => setConfirming(true)}>
              <Trash2 size={14} aria-hidden />
              Delete
            </button>
          ) : (
            <span className="detail__confirm">
              <span className="card__hint">
                {candidate ? "Their notes go with them." : "Their tasks stay on Today; the rest goes."}
              </span>
              <button
                type="button"
                className="btn btn--sm btn--danger"
                disabled={busy}
                onClick={() =>
                  void window.caulder.people
                    .remove(person.id)
                    .then(onGone)
                    .catch((cause: unknown) => setError(messageOf(cause)))
                }
              >
                Delete
              </button>
              <button type="button" className="btn btn--sm" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </span>
          )}
        </div>
      </div>

      <ErrorLine>{error}</ErrorLine>

      <Card
        title={person.name}
        actions={
          <span className={`badge badge--${person.status === "past" ? "neutral" : candidate ? "info" : "ok"}`}>
            {candidate
              ? CANDIDATE_STAGE_LABEL[person.stage ?? "applied"]
              : person.status === "past"
                ? "Has left"
                : person.status === "starting"
                  ? "Starting soon"
                  : PERSON_KIND_LABEL[person.kind]}
          </span>
        }
      >
        {editing ? (
          <PersonForm
            person={person}
            openings={shown.openings}
            busy={busy}
            onCancel={() => setEditing(false)}
            onSubmit={(input) => run(() => window.caulder.people.update(person.id, input), () => setEditing(false))}
          />
        ) : (
          <>
            <dl className="facts">
              <Fact label="Here as" value={PERSON_KIND_LABEL[person.kind]} />
              <Fact label={candidate ? "Up for" : "Role"} value={person.role} />
              {candidate && <Fact label="For the role" value={person.openingTitle} />}
              {!candidate && (
                <Fact
                  label={person.status === "starting" ? "Starts" : "Started"}
                  value={person.startsOn ? formatDay(person.startsOn) : null}
                />
              )}
              {person.endsOn && <Fact label="Ends" value={formatDay(person.endsOn)} />}
              {person.pay !== null && (
                <Fact
                  label={person.kind === "freelancer" ? "Rate" : "Pay"}
                  value={`${money(person.pay)}${person.payPer ? ` ${PAY_PERIOD_LABEL[person.payPer]}` : ""}`}
                />
              )}
              {person.equity !== null && (
                <Fact
                  label="Equity"
                  value={`${person.equity}%, ${describeVesting(person.vestingMonths, person.cliffMonths)}`}
                />
              )}
              {person.email && <Fact label="Email" value={person.email} />}
              {person.phone && <Fact label="Phone" value={person.phone} />}
              {person.leadId && person.leadName && (
                <div className="facts__row">
                  <dt className="facts__label">Contact</dt>
                  <dd className="facts__value">
                    <button type="button" className="linklike" onClick={() => onOpenContact(person.leadId as string)}>
                      {person.leadName}
                    </button>
                  </dd>
                </div>
              )}
            </dl>
            {person.owns && (
              <>
                <h3 className="card__title productview__sub">What they own</h3>
                <p className="detail__notesBody">{person.owns}</p>
              </>
            )}
            {person.notes && <p className="detail__notesBody">{person.notes}</p>}
          </>
        )}
      </Card>

      {vesting && !editing && (
        <Card title="Vesting" hint="Earned monthly from the start date, and nothing before the cliff.">
          <div className="vesting" role="img" aria-label={`${vesting.vested}% of ${vesting.equity}% vested`}>
            <span className="vesting__bar" style={{ width: `${Math.min(100, (vesting.vested / vesting.equity) * 100)}%` }} />
          </div>
          <p className="vesting__words">
            <strong>
              {vesting.vested}% of {vesting.equity}% vested
            </strong>
            {vesting.cliffOn && vesting.cliffOn > shown.day
              ? ` - nothing until the cliff on ${formatDay(vesting.cliffOn)}.`
              : vesting.vested < vesting.equity
                ? ` - all of it by ${formatDay(vesting.fullyOn)}.`
                : "."}
          </p>
        </Card>
      )}

      {candidate ? (
        <HireCard detail={shown} busy={busy} onHire={(input) => run(() => window.caulder.people.hire(person.id, input))} />
      ) : (
        <Card
          icon={<ListChecks size={15} aria-hidden />}
          title="Onboarding"
          hint="A checklist whose steps become tasks, due that many days after the start."
        >
          {tasks.length > 0 && (
            <>
              <p className="onboarding__progress">
                {tasks.filter((task) => task.done).length} of {tasks.length} done
                {person.onboardedOn ? `, started ${formatDay(person.onboardedOn)}` : ""}
              </p>
              <ul className="onboarding" aria-label="Onboarding tasks">
                {tasks.map((task) => (
                  <li key={task.id} className={`onboarding__step${task.done ? " onboarding__step--done" : ""}`}>
                    {task.done ? (
                      <Check size={14} className="onboarding__tick" aria-label="Done" />
                    ) : (
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost btn--icon"
                        aria-label={`${task.title} is done`}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await window.caulder.tasks.complete(task.id);
                            return window.caulder.people.detail(person.id);
                          })
                        }
                      >
                        <Circle size={14} aria-hidden />
                      </button>
                    )}
                    <span className="onboarding__title">{task.title}</span>
                    <span className="duerow__when">{formatDay(task.dueOn)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <RunChecklist
            detail={shown}
            busy={busy}
            again={tasks.length > 0}
            onRun={(playbookId) => run(() => window.caulder.people.onboard(person.id, playbookId))}
          />
        </Card>
      )}

      {/* The pages written about them, and what is around them on the Map. */}
      <BrainLinks
        companyId={person.companyId}
        kind="person"
        id={person.id}
        onOpenPage={(id) => openRef({ kind: "page", id })}
        onOpenContact={onOpenContact}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="facts__row">
      <dt className="facts__label">{label}</dt>
      <dd className="facts__value">{value ?? <span className="leadrow__missing">Not set</span>}</dd>
    </div>
  );
}

/** Which checklist to run: the default for their kind, or a playbook page with steps. */
function RunChecklist({
  detail,
  busy,
  again,
  onRun,
}: {
  detail: PersonDetail;
  busy: boolean;
  again: boolean;
  onRun: (playbookId: string | null) => Promise<void>;
}) {
  const { person, checklists } = detail;
  const [source, setSource] = useState("");
  if (person.kind === "candidate") return null;
  const defaults = ONBOARDING[person.kind];

  return (
    <div className="onboarding__run">
      {checklists.length > 0 ? (
        <Select
          aria-label="Which checklist"
          value={source}
          disabled={busy}
          onChange={setSource}
          options={[
            { value: "", label: `The usual for ${PERSON_KIND_LABEL[person.kind].toLowerCase()}s (${defaults.length} steps)` },
            ...checklists.map((checklist) => ({
              value: checklist.pageId,
              label: `${checklist.title} (${checklist.steps} ${checklist.steps === 1 ? "step" : "steps"})`,
            })),
          ]}
        />
      ) : (
        !again && (
          <p className="card__hint">
            The usual {defaults.length} steps for {PERSON_KIND_LABEL[person.kind].toLowerCase()}s: {defaults
              .map((step) => step.title.toLowerCase())
              .slice(0, 3)
              .join("; ")}
            , and so on. A playbook page with - [ ] steps can be run instead.
          </p>
        )
      )}
      <button
        type="button"
        className={`btn btn--sm${again ? "" : " btn--primary"}`}
        disabled={busy}
        onClick={() => void onRun(source || null)}
      >
        {again ? "Run another checklist" : "Start onboarding"}
      </button>
    </div>
  );
}

function HireCard({
  detail,
  busy,
  onHire,
}: {
  detail: PersonDetail;
  busy: boolean;
  onHire: (input: { kind: HiredKind; startsOn: string | null; fillOpening: boolean }) => Promise<void>;
}) {
  const id = useId();
  const { person } = detail;
  const [kind, setKind] = useState<HiredKind>("employee");
  const [startsOn, setStartsOn] = useState(person.startsOn ?? "");
  const [fill, setFill] = useState(true);

  return (
    <Card title="Hire them" hint="The same record carries on, with the notes from the conversations.">
      <div className="leadform">
        <div className="field">
          <span className="field__label">Joining as</span>
          <Chips
            aria-label="Joining as"
            value={kind}
            disabled={busy}
            onChange={setKind}
            options={HIRED_KINDS.map((value) => ({ value, label: PERSON_KIND_LABEL[value] }))}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-starts`}>
            Starting on
          </label>
          <input
            id={`${id}-starts`}
            type="date"
            className="input rule__day"
            value={startsOn}
            disabled={busy}
            onChange={(event) => setStartsOn(event.target.value)}
          />
        </div>
        {person.openingTitle && (
          <label className="checkline">
            <input
              type="checkbox"
              className="tickbox"
              checked={fill}
              disabled={busy}
              onChange={(event) => setFill(event.target.checked)}
            />
            <span className="checkline__text">
              <span className="checkline__title">Mark {person.openingTitle} filled</span>
            </span>
          </label>
        )}
        <div className="leadform__actions">
          <button
            type="button"
            className="btn btn--sm btn--primary"
            disabled={busy}
            onClick={() => void onHire({ kind, startsOn: startsOn || null, fillOpening: fill })}
          >
            Hire {person.name}
          </button>
        </div>
      </div>
    </Card>
  );
}
