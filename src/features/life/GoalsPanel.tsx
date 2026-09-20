import { useEffect, useState } from "react";
import { Mountain } from "lucide-react";
import type { GoalDetail } from "@shared/goals";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { GoalCard } from "./GoalCard";

/**
 * Your own goals (PLAN.md, part four; kept up with after 0.4): each with how
 * it is doing against its day, the line it has drawn, and the press that
 * moves it. Done ones sink to the bottom, ticked, without a chart.
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
  const [goals, setGoals] = useState<GoalDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.life.goalDetails(companyId).then(
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
    <Card icon={<Mountain size={15} aria-hidden />} title={title} hint="+1 when it moves; the line shows whether you are on pace.">
      <ul className="goalcards" aria-label="Goals">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onOpen={onOpen}
            onChanged={(next) => setGoals((current) => current?.map((each) => (each.id === next.id ? next : each)) ?? null)}
          />
        ))}
      </ul>
    </Card>
  );
}
