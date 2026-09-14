import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import type {
  Activity,
  Lead,
  LeadInput,
  LoggableKind,
  PipelineStage,
} from "@shared/domain";
import { LeadForm } from "./LeadForm";
import { Timeline } from "./Timeline";
import { StageBadge } from "./StageBadge";
import { LeadTasks } from "./LeadTasks";
import { LeadEmail } from "./LeadEmail";
import { LeadWhatsApp } from "./LeadWhatsApp";
import { LeadMoney } from "./LeadMoney";
import { Attachments, CustomFields } from "./LeadExtras";
import { formatDate, formatValue, relativeDay } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { ErrorLine } from "@/components/ErrorLine";

/**
 * One lead: its details, and everything that has happened to it.
 *
 * A full view rather than a drawer over the table. The timeline is the reason
 * to open a lead at all, and it needs the room.
 */
export function LeadDetail({
  leadId,
  stages,
  onBack,
  onGoToMoney,
  onSaved,
  onDeleted,
}: {
  leadId: string;
  stages: PipelineStage[];
  onBack: () => void;
  onGoToMoney: () => void;
  onSaved: (lead: Lead) => void;
  onDeleted: (id: string) => void;
}) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);

  /**
   * Loads its own lead rather than reading one out of the table's list. A lead
   * that was just created is not in that list yet, and one the filters exclude
   * never will be, so depending on it would make opening a lead a race.
   */
  const load = useCallback(() => {
    Promise.all([
      window.caulder.leads.find(leadId),
      window.caulder.activities.list(leadId),
    ])
      .then(([found, timeline]) => {
        setLead(found);
        setActivities(timeline);
      })
      .catch((cause: unknown) =>
        setError(messageOf(cause)),
      );
  }, [leadId]);

  useEffect(load, [load]);

  async function save(input: LeadInput) {
    setBusy(true);
    try {
      const updated = await window.caulder.leads.update(leadId, input);
      setLead(updated);
      onSaved(updated);
      setEditing(false);
      // An edit can write a stage_change or field_change entry, so the
      // timeline is no longer what it was.
      load();
    } finally {
      setBusy(false);
    }
  }

  async function log(kind: LoggableKind, body: string) {
    await window.caulder.activities.log({ leadId, kind, body });
    // A call or meeting moves last-contacted, which the list column shows.
    const refreshed = await window.caulder.leads.find(leadId);
    if (refreshed) {
      setLead(refreshed);
      onSaved(refreshed);
    }
    setActivities(await window.caulder.activities.list(leadId));
  }

  async function remove() {
    setBusy(true);
    try {
      await window.caulder.leads.remove(leadId);
      onDeleted(leadId);
    } catch (cause) {
      setError(messageOf(cause));
      setBusy(false);
    }
  }

  if (!lead) {
    return (
      <section className="card">
        <div className="empty">
          <p className="empty__title">
            {error ? "That lead could not be opened" : "Loading"}
          </p>
          {error && <p className="empty__body">{error}</p>}
          <button type="button" className="btn" onClick={onBack}>
            All leads
          </button>
        </div>
      </section>
    );
  }

  const stage = lead.stageId ? stages.find((s) => s.id === lead.stageId) : undefined;

  return (
    <div className="detail">
      <div className="detail__bar">
        <button type="button" className="btn btn--sm" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden />
          All contacts
        </button>

        <div className="detail__barActions">
          {!editing && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setEditing(true)}
            >
              Edit details
            </button>
          )}
          {!confirmingDelete ? (
            <button
              type="button"
              className="btn btn--sm btn--ghost btn--danger"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 size={14} aria-hidden />
              Delete
            </button>
          ) : (
            <span className="detail__confirm">
              <span className="card__hint">Deletes the lead and its history.</span>
              <button
                type="button"
                className="btn btn--sm btn--danger"
                onClick={() => void remove()}
                disabled={busy}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep
              </button>
            </span>
          )}
        </div>
      </div>

      <ErrorLine>{error}</ErrorLine>

      <div className="detail__grid">
        <section className="card detail__facts">
          {editing ? (
            <LeadForm
              lead={lead}
              stages={stages}
              busy={busy}
              onSubmit={save}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <div className="detail__head">
                <h2 className="detail__name">{lead.name}</h2>
                <StageBadge stage={stage} />
                {lead.doNotContact && (
                  <span className="badge badge--danger">Do not contact</span>
                )}
              </div>

              <dl className="facts">
                <Fact label="Contact" value={lead.contactPerson} />
                <Fact label="Email" value={lead.email} />
                <Fact label="Phone" value={lead.phone} />
                <Fact label="Alt phone" value={lead.altPhone} />
                <Fact label="City" value={lead.city} />
                <Fact label="Location" value={lead.location} />
                <Fact label="PIN" value={lead.pin} />
                <Fact label="Source" value={lead.source} />
                <Fact
                  label="Value"
                  value={lead.value === null ? null : formatValue(lead.value)}
                />
                <Fact label="Website" value={lead.website} link />
                <Fact
                  label="Last contacted"
                  value={lead.lastContactedAt ? relativeDay(lead.lastContactedAt) : null}
                  empty="Never"
                />
                <Fact label="Added" value={formatDate(lead.createdAt)} />
              </dl>

              {lead.notes && (
                <div className="detail__notes">
                  <span className="field__label">Notes</span>
                  <p className="detail__notesBody">{lead.notes}</p>
                </div>
              )}

              {/* What this lead has on it that the app did not decide. Under
                  the facts, because it is reference, not work. */}
              <CustomFields leadId={leadId} />
              <Attachments leadId={leadId} />
            </>
          )}
        </section>

        <section className="card detail__timeline">
          {/* What happens next, then the ways to make it happen, then what
              already did. The history is the reason to open a lead at all,
              and it used to sit under four other cards. */}
          <LeadTasks leadId={leadId} onTimelineChanged={load} />

          <div className="detail__historyTitle">
            <LeadEmail lead={lead} onTimelineChanged={load} />
          </div>

          <div className="detail__historyTitle">
            <LeadWhatsApp lead={lead} onTimelineChanged={load} />
          </div>

          <div className="detail__historyTitle">
            <LeadMoney leadId={leadId} onOpenMoney={onGoToMoney} />
          </div>

          <h2 className="card__title detail__historyTitle">History</h2>
          <Timeline activities={activities} onLog={log} />
        </section>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  link,
  empty = "Not known",
}: {
  label: string;
  value: string | null;
  link?: boolean;
  empty?: string;
}) {
  return (
    <div className="facts__row">
      <dt className="facts__label">{label}</dt>
      <dd className="facts__value">
        {value === null || value === "" ? (
          <span className="leadrow__missing">{empty}</span>
        ) : link ? (
          <a href={href(value)} target="_blank" rel="noreferrer noopener">
            {value}
            <ExternalLink size={12} aria-hidden />
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

/** Bare domains are common in this data; without a scheme they resolve as relative. */
function href(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
