import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import {
  quarterLabel,
  quartersFrom,
  type BrainField,
  type BrainPage,
  type BrainTemplate,
} from "@shared/brain";
import { today as todayIn } from "@shared/dates";
import { Select } from "@/components/Select";
import { formatDay, formatValue } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { useWorkspace } from "@/lib/workspace";

/**
 * A page's fields: read as facts, or edited as a form.
 *
 * Secrets arrive masked and stay that way. Reading one asks main for it and
 * shows it for a short while; copying one is done by main, so the window
 * never has to hold it to put it on the clipboard.
 */

/** How long a revealed secret stays on screen. */
const REVEAL_MS = 20_000;

/** A field's value as the form holds it: text for inputs, a boolean for a tick box. */
export type FieldDraft = Record<string, string | boolean>;

/** What the form says about each secret: a new value, null for removed, absent for untouched. */
export type SecretDraft = Record<string, string | null>;

export function draftFrom(template: BrainTemplate, page: BrainPage): FieldDraft {
  const draft: FieldDraft = {};
  for (const field of template.fields) {
    if (field.kind === "secret") continue;
    const value = page.fields[field.key];
    draft[field.key] = field.kind === "check" ? value === true : value === null || value === undefined ? "" : String(value);
  }
  return draft;
}

function shown(field: BrainField, value: unknown, currency: string | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  switch (field.kind) {
    case "check":
      return value === true ? "Yes" : null;
    case "choice":
      return field.options?.find((option) => option.value === value)?.label ?? String(value);
    case "quarter":
      return quarterLabel(String(value));
    case "date":
      return formatDay(String(value));
    case "money":
      return typeof value === "number" ? formatValue(value, currency) : String(value);
    case "number":
      return typeof value === "number" ? value.toLocaleString() : String(value);
    default:
      return String(value);
  }
}

