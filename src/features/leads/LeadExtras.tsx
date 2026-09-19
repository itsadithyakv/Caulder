import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Paperclip, Trash2 } from "lucide-react";
import type { CustomField } from "@shared/domain";
import { DOCUMENT_CATEGORY_LABEL, type CompanyDocument } from "@shared/deadlines";
import { useWorkspace } from "@/lib/workspace";
import { Select } from "@/components/Select";
import { messageOf } from "@/lib/errors";
import { ErrorLine } from "@/components/ErrorLine";

/**
 * The two things on a lead that Caulder did not decide: the files you attached
 * to it, and the fields you invented for it.
 *
 * One file because they sit together under the lead's details and both answer
 * the same question — what does this lead have on it that the app itself
 * knows nothing about.
 */

/** A size a person can read, rather than a number of bytes. */
export function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Attachments({ leadId }: { leadId: string }) {
  const { activeCompany } = useWorkspace();
  const [files, setFiles] = useState<CompanyDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCompany) return;
    void window.caulder.documents.list(activeCompany.id, leadId).then(setFiles);
  }, [activeCompany, leadId]);

  async function attach() {
    if (!activeCompany) return;
    setBusy(true);
    setError(null);
    try {
      const next = await window.caulder.documents.add(activeCompany.id, { leadId });
      // Null means the dialog was cancelled, which is not a change and not an
      // error - leaving the list alone is the whole response.
      if (next) setFiles(next);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="detail__extra">
      <h2 className="card__title">Files</h2>
      <ErrorLine>{error}</ErrorLine>

      {files.length > 0 && (
        <ul className="files">
          {files.map((file) => (
            <li key={file.id} className="file">
              <Paperclip size={14} className="file__icon" aria-hidden />
              <button
                type="button"
                className="file__name"
                onClick={() =>
                  void window.caulder.documents.open(file.id).catch((cause: unknown) => setError(messageOf(cause)))
                }
                title={file.hasFile ? "Open it" : file.location ?? undefined}
                disabled={!file.hasFile}
              >
                {file.name}
                {file.hasFile && <ExternalLink size={12} aria-hidden />}
              </button>
              <span className="file__size">
                {file.category !== "other" && `${DOCUMENT_CATEGORY_LABEL[file.category]} · `}
                {file.bytes !== null ? readableSize(file.bytes) : file.location}
              </span>
              <button
                type="button"
                className="btn btn--sm btn--ghost btn--danger"
                onClick={async () => setFiles(await window.caulder.documents.remove(file.id))}
                aria-label={`Remove ${file.name}`}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button type="button" className="btn" onClick={() => void attach()} disabled={busy}>
          <Paperclip size={15} aria-hidden />
          {files.length === 0 ? "Attach a file" : "Attach another"}
        </button>
      </div>
    </section>
  );
}

/**
 * The fields this company invented, and what this lead says in them.
 *
 * Saved on blur rather than on every keystroke: a write per character would
 * be a timeline entry per character, and the point of a custom field is that
 * it behaves like the built-in ones.
 */
export function CustomFields({ leadId }: { leadId: string }) {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const [fields, setFields] = useState<CustomField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!companyId) return;
    void window.caulder.fields.list(companyId).then(setFields);
  }, [companyId]);

  useEffect(() => {
    void window.caulder.fields.values(leadId).then((next) => {
      setValues(next);
      setDraft(next);
    });
  }, [leadId]);

  const save = useCallback(
    async (fieldId: string, value: string) => {
      if (value === (values[fieldId] ?? "")) return;
      const next = await window.caulder.fields.setValue(leadId, fieldId, value);
      setValues(next);
      setDraft(next);
    },
    [leadId, values],
  );

  // Nothing to show and nothing to explain: the place to add fields is
  // Settings, and saying so on every lead would be noise on all of them.
  if (fields.length === 0) return null;

  return (
    <section className="detail__extra">
      <h2 className="card__title">Your own fields</h2>

      <dl className="facts">
        {fields.map((field) => (
          <div key={field.id} className="facts__row">
            <dt className="facts__label">
              <label htmlFor={`field-${field.id}`}>{field.name}</label>
            </dt>
            <dd className="facts__value">
              {field.kind === "choice" ? (
                <Select
                  id={`field-${field.id}`}
                  value={draft[field.id] ?? ""}
                  onChange={(value) => void save(field.id, value)}
                  options={[
                    { value: "", label: "Not set" },
                    ...field.choices.map((choice) => ({ value: choice, label: choice })),
                  ]}
                />
              ) : (
                <input
                  id={`field-${field.id}`}
                  className="input"
                  type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"}
                  value={draft[field.id] ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [field.id]: event.target.value }))
                  }
                  onBlur={(event) => void save(field.id, event.target.value)}
                  placeholder="Not set"
                />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
