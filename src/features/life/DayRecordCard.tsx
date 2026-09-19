import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import type { DayRecord } from "@shared/life";
import { BLOCK_KIND_LABEL, TASK_AREA_LABEL, type BlockKind, type TaskArea } from "@shared/domain";
import { Card } from "@/components/Card";
import { formatDuration, formatValue } from "@/lib/format";

/**
 * The day in Caulder (PLAN.md, part four): beside a journal entry, what the
 * app saw happen - tasks done, calls, hours kept, notes caught, money in,
 * pages written, contacts added. The facts are already here, so the entry
 * can be what was made of them.
 */
export function DayRecordCard({
  companyId,
  day,
  onOpenPage,
  onOpenContact,
}: {
  companyId: string;
  day: string;
  onOpenPage: (pageId: string) => void;
  onOpenContact: (leadId: string) => void;
}) {
  const [record, setRecord] = useState<DayRecord | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.life.day(companyId, day).then(
      (next) => live && setRecord(next),
      () => live && setRecord(null),
    );
    return () => {
      live = false;
    };
  }, [companyId, day]);

  if (!record) return null;

  const keptTotal = record.kept.reduce((sum, entry) => sum + entry.minutes, 0);
  const paid = record.paidIn.reduce((sum, entry) => sum + entry.amount, 0);
  const nothing =
    record.tasksDone.length === 0 &&
    record.calls.length === 0 &&
    keptTotal === 0 &&
    record.notes.length === 0 &&
    paid === 0 &&
    record.pages.length === 0 &&
    record.contactsAdded === 0;

  return (
    <Card icon={<Eye size={15} aria-hidden />} title="The day in Caulder">
      {nothing ? (
        <p className="card__hint">Nothing else was recorded in Caulder that day.</p>
      ) : (
        <dl className="dayrecord">
          {record.tasksDone.length > 0 && (
            <div className="dayrecord__row">
              <dt>Done</dt>
              <dd>
                <ul className="dayrecord__list">
                  {record.tasksDone.map((task) => (
                    <li key={task.id}>
                      {task.title}
                      {task.area && <span className="dayrecord__area"> · {TASK_AREA_LABEL[task.area as TaskArea] ?? task.area}</span>}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {record.calls.length > 0 && (
            <div className="dayrecord__row">
              <dt>Calls</dt>
              <dd>
                {record.calls.map((call, index) => (
                  <span key={`${call.leadId}-${index}`}>
                    {index > 0 && ", "}
                    <button type="button" className="linkbtn" onClick={() => onOpenContact(call.leadId)}>
                      {call.name}
                    </button>
                    {call.spoke ? "" : " (no answer)"}
                  </span>
                ))}
              </dd>
            </div>
          )}
          {keptTotal > 0 && (
            <div className="dayrecord__row">
              <dt>Time kept</dt>
              <dd>
                {formatDuration(keptTotal)}:{" "}
                {record.kept
                  .map((entry) => `${BLOCK_KIND_LABEL[entry.kind as BlockKind] ?? (entry.kind === "other" ? "Other" : entry.kind)} ${formatDuration(entry.minutes)}`)
                  .join(", ")}
              </dd>
            </div>
          )}
          {paid > 0 && (
            <div className="dayrecord__row">
              <dt>Paid in</dt>
              <dd>
                {formatValue(paid, record.currency)} from {[...new Set(record.paidIn.map((entry) => entry.from))].join(", ")}
              </dd>
            </div>
          )}
          {record.pages.length > 0 && (
            <div className="dayrecord__row">
              <dt>Written</dt>
              <dd>
                {record.pages.map((page, index) => (
                  <span key={page.id}>
                    {index > 0 && ", "}
                    <button type="button" className="linkbtn" onClick={() => onOpenPage(page.id)}>
                      {page.title}
                    </button>
                  </span>
                ))}
              </dd>
            </div>
          )}
          {record.contactsAdded > 0 && (
            <div className="dayrecord__row">
              <dt>New contacts</dt>
              <dd>{record.contactsAdded}</dd>
            </div>
          )}
          {record.notes.length > 0 && (
            <div className="dayrecord__row">
              <dt>Caught</dt>
              <dd>
                <ul className="dayrecord__list">
                  {record.notes.map((note) => (
                    <li key={note.id}>{note.body.length > 160 ? `${note.body.slice(0, 159)}…` : note.body}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}
    </Card>
  );
}
