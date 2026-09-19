import { useEffect, useState, type FormEvent } from "react";
import {
  TASK_AREAS,
  TASK_AREA_LABEL,
  TASK_KINDS,
  TASK_KIND_LABEL,
  taskInput,
  type Lead,
  type TaskArea,
  type TaskInput,
  type TaskKind,
} from "@shared/domain";
import { shiftDay } from "@shared/dates";
import { useWorkspace } from "@/lib/workspace";
import { Chips, Select } from "@/components/Select";
import { PRIORITIES, PRIORITY_LABEL } from "@shared/priority";
import { messageOf } from "@/lib/errors";

const AREA_OPTIONS = TASK_AREAS.map((value) => ({ value, label: TASK_AREA_LABEL[value] }));
const KIND_OPTIONS = TASK_KINDS.map((value) => ({ value, label: TASK_KIND_LABEL[value] }));
const PRIORITY_OPTIONS = PRIORITIES.map((value) => ({ value, label: PRIORITY_LABEL[value] }));

/**
 * Adds a task.
 *
 * Every choice here is visible without opening anything. The date is offered
 * as three buttons before it is offered as a date field, because "today",
 * "tomorrow" and "next week" cover nearly every follow-up somebody sets; the
 * area and the kind are chips for the same reason. Only the lead is a list you
 * open, because there may be two hundred of them.
 *
 * **Area and kind are different questions.** Kind is the verb - call, email,
 * follow up. Area is which part of your life it is - the degree, the company,
 * yourself, your health. "Email the professor" and "email the principal" are
 * the same kind and different areas, and only one of them is about the funnel.
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
  const personal = activeCompany?.kind === "personal";

  const [title, setTitle] = useState("");
  // Defaulted from where you are: a task written in a company workspace, or
  // from a lead, is about the company until you say otherwise.
  const [area, setArea] = useState<TaskArea>(personal && !leadId ? "personal" : "company");
  const [kind, setKind] = useState<TaskKind>(personal ? "todo" : "follow_up");
  // The middle by default, which is also what a task nobody set reads as.
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("should");
  const [dueOn, setDueOn] = useState(day);
  const [chosenLead, setChosenLead] = useState(leadId ?? "");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Only needed when the task is not already attached to a lead.
  useEffect(() => {
    // A personal workspace has no leads to offer.
    if (leadId || !activeCompany || personal) return;
    window.caulder.leads
      .list({ companyId: activeCompany.id, sort: "name" })
      .then(setLeads)
      .catch(() => setLeads([]));
  }, [leadId, activeCompany, personal]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = taskInput.safeParse({
      title,
      kind,
      area,
      priority,
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
      setError(messageOf(cause));
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
          placeholder="Call Asha about the demo"
          autoFocus
          autoComplete="off"
          maxLength={200}
          disabled={busy}
        />
      </div>

      <div className="taskform__grid">
        <div className="field">
          <span className="field__label">Area</span>
          <Chips
            value={area}
            options={AREA_OPTIONS}
            onChange={setArea}
            aria-label="Area"
            disabled={busy}
          />
        </div>

        <div className="field">
          <span className="field__label">Kind</span>
          <Chips
            value={kind}
            options={KIND_OPTIONS}
            onChange={setKind}
            aria-label="Kind"
            disabled={busy}
          />
        </div>
      </div>

      <div className="field">
        <span className="field__label">How much it matters</span>
        <Chips
          value={priority}
          options={PRIORITY_OPTIONS}
          onChange={setPriority}
          aria-label="How much it matters"
          disabled={busy}
        />
      </div>

      <div className="taskform__grid">
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

        {!leadId && !personal && (
          <div className="field">
            <label className="field__label" htmlFor="task-lead">
              Lead
            </label>
            <Select
              id="task-lead"
              value={chosenLead}
              onChange={setChosenLead}
              options={[
                { value: "", label: "Not about a contact" },
                ...leads.map((lead) => ({ value: lead.id, label: lead.name })),
              ]}
              disabled={busy}
            />
          </div>
        )}
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
