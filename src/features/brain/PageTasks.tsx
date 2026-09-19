import { useEffect, useState } from "react";
import { Check, ListChecks, Play } from "lucide-react";
import type { LeadListRow } from "@shared/domain";
import type { BrainSectionId } from "@shared/brain";
import type { PageTasks as Tasks } from "@shared/steps";
import { Card } from "@/components/Card";
import { Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { formatDay } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { useWorkspace } from "@/lib/workspace";

/**
 * Under a meeting's notes, its action items and what became of them; under a
 * playbook, the button that runs it as tasks. Read again whenever the page is
 * saved, since the steps are the page's own lines.
 */
/** When a step without a date of its own falls due, and where its task goes. */
function whenHint(section: BrainSectionId, template: string): string {
  const who = "@Asha says who, (by 2026-10-02) or (day 3) says when; ";
  if (section === "meetings") return `${who}otherwise a week after the meeting.`;
  if (template === "exam") return "(by 2026-10-02) or (day 3) says when; otherwise the day before the exam. They go on Today as College.";
  if (template === "class-notes") return "(by 2026-10-02) or (day 3) says when; otherwise a week after the class. They go on Today as College.";
  if (section === "studies") return "(by 2026-10-02) or (day 3) says when; otherwise a week from today. They go on Today as College.";
  if (section === "hobbies") return "(by 2026-10-02) or (day 3) says when; otherwise a week from today. They go on Today as Personal.";
  return "(by 2026-10-02) or (day 3) says when; otherwise a week from today, in the goal's area.";
}

export function PageTasks({
  pageId,
  revision,
  section,
  template,
  onChanged,
}: {
  pageId: string;
  revision: number;
  section: BrainSectionId;
  template: string;
  onChanged: () => void;
}) {
  const { activeCompany } = useWorkspace();
  const [tasks, setTasks] = useState<Tasks | null>(null);
  const [contacts, setContacts] = useState<LeadListRow[]>([]);
  const [leadId, setLeadId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.brain.steps(pageId).then(
      (next) => live && setTasks(next),
      () => live && setTasks(null),
    );
    return () => {
      live = false;
    };
  }, [pageId, revision]);

  const running = tasks?.mode === "run";
  useEffect(() => {
    if (!running || !activeCompany) return;
    window.caulder.leads
      .list({ companyId: activeCompany.id, sort: "name", direction: "asc" })
      .then(setContacts)
      .catch(() => setContacts([]));
  }, [running, activeCompany]);

  if (!tasks || tasks.steps.length === 0) return null;

  async function make() {
    setBusy(true);
    setError(null);
    try {
      setTasks(await window.caulder.brain.makeTasks(pageId, leadId || null));
      onChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  if (tasks.mode === "run") {
    return (
      <Card
        icon={<Play size={15} aria-hidden />}
        title="Run it"
        hint="Every step becomes a task on Today, due from today - (day 3) in a step puts it three days on."
      >
        <div className="pagetasks__run">
          <Select
            aria-label="For a contact"
            value={leadId}
            disabled={busy}
            onChange={setLeadId}
            options={[
              { value: "", label: "Not for a particular contact" },
              ...contacts.map((contact) => ({ value: contact.id, label: `For ${contact.name}` })),
            ]}
          />
          <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => void make()}>
            Run as {tasks.steps.length} {tasks.steps.length === 1 ? "task" : "tasks"}
          </button>
        </div>
        {tasks.runs.tasks > 0 && (
          <p className="card__hint pagetasks__runs">
            {tasks.runs.tasks} {tasks.runs.tasks === 1 ? "task" : "tasks"} made from this playbook so far,{" "}
            {tasks.runs.open} still open.
          </p>
        )}
        <ErrorLine>{error}</ErrorLine>
      </Card>
    );
  }

  const waiting = tasks.steps.filter((entry) => !entry.step.ticked && !entry.task).length;
  const done = tasks.steps.filter((entry) => entry.task?.done || entry.step.ticked).length;

  return (
    <Card
      icon={<ListChecks size={15} aria-hidden />}
      title="As tasks"
      hint={whenHint(section, template)}
      actions={
        waiting > 0 && (
          <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => void make()}>
            Make {waiting} {waiting === 1 ? "task" : "tasks"}
          </button>
        )
      }
    >
      <p className="onboarding__progress">
        {done} of {tasks.steps.length} done
      </p>
      <ul className="onboarding" aria-label={section === "meetings" ? "Action items" : "Steps"}>
        {tasks.steps.map(({ step, task }) => (
          <li
            key={`${step.line}-${step.title}`}
            className={`onboarding__step${task?.done || step.ticked ? " onboarding__step--done" : ""}`}
          >
            {task?.done || step.ticked ? (
              <Check size={14} className="onboarding__tick" aria-label="Done" />
            ) : (
              <span className="onboarding__tick" aria-hidden />
            )}
            <span className="onboarding__title">
              {step.title}
              {step.owner && <span className="pagetasks__owner"> · {step.owner}</span>}
            </span>
            <span className="duerow__when">
              {step.ticked && !task
                ? "Ticked on the page"
                : task
                  ? task.done
                    ? "Task done"
                    : `Task, due ${formatDay(task.dueOn)}`
                  : "Not a task yet"}
            </span>
          </li>
        ))}
      </ul>
      <ErrorLine>{error}</ErrorLine>
    </Card>
  );
}
