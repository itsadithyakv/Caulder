import { describeWeekdays, type HobbyRow } from "@shared/life";
import { startOfWeek, today as todayIn } from "@shared/dates";
import { themeDaysKept, weeklyTotals } from "@shared/goals";
import { useWorkspace } from "@/lib/workspace";
import { formatDay, formatDuration } from "@/lib/format";
import { useDayThemes } from "./useDayThemes";

/**
 * A hobby's last eight weeks as bars, against the hours a week wanted - a
 * dashed line to get over - and, when the hobby has days of its own in your
 * week, how many of them it got. The week still going is drawn lighter, and
 * each bar says its week and time when pointed at.
 */

const WEEKS = 8;

export function HobbyWeeks({ hobby, companyId }: { hobby: HobbyRow; companyId: string }) {
  const { home } = useWorkspace();
  const themes = useDayThemes(companyId);
  const today = todayIn(home?.timezone ?? "UTC");
  const weeks = weeklyTotals(hobby.weeks, startOfWeek(today), WEEKS);
  const wanted = hobby.hoursWanted !== null && hobby.hoursWanted > 0 ? Math.round(hobby.hoursWanted * 60) : null;
  const most = Math.max(wanted ?? 0, ...weeks.map((week) => week.minutes));
  // Bars only once there is time to draw: eight empty weeks under a line is a hole, not a chart.
  const anyTime = weeks.some((week) => week.minutes > 0);
  const itsDays = themes.filter((theme) => theme.pageId === hobby.id).map((theme) => theme.weekday);
  const kept = itsDays.length > 0 ? themeDaysKept(hobby.weeks, itsDays) : null;
  if (!anyTime && !kept) return null;

  const full = weeks.filter((week) => !week.partial);
  const over = wanted ? full.filter((week) => week.minutes >= wanted).length : 0;
  const summary = `${hobby.title}, the last ${WEEKS} weeks: ${weeks.map((week) => formatDuration(week.minutes)).join(", ")}${
    wanted ? `; ${formatDuration(wanted)} wanted, reached in ${over} of ${full.length}` : ""
  }.`;

  return (
    <div className="hobbyweeks">
      {anyTime && (
        <div className="hobbyweeks__chart" role="img" aria-label={summary}>
          {weeks.map((week) => (
            <span
              key={week.monday}
              className={`hobbyweeks__bar${week.partial ? " hobbyweeks__bar--now" : ""}${wanted && week.minutes >= wanted ? " hobbyweeks__bar--over" : ""}`}
              style={{ height: `${Math.max(week.minutes > 0 ? 4 : 0, (week.minutes / most) * 100)}%` }}
              title={`${week.partial ? "This week so far" : `Week of ${formatDay(week.monday)}`}: ${formatDuration(week.minutes)}`}
            />
          ))}
          {wanted && (
            <span className="hobbyweeks__wanted" style={{ bottom: `${(wanted / most) * 100}%` }}>
              <span className="hobbyweeks__wantedLabel">{formatDuration(wanted)} wanted</span>
            </span>
          )}
        </div>
      )}
      {kept && (
        <p className="hobbyweeks__days">
          {describeWeekdays(itsDays)} {itsDays.length === 1 ? "is" : "are"} its day{itsDays.length === 1 ? "" : "s"}
          {kept.of > 0 ? ` · ${kept.kept} of ${kept.of} kept in four weeks` : ""}
        </p>
      )}
    </div>
  );
}
