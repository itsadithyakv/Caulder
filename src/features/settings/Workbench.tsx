import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  FIELD_KINDS,
  FIELD_KIND_LABEL,
  customFieldInput,
  type CustomField,
  type FieldKind,
} from "@shared/domain";
import { DEFAULT_LEAD, LEAD_CHOICES, leadLabel } from "@shared/remind";
import { useWorkspace } from "@/lib/workspace";
import { Select } from "@/components/Select";
import { messageOf } from "@/lib/errors";
import { Card } from "@/components/Card";
import { Explain } from "@/components/Explain";
import { ErrorLine } from "@/components/ErrorLine";

/**
 * The parts of Settings that turn Caulder from a record into a workbench:
 * your own fields, and reminders.
 *
 * Their own file because SettingsScreen was already long, and because these
 * share a shape — each is a small per-company list that something else on
 * another screen reads.
 */

/**
 * Fields the app could not have known about.
 *
 * A school CRM wants "board" and "student count"; a studio wants "referred
 * by". Per company, because two workspaces are two different businesses.
 */
export function FieldsCard() {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const [fields, setFields] = useState<CustomField[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<FieldKind>("text");
  const [choices, setChoices] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    void window.caulder.fields.list(companyId).then(setFields);
  }, [companyId]);

  if (!companyId) return null;

  async function add(id: string) {
    setError(null);
    const parsed = customFieldInput.safeParse({
      name,
      kind,
      choices: choices
        .split(",")
        .map((choice) => choice.trim())
        .filter(Boolean),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the field.");
      return;
    }

    try {
      setFields(await window.caulder.fields.create(id, parsed.data));
      setName("");
      setChoices("");
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  return (
    <Card title="Your own fields" hint="Extra details on every contact, under the ones Caulder already knows about.">
      <ErrorLine>{error}</ErrorLine>

      {fields.length > 0 && (
        <ul className="rules">
          {fields.map((field) => (
            <li key={field.id} className="rule">
              <span className="rule__text">
                <strong>{field.name}</strong>
                <span className="rule__when">
                  {" "}
                  {FIELD_KIND_LABEL[field.kind].toLowerCase()}
                  {field.kind === "choice" && field.choices.length > 0
                    ? `: ${field.choices.join(", ")}`
                    : ""}
                </span>
              </span>
              <button
                type="button"
                className="btn btn--sm btn--ghost btn--danger"
                onClick={async () =>
                  setFields(await window.caulder.fields.remove(companyId, field.id))
                }
                aria-label={`Delete the field "${field.name}"`}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rulebuild">
        <div className="field">
          <label className="field__label" htmlFor="field-name">
            Name
          </label>
          <input
            id="field-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Plan"
            maxLength={60}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="field-kind">
            Kind
          </label>
          <Select
            id="field-kind"
            value={kind}
            onChange={setKind}
            options={FIELD_KINDS.map((option) => ({ value: option, label: FIELD_KIND_LABEL[option] }))}
          />
        </div>

        {kind === "choice" && (
          <div className="field rulebuild__wide">
            <label className="field__label" htmlFor="field-choices">
              The list, separated by commas
            </label>
            <input
              id="field-choices"
              className="input"
              value={choices}
              onChange={(event) => setChoices(event.target.value)}
              placeholder="Free, Starter, Pro"
            />
          </div>
        )}

        <div className="firstrun__actions rulebuild__wide">
          <button
            type="button"
            className="btn btn--primary"
            disabled={name.trim() === ""}
            onClick={() => void add(companyId)}
          >
            Add the field
          </button>
        </div>
      </div>

      <Explain label="What deleting one does">
        <p>
          Deleting a field deletes what was written in it. A field nobody can see
          is not a field, and leaving the answers behind would mean re-adding the
          same name silently brings old ones back.
        </p>
      </Explain>
    </Card>
  );
}

/** Two reminders, both off until asked for, and the one built-in follow-up. */
export function RemindersCard() {
  const { activeCompany, refresh } = useWorkspace();
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  useEffect(() => {
    void window.caulder.window.notifications().then(setNotify);
    void window.caulder.outreach.followUpDays().then((days) => setFollowUp(String(days)));
  }, []);

  async function saveFollowUp() {
    setFollowUpError(null);
    try {
      const saved = await window.caulder.outreach.setFollowUpDays(Number(followUp));
      setFollowUp(String(saved));
    } catch (cause) {
      setFollowUpError(messageOf(cause));
    }
  }

  // Per workspace rather than global, unlike the overdue digest above it.
  // Two workspaces are two timezones and two kinds of day, and the one with
  // a timetable in it is not necessarily the one with the leads.
  const lead = activeCompany?.remindMinutes ?? null;

  async function setLead(minutes: number | null) {
    if (!activeCompany) return;
    setBusy(true);
    try {
      await window.caulder.companies.setRemind(activeCompany.id, minutes);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Reminders" hint="Both off unless you switch them on.">
      <div className="checkline">
        <button
          type="button"
          className="toggle"
          role="switch"
          aria-checked={notify}
          aria-label="Tell me when something is overdue"
          onClick={async () => setNotify(await window.caulder.window.setNotifications(!notify))}
        >
          <span className="toggle__thumb" />
        </button>
        <span className="checkline__text">
          <span className="checkline__title">Tell me when something is overdue</span>
          <span className="card__hint">
            One desktop notification a day, never before nine in the morning, and
            only when there is something.
          </span>
        </span>
      </div>

      {activeCompany && (
        <div className="checkline">
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={lead !== null}
            aria-label="Tell me before a block starts"
            disabled={busy}
            onClick={() => void setLead(lead === null ? DEFAULT_LEAD : null)}
          >
            <span className="toggle__thumb" />
          </button>
          <span className="checkline__text">
            <span className="checkline__title">Tell me before a block starts</span>
            <span className="card__hint">
              A knock before each block on the day, with the warning you choose.
            </span>

            {lead !== null && (
              <label className="field remindlead">
                <span className="field__label">How much warning</span>
                <Select
                  aria-label="How much warning"
                  value={String(lead)}
                  disabled={busy}
                  onChange={(value) => void setLead(Number(value))}
                  options={LEAD_CHOICES.map((choice) => ({
                    value: String(choice),
                    label: leadLabel(choice),
                  }))}
                />
                <span className="field__hint">
                  For every block in {activeCompany.name}. A single one can ask
                  for its own notice, or none at all, on the block itself.
                </span>
              </label>
            )}
          </span>
        </div>
      )}

      <label className="field remindlead">
        <span className="field__label">Follow up after a deal moves</span>
        <span className="card__hint">
          When a deal moves into a stage with nothing planned, add a follow-up due
          in this many days. Zero means never.
        </span>
        <input
          className="input"
          inputMode="numeric"
          value={followUp}
          onChange={(event) => setFollowUp(event.target.value)}
          onBlur={() => void saveFollowUp()}
          aria-label="Days until the follow-up is due"
        />
        <ErrorLine>{followUpError}</ErrorLine>
      </label>

      <Explain label="What it stays quiet about">
        <p>
          Nothing about a block that has already begun, nothing about one you marked
          as not having happened, and nothing twice about the same block. The block
          reminder is per workspace, because two workspaces are two timezones and
          two kinds of day; a single block can ask for its own notice, or none, on
          the block itself.
        </p>
      </Explain>
    </Card>
  );
}
