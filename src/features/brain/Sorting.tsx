import { useEffect, useMemo, useState } from "react";
import { serviceOf, type AskState } from "@shared/ask";
import type { SortDraft } from "@shared/propose";
import { sayHome, type Sorted } from "@shared/rules";
import { sayParts } from "@shared/relevant";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { numberText } from "@/lib/format";

/**
 * A page of what was remembered, sorted (PLAN.md, part eleven, phase 41).
 *
 * Each line that would be better kept somewhere else is offered its home: a
 * rule on its subject's page in How we work, a line about a contact under
 * their Keep in mind, a line said twice let go. By what this computer can
 * check; and, with an AI connected and asked, the AI's guess at the rest -
 * only those lines are sent. Every move is ticked or not, and nothing moves
 * until Move is pressed. What a page said before is in its History.
 */
export function Sorting({
  companyId,
  pageId,
  ai,
  onMoved,
  onClose,
}: {
  companyId: string;
  pageId: string;
  /** The AI that is connected, when one is: it can be asked about what the rules could not place. */
  ai: AskState | null;
  onMoved: () => void;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState<SortDraft | null>(null);
  /** The lines that will not be moved, by how they are on the page. Everything offered is moved unless it is here. */
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<null | "ai" | "move">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.brain.sortPlan(companyId, pageId).then(
      (found) => live && setPlan({ ...found, sent: null }),
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
    };
  }, [companyId, pageId]);

  const offered = useMemo(() => (plan?.lines ?? []).filter((line): line is Sorted & { to: NonNullable<Sorted["to"]> } => line.to !== null), [plan]);
  const staying = (plan?.lines.length ?? 0) - offered.length;
  const moving = offered.filter((line) => !left.has(line.raw));
  const name = serviceOf(ai?.service)?.label ?? "the AI";

  async function askAi() {
    setBusy("ai");
    setError(null);
    try {
      setPlan(await window.caulder.ask.proposeSort(companyId, pageId));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function move() {
    if (!plan || moving.length === 0) return;
    setBusy("move");
    setError(null);
    try {
      await window.caulder.brain.applySort(companyId, { pageId: plan.pageId, moves: moving.map((line) => ({ raw: line.raw, to: line.to })) });
      onMoved();
    } catch (cause) {
      setError(messageOf(cause));
      setBusy(null);
    }
  }

  if (!plan) return <ErrorLine>{error}</ErrorLine>;

  return (
    <section className="card sorting" aria-label="Sort this page">
      <div className="section-head">
        <h2 className="card__title">Sort this page</h2>
        <span className="card__hint">
          {offered.length === 0
            ? plan.lines.length === 0
              ? "There are no remembered lines on this page."
              : "Every line is where it belongs."
            : `${offered.length} of ${plan.lines.length} lines would be better kept somewhere else. Untick any to leave it here.`}
        </span>
      </div>

      {offered.length > 0 && (
        <ul className="sorting__lines">
          {offered.map((line) => (
            <li key={line.raw} className="sorting__line">
              <label className="sorting__pick">
                <input
                  type="checkbox"
                  checked={!left.has(line.raw)}
                  disabled={busy !== null}
                  onChange={(event) =>
                    setLeft((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.delete(line.raw);
                      else next.add(line.raw);
                      return next;
                    })
                  }
                />
                <span className="sorting__says">{line.says}</span>
              </label>
              <span className="sorting__to">
                {line.to.kind === "twice" ? "Said twice - let this one go" : `To ${sayHome(line.to)}`}
                {line.by === "ai" && <span className="badge">{name} thinks so</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {plan.sent && (
        <p className="card__hint">
          Sent to {plan.sent.service} ({plan.sent.model}): {sayParts(plan.sent.parts)} - {numberText(plan.sent.characters)} characters.{" "}
          {numberText(plan.sent.usage.input)} tokens in, {numberText(plan.sent.usage.output)} out. 
        </p>
      )}
      <ErrorLine>{error}</ErrorLine>

      <div className="actions">
        {offered.length > 0 && (
          <button type="button" className="btn btn--primary" onClick={() => void move()} disabled={busy !== null || moving.length === 0}>
            {busy === "move" ? "Moving" : moving.length === 1 ? "Move 1 line" : `Move ${moving.length} lines`}
          </button>
        )}
        {ai?.connected && !plan.sent && staying > 0 && (
          <button type="button" className="btn" onClick={() => void askAi()} disabled={busy !== null}>
            {busy === "ai" ? `${name} is reading…` : `Ask ${name} about the other ${staying}`}
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy === "move"}>
          {offered.length > 0 ? "Leave it all" : "Close"}
        </button>
      </div>
      {offered.length > 0 && <p className="card__hint">Moved, the page as it is now stays in its History, and can be put back.</p>}
    </section>
  );
}
