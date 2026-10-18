import { useEffect, useState } from "react";
import { FolderInput } from "lucide-react";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import type { LooseEnds as Loose } from "@shared/understand";

/**
 * Loose ends (PLAN.md, part five, phase 21): memories left on Random knowledge
 * or Me that sound like one of your own pages, offered as a move - never made
 * without a yes, and never a page made up for them. Asked for when the screen
 * opens, not as anything is typed; nothing shows when understanding is off or
 * has nothing to offer.
 */
export function LooseEnds({ companyId, version, onMoved }: { companyId: string; version: number; onMoved: () => void }) {
  const [loose, setLoose] = useState<Loose>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    let live = true;
    window.caulder.understand.loose(companyId).then(
      (found) => live && setLoose(found),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [companyId, version, asked]);

  async function act(work: () => Promise<void>, moved: boolean) {
    setBusy(true);
    setError(null);
    try {
      await work();
      setAsked((n) => n + 1);
      if (moved) onMoved();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  if (loose.length === 0) return null;

  return (
    <Card title="Loose ends" hint="Memories that may belong on one of your pages.">
      <ErrorLine>{error}</ErrorLine>
      {loose.map((group) => {
        const lines = group.lines.map(({ pageId, raw }) => ({ pageId, raw }));
        const from = [...new Set(group.lines.map((line) => line.pageTitle))].join(" and ");
        return (
          <section key={group.to.pageId} className="looseends__group" aria-label={`Loose ends for ${group.to.title}`}>
            <p className="looseends__say">
              {group.lines.length === 1 ? "One line" : `${group.lines.length} lines`} on {from} sound like <strong>{group.to.title}</strong>.
            </p>
            <ul className="looseends__lines">
              {group.lines.map((line) => (
                <li key={line.pageId + line.raw}>{line.says}</li>
              ))}
            </ul>
            <div className="looseends__actions">
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy}
                onClick={() => void act(() => window.caulder.understand.gather({ to: group.to.pageId, lines }), true)}
              >
                <FolderInput size={14} aria-hidden /> Move {group.lines.length === 1 ? "it" : "them"} to {group.to.title}
              </button>
              <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => void act(() => window.caulder.understand.leave(lines), false)}>
                Not these
              </button>
            </div>
          </section>
        );
      })}
    </Card>
  );
}
