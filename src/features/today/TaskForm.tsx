import { useEffect, useId, useState, type FormEvent } from "react";
import {
  TASK_AREAS,
  TASK_AREA_LABEL,
  TASK_KINDS,
  TASK_KIND_LABEL,
  taskInput,
  type Lead,
  type Task,
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
 * Adds a task, or changes one.
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
 *
 * **Changing one sends the whole task back**, because saving replaces every
 * field. So the form is filled from the task and carries its note and its
 * contact through even where it does not show a control for them - a
 * personal workspace has no contact picker, and a task saved from there must
 * not come back without the contact it had.
 */
export function TaskForm({
  day,
  leadId,
  task,
  busy,
  onSubmit,
  onCancel,
}: {
  day: string;
  /** Fixed when adding from a lead; otherwise the form offers a picker. */
  leadId?: string;
  /** The task being changed. Without it the form adds one. */
  task?: Task;
  busy?: boolean;
  onSubmit: (input: TaskInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { activeCompany } = useWorkspace();
  const personal = activeCompany?.kind === "personal";
  // Two of these can be open at once - the full form at the top of Today and
  // one row being changed below it - so the ids the labels point at are made
  // per form rather than written out.
  const ids = useId();

  const [title, setTitle] = useState(task?.title ?? "");
  // Defaulted from where you are: a task written in a company workspace, or
  // from a lead, is about the company until you say otherwise. A string
  // rather than one of the four, because an area can be typed on the line.
  const [area, setArea] = useState<string>(
    task ? (task.area ?? "") : personal && !leadId ? "personal" : "company",
  );
  const [kind, setKind] = useState<TaskKind>(task?.kind ?? (personal ? "todo" : "follow_up"));
  // The middle by default, which is also what a task nobody set reads as.
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>(
    task?.priority === "must" || task?.priority === "spare" ? task.priority : "should",
  );
  const [dueOn, setDueOn] = useState(task?.dueOn ?? day);
  const [chosenLead, setChosenLead] = useState(leadId ?? task?.leadId ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
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
      area: area === "" ? null : area,
      // A task nobody gave a priority reads as "should" and keeps reading as
      // nobody said, unless it is changed here.
      priority: task && task.priority === null && priority === "should" ? null : priority,
      dueOn,
      leadId: chosenLead === "" ? null : chosenLead,
      notes,
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

  // An area typed on the line rather than picked is offered as itself, the
  // way the block form keeps a length the chips do not have.
  const areaOptions =
    area === "" || AREA_OPTIONS.some((option) => option.value === area)
      ? AREA_OPTIONS
      : [...AREA_OPTIONS, { value: area, label: area }];

  // The task's own contact, until the list arrives - and after it, if the
  // contact is in another workspace's list rather than this one's.
  const leadOptions = [
    { value: "", label: "Not about a contact" },
    ...leads.map((lead) => ({ value: lead.id, label: lead.name })),
  ];
  if (task?.leadId && task.leadName && !leads.some((lead) => lead.id === task.leadId)) {
    leadOptions.push({ value: task.leadId, label: task.leadName });
  }

  return (
    <form
      className="leadform anim-panel"
      onSubmit={submit}
      // Escape closes, and says it was handled so the window's own Escape
      // does not also close whatever sits behind the form. The picker stops
      // its own Escape, so one press closes an open list and not the form.
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || busy) return;
        event.preventDefault();
        onCancel();
      }}
      noValidate
    >
      <div className="field">
        <label className="field__label" htmlFor={`${ids}-title`}>
          What needs doing
        </label>
        <input
          id={`${ids}-title`}
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
            options={areaOptions}
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
          <span className="field__label" id={`${ids}-when`}>
            When
          </span>
          <div className="taskform__when">
            <div className="tabs" role="radiogroup" aria-labelledby={`${ids}-when`}>
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
            <label className="field__label" htmlFor={`${ids}-lead`}>
              Lead
            </label>
            <Select
              id={`${ids}-lead`}
              value={chosenLead}
              onChange={setChosenLead}
              options={leadOptions}
              disabled={busy}
            />
          </div>
        )}
      </div>

      <div className="field">
        <label className="field__label" htmlFor={`${ids}-notes`}>
          Notes
        </label>
        <textarea
          id={`${ids}-notes`}
          className="textarea"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
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
          {task ? "Save" : "Add task"}
        </button>
      </div>
    </form>
  );
}
