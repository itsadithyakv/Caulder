import { useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  FileText,
  Mail,
  MailOpen,
  MailWarning,
  MailX,
  MessageCircle,
  MoveRight,
  Pencil,
  Phone,
  Reply,
  Sparkles,
  Undo2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import {
  ACTIVITY_LABEL,
  LOGGABLE_KINDS,
  type Activity,
  type ActivityKind,
  type LoggableKind,
} from "@shared/domain";
import { formatDateTime } from "@/lib/format";

const ICON: Record<ActivityKind, LucideIcon> = {
  created: Sparkles,
  note: FileText,
  call: Phone,
  meeting: CalendarClock,
  whatsapp: MessageCircle,
  stage_change: MoveRight,
  field_change: Pencil,
  email_queued: Mail,
  email_sent: Mail,
  email_opened: MailOpen,
  email_replied: Reply,
  email_failed: MailX,
  email_bounced: MailWarning,
  task_done: CheckCircle2,
  imported: Upload,
  import_undone: Undo2,
};

const LOG_LABEL: Record<LoggableKind, string> = {
  note: "Note",
  call: "Call",
  meeting: "Meeting",
  whatsapp: "WhatsApp",
};

/**
 * The record of what happened, newest first, with the box to add to it on top.
 *
 * Entries are never edited: a correction is a new entry. That is what makes
 * the timeline worth reading six months later.
 */
export function Timeline({
  activities,
  onLog,
}: {
  activities: Activity[];
  onLog: (kind: LoggableKind, body: string) => Promise<void>;
}) {
  const [kind, setKind] = useState<LoggableKind>("note");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const text = body.trim();
    if (text.length === 0) return;

    setBusy(true);
    try {
      await onLog(kind, text);
      setBody("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="timeline">
      <div className="timeline__compose">
        <div className="tabs" role="tablist" aria-label="What happened">
          {LOGGABLE_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              className="tab"
              aria-selected={kind === option}
              onClick={() => setKind(option)}
            >
              {LOG_LABEL[option]}
            </button>
          ))}
        </div>

        <textarea
          className="textarea timeline__input"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={
            kind === "call"
              ? "What was said, and what happens next"
              : kind === "meeting"
                ? "Who was there, and what was agreed"
                : "Anything worth remembering"
          }
          maxLength={4000}
          disabled={busy}
          aria-label={`${LOG_LABEL[kind]} details`}
          onKeyDown={(event) => {
            // Enter inserts a newline; the shortcut submits, because these
            // entries are usually more than one line.
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void submit();
            }
          }}
        />

        <div className="timeline__composeFoot">
          <span className="card__hint">
            {kind === "note"
              ? "A note does not count as contact."
              : "Logging this updates when you last spoke to them."}
          </span>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => void submit()}
            disabled={busy || body.trim().length === 0}
          >
            Log {LOG_LABEL[kind].toLowerCase()}
          </button>
        </div>
      </div>

      <ol className="timeline__list">
        {activities.map((activity) => {
          const Icon = ICON[activity.kind];
          return (
            <li key={activity.id} className="entry">
              <span className="entry__icon" aria-hidden>
                <Icon size={14} />
              </span>
              <div className="entry__body">
                <div className="entry__head">
                  <span className="entry__kind">{ACTIVITY_LABEL[activity.kind]}</span>
                  <time className="entry__when" dateTime={activity.occurredAt}>
                    {formatDateTime(activity.occurredAt)}
                  </time>
                </div>
                {activity.body && <p className="entry__text">{activity.body}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
