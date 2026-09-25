import { useEffect, useState } from "react";
import { Mountain } from "lucide-react";
import type { GoalDetail } from "@shared/goals";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { GoalCard } from "./GoalCard";
import { goalsByArea } from "./goalAreas";

/**
 * Your own goals (PLAN.md, part four; kept up with after 0.4): each with how
 * it is doing against its day, the line it has drawn, and the press that
 * moves it. Done ones sink to the bottom, ticked, without a chart. On the
 * Goals tab they sit under their areas - College, Company, Personal, Health -
 * so a year that is all one thing shows as that; the overview keeps one list.
 */
export function GoalsPanel({
  companyId,
  version,
  onOpen,
  title = "How far along",
  byArea = true,
}: {
  companyId: string;
  version: number;
  onOpen: (pageId: string) => void;
  title?: string;
  /** Under a heading for each area. */
  byArea?: boolean;
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

  const changed = (next: GoalDetail) => setGoals((current) => current?.map((each) => (each.id === next.id ? next : each)) ?? null);
  const cards = (list: GoalDetail[], label: string) => (
    <ul className="goalcards" aria-label={label}>
      {list.map((goal) => (
        <GoalCard key={goal.id} goal={goal} onOpen={onOpen} onChanged={changed} />
      ))}
    </ul>
  );
  const groups = goalsByArea(goals);
  // Nothing given an area at all: one list, not one heading saying so.
  const grouped = byArea && !(groups.length === 1 && groups[0]?.area === null);

  return (
    <Card icon={<Mountain size={15} aria-hidden />} title={title} hint="+1 when it moves; the line shows whether you are on pace.">
      {grouped
        ? groups.map((group) => (
            <div key={group.area ?? "none"}>
              <h3 className="sectionview__pagesTitle">{group.label}</h3>
              {cards(group.goals, `Goals: ${group.label}`)}
            </div>
          ))
        : cards(goals, "Goals")}
    </Card>
  );
}
