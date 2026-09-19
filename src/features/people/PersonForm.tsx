import { useEffect, useId, useState } from "react";
import {
  CANDIDATE_STAGES,
  CANDIDATE_STAGE_LABEL,
  OPENING_STATUSES,
  OPENING_STATUS_LABEL,
  PAY_PERIODS,
  PAY_PERIOD_LABEL,
  PERSON_KINDS,
  PERSON_KIND_LABEL,
  openingInput,
  personInput,
  type CandidateStage,
  type Opening,
  type OpeningInput,
  type OpeningStatus,
  type PayPeriod,
  type Person,
  type PersonInput,
  type PersonKind,
} from "@shared/people";
import type { LeadListRow } from "@shared/domain";
import { Chips, Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { useWorkspace } from "@/lib/workspace";

/** Kinds that can hold equity: a founder, an advisor, or an employee with options. */
const HOLDS_EQUITY: readonly PersonKind[] = ["founder", "advisor", "employee"];

/**
 * Somebody, written or changed. The fields follow the kind: a founder is
 * asked what they own and their vesting, a freelancer their rate and when the
 * contract ends, a candidate the role and where they are up to.
 */
export function PersonForm({
  person,
  startKind = "employee",
  openings,
  busy,
  onSubmit,
  onCancel,
}: {
  person?: Person;
  startKind?: PersonKind;
  openings: readonly Opening[];
  busy: boolean;
  onSubmit: (input: PersonInput) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const { activeCompany } = useWorkspace();
  const [contacts, setContacts] = useState<LeadListRow[]>([]);
  const number = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

  const [name, setName] = useState(person?.name ?? "");
  const [kind, setKind] = useState<PersonKind>(person?.kind ?? startKind);
  const [role, setRole] = useState(person?.role ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [leadId, setLeadId] = useState(person?.leadId ?? "");
  const [startsOn, setStartsOn] = useState(person?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(person?.endsOn ?? "");
  const [pay, setPay] = useState(number(person?.pay));
  const [payPer, setPayPer] = useState<PayPeriod>(person?.payPer ?? "month");
  const [equity, setEquity] = useState(number(person?.equity));
  const [vesting, setVesting] = useState(number(person?.vestingMonths));
  const [cliff, setCliff] = useState(number(person?.cliffMonths));
  const [owns, setOwns] = useState(person?.owns ?? "");
  const [openingId, setOpeningId] = useState(person?.openingId ?? "");
  const [stage, setStage] = useState<CandidateStage>(person?.stage ?? "applied");
  const [notes, setNotes] = useState(person?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCompany) return;
    window.caulder.leads
      .list({ companyId: activeCompany.id, sort: "name", direction: "asc" })
      .then(setContacts)
      .catch(() => setContacts([]));
  }, [activeCompany]);

  const candidate = kind === "candidate";
  const candidateForm = person ? person.kind === "candidate" : startKind === "candidate";
  const toNumber = (text: string) => (text.trim() === "" ? null : Number(text.replace(/[,\s%]/g, "")));
  const toText = (text: string) => (text.trim() === "" ? null : text);

  return (
    <form
      className="leadform anim-spring"
      aria-label={person ? `Edit ${person.name}` : candidate ? "Add a candidate" : "Add someone"}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const hasPay = !candidate && toNumber(pay) !== null;
        const holdsEquity = !candidate && HOLDS_EQUITY.includes(kind);
        const parsed = personInput.safeParse({
          name,
          kind,
          role: toText(role),
          email: toText(email),
          phone: toText(phone),
          leadId: leadId || null,
          startsOn: toText(startsOn),
          endsOn: candidate || kind === "founder" ? (person?.endsOn ?? null) : toText(endsOn),
          pay: hasPay ? toNumber(pay) : null,
          payPer: hasPay ? payPer : null,
          equity: holdsEquity ? toNumber(equity) : null,
          vestingMonths: holdsEquity ? toNumber(vesting) : null,
          cliffMonths: holdsEquity ? toNumber(cliff) : null,
          owns: kind === "founder" ? toText(owns) : null,
          openingId: candidate ? openingId || null : (person?.openingId ?? null),
          stage: candidate ? stage : (person?.stage ?? null),
          notes: toText(notes),
        });
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const field = issue?.path[0];
          setError(
            field === "pay"
              ? "Pay is a whole number."
              : field === "vestingMonths" || field === "cliffMonths"
                ? (issue?.message.startsWith("Expected") ? "Vesting and the cliff are whole months." : issue?.message) ??
                  "Check the vesting."
                : field === "equity" && issue?.message.startsWith("Expected")
                  ? "Equity is a percentage."
                  : (issue?.message ?? "Check the details."),
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
      <div className="leadform__row">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-name`}>
            Name
          </label>
          <input
            id={`${id}-name`}
            className="input"
            value={name}
            maxLength={120}
            autoFocus
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-role`}>
            {candidate ? "Role they are up for" : "Role"}
          </label>
          <input
            id={`${id}-role`}
            className="input"
            value={role}
            maxLength={120}
            disabled={busy}
            placeholder={kind === "founder" ? "CEO, sales and money" : "Design, operations"}
            onChange={(event) => setRole(event.target.value)}
          />
        </div>
      </div>

      {/* A candidate becomes one of the team by being hired, which asks what as. */}
      {!candidateForm && (
        <div className="field">
          <span className="field__label">Here as</span>
          <Chips
            aria-label="Here as"
            value={kind}
            disabled={busy}
            onChange={setKind}
            options={PERSON_KINDS.filter((each) => each !== "candidate").map((value) => ({
              value,
              label: PERSON_KIND_LABEL[value],
            }))}
          />
        </div>
      )}

      {candidate && (
        <div className="leadform__row">
          <div className="field">
            <span className="field__label">For the role</span>
            <Select
              aria-label="For the role"
              value={openingId}
              disabled={busy}
              onChange={setOpeningId}
              options={[
                { value: "", label: "Not a particular role" },
                ...openings.map((opening) => ({ value: opening.id, label: opening.title })),
              ]}
            />
          </div>
          <div className="field">
            <span className="field__label">Where they are up to</span>
            <Select
              aria-label="Where they are up to"
              value={stage}
              disabled={busy}
              onChange={setStage}
              options={CANDIDATE_STAGES.filter((each) => each !== "hired").map((value) => ({
                value,
                label: CANDIDATE_STAGE_LABEL[value],
              }))}
            />
          </div>
        </div>
      )}

      {!candidate && (
        <div className="leadform__row">
          <div className="field">
            <label className="field__label" htmlFor={`${id}-starts`}>
              {kind === "founder" ? "Started, and vesting from" : "Starts"}
            </label>
            <input
              id={`${id}-starts`}
              type="date"
              className="input"
              value={startsOn}
              disabled={busy}
              onChange={(event) => setStartsOn(event.target.value)}
            />
          </div>
          {kind !== "founder" && (
            <div className="field">
              <label className="field__label" htmlFor={`${id}-ends`}>
                Ends
              </label>
              <input
                id={`${id}-ends`}
                type="date"
                className="input"
                value={endsOn}
                disabled={busy}
                onChange={(event) => setEndsOn(event.target.value)}
              />
              <span className="field__hint">For a contract or an internship. Today shows it a month ahead.</span>
            </div>
          )}
        </div>
      )}

      {!candidate && (
        <div className="leadform__row">
          <div className="field">
            <label className="field__label" htmlFor={`${id}-pay`}>
              {kind === "freelancer" ? "Rate" : kind === "advisor" ? "Fee" : "Pay"}
            </label>
            <input
              id={`${id}-pay`}
              className="input"
              inputMode="numeric"
              value={pay}
              disabled={busy}
              placeholder="Leave empty if none"
              onChange={(event) => setPay(event.target.value)}
            />
          </div>
          <div className="field">
            <span className="field__label">Per</span>
            <Select
              aria-label="Paid per"
              value={payPer}
              disabled={busy}
              onChange={setPayPer}
              options={PAY_PERIODS.map((value) => ({ value, label: PAY_PERIOD_LABEL[value].replace(/^an? /, "") }))}
            />
          </div>
        </div>
      )}

      {!candidate && HOLDS_EQUITY.includes(kind) && (
        <div className="leadform__row leadform__row--three">
          <div className="field">
            <label className="field__label" htmlFor={`${id}-equity`}>
              Equity, %
            </label>
            <input
              id={`${id}-equity`}
              className="input"
              inputMode="decimal"
              value={equity}
              disabled={busy}
              onChange={(event) => setEquity(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-vesting`}>
              Vesting, months
            </label>
            <input
              id={`${id}-vesting`}
              className="input"
              inputMode="numeric"
              value={vesting}
              disabled={busy}
              placeholder="48"
              onChange={(event) => setVesting(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-cliff`}>
              Cliff, months
            </label>
            <input
              id={`${id}-cliff`}
              className="input"
              inputMode="numeric"
              value={cliff}
              disabled={busy}
              placeholder="12"
              onChange={(event) => setCliff(event.target.value)}
            />
          </div>
        </div>
      )}

      {kind === "founder" && (
        <div className="field">
          <label className="field__label" htmlFor={`${id}-owns`}>
            What they own
          </label>
          <textarea
            id={`${id}-owns`}
            className="input textarea"
            rows={2}
            value={owns}
            maxLength={2000}
            disabled={busy}
            placeholder="Sales, pricing, the money. The decisions that are theirs to make."
            onChange={(event) => setOwns(event.target.value)}
          />
        </div>
      )}

      <div className="leadform__row leadform__row--three">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-email`}>
            Email
          </label>
          <input
            id={`${id}-email`}
            type="email"
            className="input"
            value={email}
            maxLength={200}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-phone`}>
            Phone
          </label>
          <input
            id={`${id}-phone`}
            className="input"
            value={phone}
            maxLength={40}
            disabled={busy}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        <div className="field">
          <span className="field__label">Also a contact</span>
          <Select
            aria-label="Also a contact"
            value={leadId}
            disabled={busy}
            onChange={setLeadId}
            options={[
              { value: "", label: "No" },
              ...contacts.map((contact) => ({ value: contact.id, label: contact.name })),
            ]}
          />
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor={`${id}-notes`}>
          Notes
        </label>
        <textarea
          id={`${id}-notes`}
          className="input textarea"
          rows={3}
          value={notes}
          maxLength={4000}
          disabled={busy}
          placeholder={candidate ? "Where they came from, how the conversations went" : "What was agreed"}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <ErrorLine>{error}</ErrorLine>

      <div className="leadform__actions">
        <button type="button" className="btn btn--sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>
          {person ? "Save" : candidate ? "Add the candidate" : "Add them"}
        </button>
      </div>
    </form>
  );
}

/** A role being hired for. */
export function OpeningForm({
  opening,
  busy,
  onSubmit,
  onCancel,
}: {
  opening?: Opening;
  busy: boolean;
  onSubmit: (input: OpeningInput) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(opening?.title ?? "");
  const [status, setStatus] = useState<OpeningStatus>(opening?.status ?? "open");
  const [pay, setPay] = useState(opening?.pay ?? "");
  const [notes, setNotes] = useState(opening?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="leadform anim-spring"
      aria-label={opening ? `Edit the role ${opening.title}` : "Add a role"}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const parsed = openingInput.safeParse({
          title,
          status,
          pay: pay.trim() === "" ? null : pay,
          notes: notes.trim() === "" ? null : notes,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the role.");
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
      <div className="leadform__row">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-title`}>
            The role
          </label>
          <input
            id={`${id}-title`}
            className="input"
            value={title}
            maxLength={120}
            autoFocus
            disabled={busy}
            placeholder="Sales intern"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-pay`}>
            Pay range
          </label>
          <input
            id={`${id}-pay`}
            className="input"
            value={pay}
            maxLength={120}
            disabled={busy}
            placeholder="₹15,000 to ₹20,000 a month"
            onChange={(event) => setPay(event.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <span className="field__label">Status</span>
        <Chips
          aria-label="Status"
          value={status}
          disabled={busy}
          onChange={setStatus}
          options={OPENING_STATUSES.map((value) => ({ value, label: OPENING_STATUS_LABEL[value] }))}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-notes`}>
          What they will do, and who you are looking for
        </label>
        <textarea
          id={`${id}-notes`}
          className="input textarea"
          rows={3}
          value={notes}
          maxLength={4000}
          disabled={busy}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <ErrorLine>{error}</ErrorLine>
      <div className="leadform__actions">
        <button type="button" className="btn btn--sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>
          {opening ? "Save" : "Add the role"}
        </button>
      </div>
    </form>
  );
}
