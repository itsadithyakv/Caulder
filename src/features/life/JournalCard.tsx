import { useCallback, useEffect, useState } from "react";
import { NotebookPen } from "lucide-react";
import type { Mood } from "@shared/brain";
import type { JournalDay } from "@shared/life";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { MoodPicker } from "./MoodPicker";

/**
 * The journal on Today (PLAN.md, part four): how the day felt in one press,
 * and the entry a button away. Quiet - a card at the foot of the side, never
 * a banner - because a journal kept out of guilt is not worth keeping.
 */
export function JournalCard({ companyId, onOpenJournal }: { companyId: string; onOpenJournal: () => void }) {
  const [entry, setEntry] = useState<JournalDay | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    window.caulder.life.today(companyId).then(
      (next) => setEntry(next.entry),
      (cause: unknown) => setError(messageOf(cause)),
    );
  }, [companyId]);
  useEffect(load, [load]);

  async function pick(mood: Mood | null) {
    setBusy(true);
    setError(null);
    try {
      const page = entry ? { id: entry.pageId } : await window.caulder.life.entry(companyId, null);
      await window.caulder.life.mood(page.id, mood);
      load();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  if (entry === undefined) return <ErrorLine>{error}</ErrorLine>;

  return (
    <Card icon={<NotebookPen size={15} aria-hidden />} title="Journal">
      <p className="card__hint">{entry ? "How today felt:" : "How did today go?"}</p>
      <MoodPicker value={entry?.mood ?? null} busy={busy} onPick={(mood) => void pick(mood)} label="How today felt" />
      {entry?.excerpt && <p className="journalcard__excerpt">{entry.excerpt}</p>}
      <div className="actions">
        <button type="button" className="btn btn--sm" disabled={busy} onClick={onOpenJournal}>
          {entry ? "Open today's entry" : "Write about it"}
        </button>
      </div>
      <ErrorLine>{error}</ErrorLine>
    </Card>
  );
}
