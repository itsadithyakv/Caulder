import { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import { heatLevel, type HobbyRow } from "@shared/life";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { formatDuration } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { HobbyWeeks } from "./HobbyWeeks";

/**
 * Hobbies against the time they actually got (PLAN.md, part four): each
 * hobby's average week over the last four, beside the hours wanted. The bar
 * is a single measure against its own target, so it needs no legend - the
 * sentence under it says both numbers.
 *
 * Under each, the last half year a day at a time, the way a commit history is
 * drawn: an average says how much, and the grid says how often - the gap in
 * March, the run since, which an average smooths into nothing.
 */

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const STATUS_LABEL: Record<string, string> = { "doing-it": "Doing it", paused: "Paused", someday: "Someday" };

export function HobbiesPanel({
  companyId,
  version,
  onOpen,
}: {
  companyId: string;
  version: number;
  onOpen: (pageId: string) => void;
}) {
  const [hobbies, setHobbies] = useState<HobbyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.life.hobbies(companyId).then(
      (next) => live && setHobbies(next),
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
    };
  }, [companyId, version]);

  if (!hobbies) return <ErrorLine>{error}</ErrorLine>;
  if (hobbies.length === 0) return null;

  return (
    <Card icon={<Palette size={15} aria-hidden />} title="Time for them" hint="An average week, over the last four.">
      <ul className="lifebars" aria-label="Hobbies">
        {hobbies.map((hobby) => {
          const weekly = Math.round(hobby.keptMinutes / 4);
          const wanted = hobby.hoursWanted !== null && hobby.hoursWanted > 0 ? Math.round(hobby.hoursWanted * 60) : null;
          const share = wanted ? Math.min(100, Math.round((weekly / wanted) * 100)) : null;
          return (
            <li key={hobby.id} className="lifebar">
              <button type="button" className="lifebar__name" onClick={() => onOpen(hobby.id)}>
                {hobby.title}
              </button>
              {hobby.status && <span className="badge badge--neutral">{STATUS_LABEL[hobby.status] ?? hobby.status}</span>}
              {share !== null && (
                <span
                  className="lifebar__track"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={share}
                  aria-label={`${hobby.title}: ${share}% of the time wanted`}
                >
                  <span className="lifebar__fill" style={{ width: `${Math.max(share, 2)}%` }} />
                </span>
              )}
              <span className="lifebar__words">
                {weekly > 0 ? `About ${formatDuration(weekly)} a week` : "No time kept in four weeks"}
                {wanted ? `, of ${formatDuration(wanted)} wanted` : ""}
                {hobby.plannedMinutes > 0 ? `. ${formatDuration(hobby.plannedMinutes)} set aside this week.` : "."}
                {hobby.goal ? ` Working towards ${hobby.goal}.` : ""}
              </span>
              <HeatGrid hobby={hobby} />
              <HobbyWeeks hobby={hobby} companyId={companyId} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}


/**
 * Half a year as columns, Monday at the top, fuller for more time. Drawn only
 * once there is something to draw: an empty grid under a hobby never started
 * says nothing the sentence above it has not.
 */
function HeatGrid({ hobby }: { hobby: HobbyRow }) {
  const days = hobby.weeks.flat().filter((minutes): minutes is number => minutes !== null);
  const shown = days.filter((minutes) => minutes > 0).length;
  if (shown === 0) return null;
  const total = days.reduce((sum, minutes) => sum + minutes, 0);
  return (
    <div
      className="weeksgrid weeksgrid--heat"
      role="img"
      aria-label={`${hobby.title}: time kept on ${shown} days in the last ${hobby.weeks.length} weeks, ${formatDuration(total)} in all`}
    >
      {hobby.weeks.map((week, column) => (
        <span key={column} className="weeksgrid__week">
          {week.map((minutes, row) => (
            <span
              key={row}
              className={`weeksgrid__day${minutes === null ? "" : ` weeksgrid__day--heat${heatLevel(minutes)}`}`}
              title={minutes === null || minutes === 0 ? undefined : `${DAYS[row]}: ${formatDuration(minutes)}`}
            />
          ))}
        </span>
      ))}
    </div>
  );
}
