import { useEffect, useState, type FormEvent } from "react";
import {
  TASK_KINDS,
  TASK_KIND_LABEL,
  taskInput,
  type Lead,
  type TaskInput,
  type TaskKind,
} from "@shared/domain";
import { shiftDay } from "@shared/dates";
import { useWorkspace } from "@/lib/workspace";

/**
 * Adds a task.
 *
 * The date is offered as three buttons before it is offered as a date field,
 * because "today", "tomorrow" and "next week" cover nearly every follow-up
 * somebody actually sets.
 */
export function TaskForm({
  day,
  leadId,
  busy,
  onSubmit,
  onCancel,
}: {
  day: string;
  /** Fixed when adding from a lead; otherwise the form offers a picker. */
  leadId?: string;
  busy?: boolean;
  onSubmit: (input: TaskInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { activeCompany } = useWorkspace();

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TaskKind>("follow_up");
  const [dueOn, setDueOn] = useState(day);
  const [chosenLead, setChosenLead] = useState(leadId ?? "");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Only needed when the task is not already attached to a lead.
  useEffect(() => {
    if (leadId || !activeCompany) return;
    window.caulder.leads
      .list({ companyId: activeCompany.id, sort: "name" })
      .then(setLeads)
      .catch(() => setLeads([]));
  }, [leadId, activeCompany]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = taskInput.safeParse({
      title,
      kind,
      dueOn,
      leadId: chosenLead === "" ? null : chosenLead,
      notes: "",
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

  const presets: { label: string; value: string }[] = [
    { label: "Today", value: day },
    { label: "Tomorrow", value: shiftDay(day, 1) },
    { label: "Next week", value: shiftDay(day, 7) },
  ];

  return (
    <form className="leadform anim-panel" onSubmit={submit} noValidate>
      <div className="field">
        <label className="field__label" htmlFor="task-title">
          What needs doing
        </label>
        <input
          id="task-title"
          className={`input${error ? " input--invalid" : ""}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Call the principal about the demo"
          autoFocus
          autoComplete="off"
          maxLength={200}
          disabled={busy}
        />
      </div>

      <div className="leadform__row">
        <div className="field">
          <label className="field__label" htmlFor="task-kind">
            Kind
          </label>
          <select
            id="task-kind"
            className="select"
            value={kind}
            onChange={(event) => setKind(event.target.value as TaskKind)}
            disabled={busy}
          >
            {TASK_KINDS.map((option) => (
              <option key={option} value={option}>
                {TASK_KIND_LABEL[option]}
              </option>
            ))}
          </select>
        </div>

        {!leadId && (
          <div className="field">
            <label className="field__label" htmlFor="task-lead">
              Lead
            </label>
            <select
              id="task-lead"
              className="select"
              value={chosenLead}
              onChange={(event) => setChosenLead(event.target.value)}
              disabled={busy}
            >
              <option value="">Not about a lead</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="field">
        <span className="field__label" id="task-when">
          When
        </span>
        <div className="taskform__when">
          <div className="tabs" role="radiogroup" aria-labelledby="task-when">
            {presets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                role="radio"
                className="tab"
                aria-checked={dueOn === preset.value}
                aria-selected={dueOn === preset.value}
                onClick={() => setDueOn(preset.value)}
                disabled={busy}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            className="input taskform__date"
            type="date"
            value={dueOn}
            onChange={(event) => setDueOn(event.target.value)}
            aria-label="Or pick a date"
            disabled={busy}
          />
        </div>
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
          Add task
        </button>
      </div>
    </form>
  );
}