/** The filled-in fields, as a list of facts. Empty ones are left out. */
export function FieldFacts({ template, page }: { template: BrainTemplate; page: BrainPage }) {
  const { activeCompany } = useWorkspace();
  const rows = template.fields.filter((field) =>
    field.kind === "secret" ? page.secrets[field.key] : shown(field, page.fields[field.key], undefined) !== null,
  );

  if (template.fields.length === 0) return null;
  if (rows.length === 0) {
    return (
      <p className="card__hint">
        None of this page&rsquo;s details are filled in yet: {template.fields.map((field) => field.label).join(", ")}.
      </p>
    );
  }

  return (
    <dl className="facts bpage__facts">
      {rows.map((field) => (
        <div key={field.key} className="facts__row">
          <dt className="facts__label">{field.label}</dt>
          <dd className="facts__value">
            {field.kind === "secret" ? (
              <SecretValue pageId={page.id} field={field} masked={page.secrets[field.key] ?? ""} />
            ) : (
              <Value field={field} value={page.fields[field.key]} currency={activeCompany?.currency} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Value({ field, value, currency }: { field: BrainField; value: unknown; currency: string | undefined }) {
  const text = shown(field, value, currency) ?? "";
  if (field.kind === "url") {
    return (
      <a href={text} target="_blank" rel="noreferrer noopener">
        {text.replace(/^https?:\/\//, "")}
      </a>
    );
  }
  if (field.kind === "email") return <a href={`mailto:${text}`}>{text}</a>;
  if (field.kind === "long") return <span className="bpage__long">{text}</span>;
  return <>{text}</>;
}

function SecretValue({ pageId, field, masked }: { pageId: string; field: BrainField; masked: string }) {
  const [plain, setPlain] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (plain === null) return;
    const timer = setTimeout(() => setPlain(null), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [plain]);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  async function reveal() {
    if (plain !== null) {
      setPlain(null);
      return;
    }
    try {
      setPlain(await window.caulder.brain.reveal(pageId, field.key));
    } catch (cause) {
      setNote(messageOf(cause));
    }
  }

  async function copy() {
    try {
      await window.caulder.brain.copySecret(pageId, field.key);
      setNote("Copied. It leaves the clipboard in 30 seconds.");
    } catch (cause) {
      setNote(messageOf(cause));
    }
  }

  return (
    <span className="secret">
      <span className="secret__value">{plain ?? masked}</span>
      <button
        type="button"
        className="btn btn--sm btn--ghost btn--icon"
        onClick={() => void reveal()}
        aria-label={plain === null ? `Show the ${field.label}` : `Hide the ${field.label}`}
        title={plain === null ? "Show for 20 seconds" : "Hide"}
      >
        {plain === null ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
      </button>
      <button
        type="button"
        className="btn btn--sm btn--ghost btn--icon"
        onClick={() => void copy()}
        aria-label={`Copy the ${field.label}`}
        title="Copy"
      >
        <Copy size={14} aria-hidden />
      </button>
      {note && (
        <span className="card__hint" role="status">
          {note}
        </span>
      )}
    </span>
  );
}

/** The form for a page's fields. */
export function FieldEditor({
  template,
  page,
  draft,
  secrets,
  busy,
  onField,
  onSecret,
}: {
  template: BrainTemplate;
  page: BrainPage;
  draft: FieldDraft;
  secrets: SecretDraft;
  busy: boolean;
  onField: (key: string, value: string | boolean) => void;
  onSecret: (key: string, value: string | null | undefined) => void;
}) {
  const { activeCompany } = useWorkspace();
  if (template.fields.length === 0) return null;
  const day = todayIn(activeCompany?.timezone ?? "UTC");

  return (
    <div className="fieldgrid">
      {template.fields.map((field) => {
        const id = `brain-field-${field.key}`;
        const value = draft[field.key];

        if (field.kind === "check") {
          return (
            <label key={field.key} className="checkline fieldgrid__check">
              <input
                type="checkbox"
                className="tickbox"
                checked={value === true}
                disabled={busy}
                aria-label={field.label}
                onChange={(event) => onField(field.key, event.target.checked)}
              />
              <span className="checkline__text">
                <span className="checkline__title">{field.label}</span>
                {field.hint && <span className="card__hint">{field.hint}</span>}
              </span>
            </label>
          );
        }

        return (
          <div key={field.key} className={`field${field.kind === "long" ? " fieldgrid__wide" : ""}`}>
            <label className="field__label" htmlFor={id}>
              {field.label}
            </label>
            {field.kind === "secret" ? (
              <SecretInput
                id={id}
                field={field}
                saved={page.secrets[field.key] ?? null}
                value={secrets[field.key]}
                busy={busy}
                onChange={(next) => onSecret(field.key, next)}
              />
            ) : field.kind === "choice" ? (
              <Select
                id={id}
                value={typeof value === "string" ? value : ""}
                onChange={(next) => onField(field.key, next)}
                disabled={busy}
                options={[{ value: "", label: "Not set" }, ...(field.options ?? [])]}
              />
            ) : field.kind === "quarter" ? (
              <Select
                id={id}
                value={typeof value === "string" ? value : ""}
                onChange={(next) => onField(field.key, next)}
                disabled={busy}
                options={quarterOptions(day, typeof value === "string" ? value : "")}
              />
            ) : field.kind === "long" ? (
              <textarea
                id={id}
                className="textarea"
                rows={3}
                value={typeof value === "string" ? value : ""}
                disabled={busy}
                onChange={(event) => onField(field.key, event.target.value)}
              />
            ) : (
              <input
                id={id}
                className="input"
                type={field.kind === "date" ? "date" : field.kind === "email" ? "email" : "text"}
                inputMode={field.kind === "number" || field.kind === "money" ? "decimal" : undefined}
                value={typeof value === "string" ? value : ""}
                disabled={busy}
                autoComplete="off"
                onChange={(event) => onField(field.key, event.target.value)}
              />
            )}
            {field.hint && <span className="field__hint">{field.hint}</span>}
          </div>
        );
      })}
    </div>
  );
}

function quarterOptions(day: string, current: string) {
  const quarters = quartersFrom(day);
  if (current && !quarters.includes(current)) quarters.unshift(current);
  return [
    { value: "", label: "Not set" },
    ...quarters.map((quarter) => ({ value: quarter, label: quarterLabel(quarter) })),
  ];
}

/**
 * A secret in the form. Untouched, it shows the mask and two buttons; the
 * value itself is never put in the form, so saving the page without touching
 * it leaves it exactly as it was.
 */
function SecretInput({
  id,
  field,
  saved,
  value,
  busy,
  onChange,
}: {
  id: string;
  field: BrainField;
  saved: string | null;
  value: string | null | undefined;
  busy: boolean;
  onChange: (next: string | null | undefined) => void;
}) {
  if (saved && value === undefined) {
    return (
      <div className="secret">
        <span className="secret__value" id={id}>
          {saved}
        </span>
        <button type="button" className="btn btn--sm" onClick={() => onChange("")} disabled={busy}>
          Change
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => onChange(null)} disabled={busy}>
          Remove
        </button>
      </div>
    );
  }

  if (value === null) {
    return (
      <div className="secret">
        <span className="card__hint" id={id}>
          The {field.label} goes when you save.
        </span>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => onChange(undefined)} disabled={busy}>
          Keep it
        </button>
      </div>
    );
  }

  return (
    <input
      id={id}
      className="input"
      value={value ?? ""}
      disabled={busy}
      autoComplete="off"
      spellCheck={false}
      placeholder="Kept encrypted, shown masked"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
