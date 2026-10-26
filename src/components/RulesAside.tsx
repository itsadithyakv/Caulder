import { useEffect, useState } from "react";
import type { RulesShown } from "@shared/ipc";

/**
 * The rules the company keeps on a subject, beside the thing they are about
 * (PLAN.md, part eleven, phase 42): the payment terms next to a new invoice,
 * the pricing rules next to a quote. A few lines, read where the question
 * comes up, so the brain does not have to be opened to check.
 *
 * Says nothing at all when there are no rules on the subject yet: an empty
 * box telling somebody to go and write rules is not an answer to anything.
 */
export function RulesAside({
  companyId,
  subjects,
  onOpenPage,
}: {
  companyId: string;
  /** Subjects of How we work (shared/rules.ts), the most relevant first. */
  subjects: readonly string[];
  /** Opens a subject's page, where there is a way to from here. */
  onOpenPage?: (pageId: string) => void;
}) {
  const [shown, setShown] = useState<RulesShown[]>([]);
  const key = subjects.join("|");

  useEffect(() => {
    let live = true;
    // A nicety: a brain that will not open is no reason for the form beside it not to.
    Promise.all(subjects.map((subject) => window.caulder.brain.rulesOn(companyId, subject))).then(
      (found) => live && setShown(found.filter((each) => each.rules.length > 0)),
      () => undefined,
    );
    return () => {
      live = false;
    };
    // The key stands for the subjects: the array is new on every draw.
  }, [companyId, key]);

  if (shown.length === 0) return null;

  return (
    <aside className="rulesaside" aria-label="Your rules on this">
      {shown.map((subject) => (
        <div key={subject.title} className="rulesaside__subject">
          <p className="rulesaside__title">
            {onOpenPage && subject.pageId ? (
              <button type="button" className="linkbtn" onClick={() => subject.pageId && onOpenPage(subject.pageId)}>
                {subject.title}
              </button>
            ) : (
              subject.title
            )}
            <span className="rulesaside__from">how you work</span>
          </p>
          <ul className="rulesaside__rules">
            {subject.rules.map((rule) => (
              <li key={rule.says}>
                {rule.fact ? <strong>{rule.fact}: </strong> : null}
                {rule.says}
              </li>
            ))}
          </ul>
          {subject.total > subject.rules.length && <p className="rulesaside__more">and {subject.total - subject.rules.length} more on its page</p>}
        </div>
      ))}
    </aside>
  );
}
