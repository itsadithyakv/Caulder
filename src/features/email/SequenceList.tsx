import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  sequenceInput,
  type EmailTemplate,
  type Sequence,
} from "@shared/email";

/**
 * Cadences.
 *
 * A step's days are counted from the previous step actually being **sent**,
 * not from enrolment. The confirmation arrives late over the file bridge, and
 * counting from the queue time would collapse a three-week cadence into
 * whatever day the export happened to run.
 */
export function SequenceList({
  companyId,
  sequences,
  templates,
  onChanged,
}: {
  companyId: string;
  sequences: Sequence[];
  templates: EmailTemplate[];
  onChanged: (sequences: Sequence[]) => void;
}) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(run: () => Promise<Sequence[]>) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await run());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const parsed = sequenceInput.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Give the sequence a name.");
      return;
    }
    await act(() => window.caulder.email.createSequence(companyId, parsed.data));
    setName("");
    setAdding(false);
  }

  return (
    <section className="card">
      <div className="leadtasks__head">
        <h2 className="card__title">Sequences</h2>
        {!adding && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setAdding(true)}
            disabled={templates.length === 0}
          >
            <Plus size={14} aria-hidden />
            New sequence
          </button>
        )}
      </div>

      <p className="card__hint">
        Each step waits a number of days after the one before it was sent. A reply
        stops the rest, and so does winning or losing the lead.
      </p>

      {templates.length === 0 && (
        <p className="card__hint">Write a template first; a sequence is made of them.</p>
      )}

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      {adding && (
        <div className="stageadd anim-panel">
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Schools outreach"
            aria-label="New sequence name"
            autoFocus
            disabled={busy}
          />
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => void create()}
            disabled={busy}
          >
            Add
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      )}

      <ul className="sequences">
        {sequences.map((sequence) => (
          <li key={sequence.id} className="sequence">
            <div className="leadtasks__head">
              <div>
                <span className="templaterow__name">{sequence.name}</span>
                <span className="batch__meta">
                  {sequence.steps.length}{" "}
                  {sequence.steps.length === 1 ? "step" : "steps"}
                  {sequence.activeCount > 0
                    ? ` · ${sequence.activeCount} running`
                    : ""}
                </span>
              </div>
              <button
                type="button"
                className="btn btn--sm btn--ghost btn--danger"
                aria-label={`Delete ${sequence.name}`}
                disabled={busy}
                onClick={() => void act(() => window.caulder.email.deleteSequence(sequence.id))}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </div>

            <ol className="steps">
              {sequence.steps.map((step, index) => (
                <li key={step.id} className="step">
                  <span className="step__when">
                    {index === 0
                      ? "Straight away"
                      : `${step.offsetDays} ${step.offsetDays === 1 ? "day" : "days"} later`}
                  </span>
                  <span className="step__template">{step.templateName}</span>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    aria-label={`Remove step ${index + 1} from ${sequence.name}`}
                    disabled={busy}
                    onClick={() => void act(() => window.caulder.email.removeStep(step.id))}
                  >
                    <X size={13} aria-hidden />
                  </button>
                </li>
              ))}
            </ol>

            <AddStep
              sequence={sequence}
              templates={templates}
              busy={busy}
              onAdd={(templateId, offsetDays) =>
                act(() => window.caulder.email.addStep(sequence.id, templateId, offsetDays))
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AddStep({
  sequence,
  templates,
  busy,
  onAdd,
}: {
  sequence: Sequence;
  templates: EmailTemplate[];
  busy: boolean;
  onAdd: (templateId: string, offsetDays: number) => Promise<void>;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  // The first step goes out on enrolment, so its offset is meaningless.
  const [days, setDays] = useState(sequence.steps.length === 0 ? "0" : "3");

  return (
    <div className="stageadd">
      <select
        className="select"
        value={templateId}
        aria-label={`Template for the next step of ${sequence.name}`}
        onChange={(event) => setTemplateId(event.target.value)}
        disabled={busy}
      >
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>

      <input
        className="input stagerow__kind"
        type="number"
        min={0}
        max={365}
        value={days}
        aria-label={`Days after the previous step for ${sequence.name}`}
        onChange={(event) => setDays(event.target.value)}
        disabled={busy || sequence.steps.length === 0}
      />

      <button
        type="button"
        className="btn btn--sm"
        disabled={busy || templateId === ""}
        onClick={() => void onAdd(templateId, Number(days) || 0)}
      >
        Add step
      </button>
    </div>
  );
}
