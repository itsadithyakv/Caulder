import { useState, type FormEvent } from "react";
import {
  leadInput,
  type Lead,
  type LeadInput,
  type PipelineStage,
} from "@shared/domain";
import { Select } from "@/components/Select";
import { messageOf } from "@/lib/errors";

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
  campaignId: string;
  doNotContact: boolean;
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
    campaignId: lead?.campaignId ?? "",
    doNotContact: lead?.doNotContact ?? false,
  };
}

export function LeadForm({ lead, stages, busy, onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(lead, stages));
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
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
      campaignId: draft.campaignId === "" ? null : draft.campaignId,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details above.");
      return;
    }

    try {
      await onSubmit(parsed.data);
    } catch (cause) {
      setError(messageOf(cause));
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
          <Select
            id="lead-stage"
            value={draft.stageId}
            onChange={(value) => set("stageId", value)}
            disabled={busy}
            options={[
              { value: "", label: "No stage" },
              ...stages.map((stage) => ({ value: stage.id, label: stage.name })),
            ]}
          />
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

      <label className="checkline">
        <input
          type="checkbox"
          className="tickbox"
          checked={draft.doNotContact}
          disabled={busy}
          // Named explicitly, or the accessible name becomes the whole
          // paragraph beside it - which is unusable with a screen reader and
          // makes the box answer to any word in the sentence.
          aria-label="Do not contact"
          onChange={(event) => set("doNotContact", event.target.checked)}
        />
        <span className="checkline__text">
          <span className="checkline__title">Do not contact</span>
          <span className="card__hint">
            Refused everywhere the reaching-out happens &mdash; the email queue,
            a sequence, and WhatsApp &mdash; rather than by hiding a button.
          </span>
        </span>
      </label>

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
          {lead ? "Save changes" : "Add contact"}
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
