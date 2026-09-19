import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import type { GoalRow, HobbyRow, StudiesOverview } from "@shared/life";
import { Card } from "@/components/Card";
import { formatDuration } from "@/lib/format";

/**
 * Your week, on Today (PLAN.md, part four): the next exam, the time the
 * hobbies have this week against what they are wanted, and the goal whose
 * day is nearest - the life half of the day, beside the company's. Nothing at
 * all when there is none of it yet.
 */
export function YourWeekCard({
  companyId,
  version,
  onOpenPage,
  onOpenLife,
}: {
  companyId: string;
  version: number;
  onOpenPage: (pageId: string) => void;
  onOpenLife: () => void;
}) {
  const [data, setData] = useState<{ studies: StudiesOverview; hobbies: HobbyRow[]; goals: GoalRow[] } | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      window.caulder.life.studies(companyId),
      window.caulder.life.hobbies(companyId),
      window.caulder.life.goals(companyId),
    ]).then(
      ([studies, hobbies, goals]) => live && setData({ studies, hobbies, goals }),
      () => live && setData(null),
    );
    return () => {
      live = false;
    };
  }, [companyId, version]);

  if (!data) return null;
  const exam = data.studies.exams[0];
  const hobbies = data.hobbies.filter((hobby) => hobby.status !== "someday" && hobby.status !== "paused").slice(0, 3);
  const goal = data.goals.find((each) => !each.done && each.byOn !== null);
  if (!exam && hobbies.length === 0 && !goal) return null;

  return (
    <Card
      icon={<Sprout size={15} aria-hidden />}
      title="Your week"
      actions={
        <button type="button" className="btn btn--sm btn--ghost" onClick={onOpenLife}>
          Life
        </button>
      }
    >
      <ul className="cold yourweek" aria-label="Your week">
        {exam && (
          <li>
            <button type="button" className="coldrow" onClick={() => onOpenPage(exam.id)}>
              <span className="coldrow__name">{exam.title}</span>
              <span className="coldrow__meta">Exam{exam.course ? `, ${exam.course.title}` : ""}</span>
              <span className="coldrow__days">
                {exam.daysLeft === 0 ? "today" : exam.daysLeft === 1 ? "tomorrow" : `in ${exam.daysLeft} days`}
              </span>
            </button>
          </li>
        )}
        {hobbies.map((hobby) => {
          const wanted = hobby.hoursWanted ? Math.round(hobby.hoursWanted * 60) : null;
          return (
            <li key={hobby.id}>
              <button type="button" className="coldrow" onClick={() => onOpenPage(hobby.id)}>
                <span className="coldrow__name">{hobby.title}</span>
                <span className="coldrow__meta">
                  {hobby.plannedMinutes > 0 ? `${formatDuration(hobby.plannedMinutes)} set aside this week` : "Nothing set aside this week"}
                  {wanted ? `, of ${formatDuration(wanted)} wanted` : ""}
                </span>
                <span className="coldrow__days">
                  {hobby.keptMinutes > 0 ? `${formatDuration(Math.round(hobby.keptMinutes / 4))}/wk lately` : "not lately"}
                </span>
              </button>
            </li>
          );
        })}
        {goal && (
          <li>
            <button type="button" className="coldrow" onClick={() => onOpenPage(goal.id)}>
              <span className="coldrow__name">{goal.title}</span>
              <span className="coldrow__meta">
                {goal.percent !== null ? `${goal.percent}% of the way` : "Goal"}
              </span>
              <span className="coldrow__days">
                {goal.daysLeft !== null && goal.daysLeft >= 0 ? `${goal.daysLeft} days left` : "passed"}
              </span>
            </button>
          </li>
        )}
      </ul>
    </Card>
  );
}
