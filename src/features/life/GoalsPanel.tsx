import { useEffect, useState } from "react";
import { Check, Mountain } from "lucide-react";
import type { GoalRow } from "@shared/life";
import { TASK_AREA_LABEL, type TaskArea } from "@shared/domain";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { formatDay } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * Your own goals with how far along each is (PLAN.md, part four). A bar only
 * where there is a number to reach; a goal without one is a sentence and a
 * day. Done ones sink to the bottom, ticked.
 */
export function GoalsPanel({
  companyId,
  version,
  onOpen,
  title = "How far along",
}: {
  companyId: string;
  version: number;
  onOpen: (pageId: string) => void;
  title?: string;
}) {
  const [goals, setGoals] = useState<GoalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.life.goals(companyId).then(
      (next) => live && setGoals(next),
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
    };
  }, [companyId, version]);

  if (!goals) return <ErrorLine>{error}</ErrorLine>;
  if (goals.length === 0) return null;

  return (
    <Card icon={<Mountain size={15} aria-hidden />} title={title}>
      <ul className="lifebars" aria-label="Goals">
        {goals.map((goal) => (
          <li key={goal.id} className={`lifebar${goal.done ? " lifebar--done" : ""}`}>
            <button type="button" className="lifebar__name" onClick={() => onOpen(goal.id)}>
              {goal.done && <Check size={14} aria-label="Done" />}
              {goal.title}
            </button>
            {goal.area && (
              <span className={`badge badge--neutral area--${goal.area}`}>
                {TASK_AREA_LABEL[goal.area as TaskArea] ?? goal.area}
              </span>
            )}
            {goal.percent !== null && (
              <span
                className="lifebar__track"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={goal.percent}
                aria-label={`${goal.title}: ${goal.percent}% of the way`}
              >
                <span className="lifebar__fill" style={{ width: `${Math.max(goal.percent, 2)}%` }} />
              </span>
            )}
            <span className="lifebar__words">
              {goal.target !== null
                ? `${goal.progress ?? 0} of ${goal.target}${goal.unit ? ` ${goal.unit}` : ""}`
                : goal.done
                  ? "Done"
                  : "No number to reach"}
              {goal.byOn && !goal.done ? ` · by ${formatDay(goal.byOn)} (${inDays(goal.daysLeft ?? 0)})` : ""}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Days left as words: "today", "in 12 days", "passed". */
function inDays(days: number): string {
  if (days < 0) return "passed";
  if (days === 0) return "today";
  return days === 1 ? "tomorrow" : `in ${days} days`;
}
