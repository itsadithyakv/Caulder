import { useState } from "react";
import {
  AtSign,
  CalendarClock,
  CheckCircle2,
  FileText,
  Mail,
  MailOpen,
  MailWarning,
  MailX,
  MessageCircle,
  MessagesSquare,
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
  linkedin: MessagesSquare,
  instagram: AtSign,
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
  replied: Reply,
};

const LOG_LABEL: Record<LoggableKind, string> = {
  note: "Note",
  call: "Call",
  meeting: "Meeting",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  // Where Caulder cannot see a reply - WhatsApp, LinkedIn, the phone - it is said here.
  replied: "They answered",
};

/** Three things to log, not seven: a note, a conversation, a message - and which, under the last two. */
const GROUPS: readonly { id: string; label: string; kinds: readonly LoggableKind[] }[] = [
  { id: "note", label: "Note", kinds: ["note"] },
  { id: "spoke", label: "Call or meeting", kinds: ["call", "meeting"] },
  { id: "message", label: "Message", kinds: ["whatsapp", "linkedin", "instagram", "replied"] },
];

const CHANNEL_LABEL: Partial<Record<LoggableKind, string>> = {
  call: "Call",
  meeting: "Meeting",
  whatsapp: "On WhatsApp",
  linkedin: "On LinkedIn",
  instagram: "On Instagram",
  replied: "Their reply",
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
        <div className="tabs tabs--line" role="tablist" aria-label="What happened">
          {GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={group.kinds.includes(kind)}
              onClick={() => !group.kinds.includes(kind) && setKind(group.kinds[0] ?? "note")}
            >
              {group.label}
            </button>
          ))}
        </div>
        {(() => {
          const group = GROUPS.find((each) => each.kinds.includes(kind));
          if (!group || group.kinds.length < 2) return null;
          return (
            <div className="chips timeline__channel" role="group" aria-label="Which">
              {group.kinds.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`chip${kind === option ? " chip--on" : ""}`}
                  aria-pressed={kind === option}
                  onClick={() => setKind(option)}
                >
                  {CHANNEL_LABEL[option] ?? LOG_LABEL[option]}
                </button>
              ))}
            </div>
          );
        })()}

        <textarea
          className="textarea timeline__input"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={
            kind === "call"
              ? "What was said, and what happens next"
              : kind === "meeting"
                ? "Who was there, and what was agreed"
                : kind === "replied"
                  ? "What they said"
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
          <span className="card__hint">{kind === "note" ? "" : "Updates when you last spoke to them."}</span>
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
