import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  TEMPLATE_VARIABLES,
  templateInput,
  type EmailTemplate,
  type TemplateInput,
} from "@shared/email";
import { unknownTokens } from "@shared/render";

/**
 * The messages worth writing once.
 *
 * The editor shows which tokens it recognises and, more usefully, which it does
 * not: an unknown token is left in the text rather than replaced with a blank,
 * so a typo shows up here instead of going out in a real email.
 */
export function TemplateList({
  companyId,
  templates,
  onChanged,
}: {
  companyId: string;
  templates: EmailTemplate[];
  onChanged: (templates: EmailTemplate[]) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(id: string | null, input: TemplateInput) {
    setBusy(true);
    setError(null);
    try {
      onChanged(
        id === null
          ? await window.caulder.email.createTemplate(companyId, input)
          : await window.caulder.email.updateTemplate(id, input),
      );
      setAdding(false);
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      onChanged(await window.caulder.email.deleteTemplate(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="leadtasks__head">
        <h2 className="card__title">Templates</h2>
        {!adding && (
          <button type="button" className="btn btn--sm" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden />
            New template
          </button>
        )}
      </div>

      <p className="card__hint">
        Use {TEMPLATE_VARIABLES.map((v) => v.token).join(", ")}. Anything else is
        left exactly as written.
      </p>

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      {adding && (
        <TemplateForm
          busy={busy}
          onSubmit={(input) => save(null, input)}
          onCancel={() => setAdding(false)}
        />
      )}

      {templates.length === 0 && !adding && (
        <p className="card__hint">Nothing yet. A template is a message worth writing once.</p>
      )}

      <ul className="templates">
        {templates.map((template) =>
          editing === template.id ? (
            <li key={template.id}>
              <TemplateForm
                template={template}
                busy={busy}
                onSubmit={(input) => save(template.id, input)}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={template.id} className="templaterow">
              <div className="templaterow__body">
                <span className="templaterow__name">{template.name}</span>
                <span className="templaterow__subject">{template.subject}</span>
              </div>
              <div className="detail__barActions">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => setEditing(template.id)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost btn--danger"
                  aria-label={`Delete ${template.name}`}
                  disabled={busy}
                  onClick={() => void remove(template.id)}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function TemplateForm({
  template,
  busy,
  onSubmit,
  onCancel,
}: {
  template?: EmailTemplate;
  busy: boolean;
  onSubmit: (input: TemplateInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [error, setError] = useState<string | null>(null);

  const strays = unknownTokens(`${subject} ${body}`);

  return (
    <form
      className="leadform anim-panel"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = templateInput.safeParse({ name, subject, body });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the details above.");
          return;
        }
        void onSubmit(parsed.data);
      }}
    >
      <div className="leadform__row">
        <div className="field">
          <label className="field__label" htmlFor="tpl-name">
            Name
          </label>
          <input
            id="tpl-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="First approach"
            autoComplete="off"
            disabled={busy}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="tpl-subject">
            Subject
          </label>
          <input
            id="tpl-subject"
            className="input"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="A quick question about {{lead.name}}"
            autoComplete="off"
            disabled={busy}
          />
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="tpl-body">
          Message
        </label>
        <textarea
          id="tpl-body"
          className="textarea tpl__body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={busy}
        />
      </div>

      {strays.length > 0 && (
        <p className="card__hint">
          Caulder does not know {strays.join(", ")}, so it will be sent exactly as
          written. Check the spelling.
        </p>
      )}

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
          {template ? "Save template" : "Add template"}
        </button>
      </div>
    </form>
  );
}
