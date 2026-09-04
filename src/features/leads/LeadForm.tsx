import { useState, type FormEvent } from "react";
import { leadInput, type Lead, type LeadInput, type PipelineStage } from "@shared/domain";

/**
 * One form for both creating and editing, because the fields are the same and
 * two copies would drift.
 *
 * It always submits the whole record. updateLead applies what it is given
 * rather than patching, so a partial submit would silently clear everything it
 * left out.
 */

type Props = {
  lead?: Lead;
  stages: PipelineStage[];
  busy?: boolean;
  onSubmit: (input: LeadInput) => Promise<void>;
  onCancel: () => void;
};

type Draft = {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  altPhone: string;
  location: string;
  city: string;
  pin: string;
  source: string;
  website: string;
  value: string;
  notes: string;
  stageId: string;
};

function draftFrom(lead: Lead | undefined, stages: PipelineStage[]): Draft {
  return {
    name: lead?.name ?? "",
    contactPerson: lead?.contactPerson ?? "",
    email: lead?.email ?? "",
    phone: lead?.phone ?? "",
    altPhone: lead?.altPhone ?? "",
    location: lead?.location ?? "",
    city: lead?.city ?? "",
    pin: lead?.pin ?? "",
    source: lead?.source ?? "",
    website: lead?.website ?? "",
    value: lead?.value === null || lead?.value === undefined ? "" : String(lead.value),
    notes: lead?.notes ?? "",
    // A new lead starts in the first stage rather than outside the funnel.
    stageId: lead?.stageId ?? stages[0]?.id ?? "",
  };
}

export function LeadForm({ lead, stages, busy, onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(lead, stages));
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Draft>(key: K, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // An empty value box means "not known", not zero.
    const value = draft.value.trim() === "" ? null : Number(draft.value);
    if (value !== null && !Number.isFinite(value)) {
      setError("Value has to be a number, or left empty.");
      return;
    }

    const parsed = leadInput.safeParse({
      ...draft,
      value,
      stageId: draft.stageId === "" ? null : draft.stageId,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details above.");
      return;
    }

    try {
      await onSubmit(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <form
      className="leadform anim-panel"
      onSubmit={submit}
      // The shortcut list promises "Esc - close whatever is open", and this
      // is the most-opened thing in the app. preventDefault marks it handled
      // so the global handler does not also close a menu behind the form.
      onKeyDown={(event) => {
        if (event.key !== "Escape" || busy) return;
        event.preventDefault();
        onCancel();
      }}
      noValidate
    >
      <div className="field">
        <label className="field__label" htmlFor="lead-name">
          Name
        </label>
        <input
          id="lead-name"
          className={`input${error ? " input--invalid" : ""}`}
          value={draft.name}
          onChange={(event) => set("name", event.target.value)}
          placeholder="Bengaluru Public School"
          autoFocus={!lead}
          autoComplete="off"
          maxLength={160}
          disabled={busy}
        />
      </div>

      <div className="leadform__row">
        <Text id="lead-contact" label="Contact person" value={draft.contactPerson}
          onChange={(v) => set("contactPerson", v)} busy={busy} />
        <Text id="lead-email" label="Email" value={draft.email} type="email"
          onChange={(v) => set("email", v)} busy={busy} />
      </div>

      <div className="leadform__row">
        <Text id="lead-phone" label="Phone" value={draft.phone}
          onChange={(v) => set("phone", v)} busy={busy} />
        <Text id="lead-alt-phone" label="Alt phone" value={draft.altPhone}
          onChange={(v) => set("altPhone", v)} busy={busy} />
      </div>

      <div className="leadform__row">
        <div className="field">
          <label className="field__label" htmlFor="lead-stage">
            Stage
          </label>
          <select
            id="lead-stage"
            className="select"
            value={draft.stageId}
            onChange={(event) => set("stageId", event.target.value)}
            disabled={busy}
          >
            <option value="">No stage</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </div>

        <Text id="lead-value" label="Value" value={draft.value} inputMode="numeric"
          onChange={(v) => set("value", v)} busy={busy} />
      </div>

      <div className="leadform__row">
        <Text id="lead-city" label="City" value={draft.city}
          onChange={(v) => set("city", v)} busy={busy} />
        <Text id="lead-source" label="Source" value={draft.source}
          onChange={(v) => set("source", v)} busy={busy} />
      </div>

      <Text id="lead-location" label="Location" value={draft.location}
        onChange={(v) => set("location", v)} busy={busy} />

      <Text id="lead-website" label="Website" value={draft.website}
        onChange={(v) => set("website", v)} busy={busy} />

      <div className="field">
        <label className="field__label" htmlFor="lead-notes">
          Notes
        </label>
        <textarea
          id="lead-notes"
          className="textarea"
          value={draft.notes}
          onChange={(event) => set("notes", event.target.value)}
          maxLength={4000}
          disabled={busy}
        />
      </div>

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      <div className="leadform__actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {lead ? "Save changes" : "Add lead"}
        </button>
      </div>
    </form>
  );
}

function Text({
  id,
  label,
  value,
  onChange,
  busy,
  type = "text",
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  busy?: boolean;
  type?: string;
  inputMode?: "numeric";
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type={type}
        {...(inputMode ? { inputMode } : {})}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        disabled={busy}
      />
    </div>
  );
}
