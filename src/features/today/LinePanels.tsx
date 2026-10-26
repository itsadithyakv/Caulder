import { CalendarClock, Check, MessageCircleQuestion, PenLine, Trash2 } from "lucide-react";
import type { Answer } from "@shared/lines";
import type { Edit } from "@shared/edits";
import { formatTime } from "@/lib/format";

/**
 * What the smart line shows when a line is not something new: the answer to a
 * question, and the change to something already there. Said in full before
 * Enter does anything, the same bargain as the rest of the line.
 */

/** An edit, in the words it is offered in: "Move “Gym” to Tomorrow at 7 AM". */
function sayEdit(edit: Edit, when: (day: string) => string): string {
  switch (edit.do) {
    case "move":
      return `Move “${edit.task.title}” to ${when(edit.day)}${edit.time ? ` at ${formatTime(edit.time)}` : ""}`;
    case "cancel":
      return `Cancel “${edit.task.title}”${edit.task.time ? `, and its hour at ${formatTime(edit.task.time)}` : ""}`;
    case "rename":
      return `Rename “${edit.task.title}” to “${edit.title}”`;
    case "done":
      return `Tick off “${edit.task.title}”`;
  }
}

export function EditReading({ edit, when }: { edit: Edit; when: (day: string) => string }) {
  const Icon = edit.do === "cancel" ? Trash2 : edit.do === "rename" ? PenLine : edit.do === "done" ? Check : CalendarClock;
  return (
    <span className="quickadd__reading">
      <Icon size={14} className="quickadd__lead" aria-hidden />
      <strong className="quickadd__title">{sayEdit(edit, when)}</strong>
      <span className="quickadd__note">
        {edit.do === "cancel"
          ? "gone from your day - Undo puts it back"
          : edit.do === "done"
            ? "done - Undo puts it back"
          : edit.do === "move"
            ? `from ${when(edit.task.dueOn)}${edit.task.time ? ` at ${formatTime(edit.task.time)}` : ""}${
                edit.task.time && !edit.time ? ", same hour" : ""
              }`
            : "and its hour on the Calendar"}
      </span>
    </span>
  );
}

export function AnswerReading({ answer, error }: { answer: Answer | null; error: string | null }) {
  return (
    <span className="quickadd__answer">
      <span className="quickadd__reading">
        <MessageCircleQuestion size={14} className="quickadd__lead" aria-hidden />
        <strong className="quickadd__title">{error ?? answer?.say ?? "Looking…"}</strong>
      </span>
      {answer && answer.items.length > 0 && (
        <ul className="quickadd__found" aria-label="What it was read from">
          {answer.items.slice(0, 6).map((item, index) => (
            <li key={`${item.label}-${index}`}>
              <span>{item.label}</span>
              {item.detail && <span className="quickadd__foundDetail">{item.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

/** Several tasks from one line, each as it will be added. */
export function ManyReading({ parts }: { parts: { title: string; when: string | null }[] }) {
  return (
    <span className="quickadd__answer">
      <span className="quickadd__reading">
        <strong className="quickadd__title">{parts.length} tasks</strong>
        <span className="quickadd__note">from one line</span>
      </span>
      <ul className="quickadd__found" aria-label="The tasks it will add">
        {parts.map((part, index) => (
          <li key={`${part.title}-${index}`}>
            <span>{part.title}</span>
            {part.when && <span className="quickadd__foundDetail">{part.when}</span>}
          </li>
        ))}
      </ul>
    </span>
  );
}
