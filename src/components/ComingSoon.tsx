import { Hammer } from "lucide-react";
import type { RouteId } from "@/app/routes";

/**
 * Phase 1 stands the shell up with no database behind it. Each screen states
 * plainly what it will do and which phase builds it, rather than showing a
 * spinner that never resolves.
 *
 * Deleted once every route has a real screen.
 */
const PHASE: Record<RouteId, { phase: string; body: string }> = {
  today: {
    phase: "Phase 5",
    body: "The daily list: what is overdue, what is due today grouped by calls and follow-ups, which emails are ready to send, who has replied, and which leads are going cold.",
  },
  leads: {
    phase: "Phase 3",
    body: "Every lead in a filterable table, with saved views and a detail panel showing the full activity timeline.",
  },
  pipeline: {
    phase: "Phase 6",
    body: "A board of your stages. Drag a lead across to move it, and the move records itself on the timeline.",
  },
  import: {
    phase: "Phase 4",
    body: "Download the template, drop in a spreadsheet, map the columns, resolve any duplicates, then commit. Every import can be undone.",
  },
  email: {
    phase: "Phase 7",
    body: "Templates and follow-up sequences, the queue waiting to go out, and the export and import steps that exchange files with your Apps Script.",
  },
  settings: {
    phase: "Phase 2",
    body: "Companies, pipeline stages, the sync folder, appearance and backups.",
  },
};

export function ComingSoon({ route }: { route: RouteId }) {
  const detail = PHASE[route];

  return (
    <section className="card">
      <div className="empty">
        <Hammer size={26} className="empty__icon" aria-hidden />
        <p className="empty__title">Not built yet, {detail.phase}</p>
        <p className="empty__body">{detail.body}</p>
      </div>
    </section>
  );
}
