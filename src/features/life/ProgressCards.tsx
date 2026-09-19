import { useEffect, useState } from "react";
import { Award, Lock, Scale, Zap } from "lucide-react";
import { TASK_AREA_LABEL } from "@shared/domain";
import { HAPPENING_LABEL, type Progress } from "@shared/progress";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { formatDay, formatDuration } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * Your level, the week across the four areas, and achievements (PLAN.md,
 * phase 17) - three cards from one answer, all of it worked out from what
 * happened. Read again whenever `version` moves, so a tick on Today or a
 * task done shows here without a reload.
 */

export function useProgress(
  companyId: string,
  version: number,
  /** Anything else whose change means something may have happened. */
  watch?: unknown,
): { progress: Progress | null; error: string | null } {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    window.caulder.progress.get(companyId).then(
      (next) => live && setProgress(next),
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
    };
  }, [companyId, version, watch]);
  return { progress, error };
}

/** "235 to level 4", and how full the bar is. */
function levelWords(progress: Progress): { left: number; share: number } {
  const { xp, from, to } = progress.level;
  return { left: to - xp, share: Math.round(((xp - from) / Math.max(1, to - from)) * 100) };
}

function LevelCard({ progress }: { progress: Progress }) {
  const { level, sources, weekXp } = progress;
  const { left, share } = levelWords(progress);
  return (
    <Card icon={<Zap size={15} aria-hidden />} title="Your level" className="level">
      <div className="level__head">
        <p className="level__number" aria-label={`Level ${level.level}`}>
          <span className="level__word" aria-hidden>
            Level
          </span>
          <span aria-hidden>{level.level}</span>
        </p>
        <div className="level__progress">
          <p className="level__xp">
            <strong>{level.xp.toLocaleString()} XP</strong>
            <span className="card__hint">
              {" "}
              · {left.toLocaleString()} to level {level.level + 1}
            </span>
          </p>
          <span
            className="level__track"
            role="meter"
            aria-valuemin={level.from}
            aria-valuemax={level.to}
            aria-valuenow={level.xp}
            aria-label={`${share}% of the way to level ${level.level + 1}`}
          >
            <span className="level__fill" style={{ width: `${Math.max(share, 2)}%` }} />
          </span>
          <p className="card__hint">{weekXp > 0 ? `+${weekXp} in the last seven days` : "Nothing yet in the last seven days"}</p>
        </div>
      </div>
      {sources.length > 0 ? (
        <ul className="level__sources" aria-label="Where it came from">
          {sources.map((source) => (
            <li key={source.kind} className="level__source">
              <span className="level__sourceName">{HAPPENING_LABEL[source.kind]}</span>
              <span className="level__sourceCount">{source.kind === "time" ? formatDuration(source.count) : source.count.toLocaleString()}</span>
              <span className="level__sourceXp">{source.xp.toLocaleString()} XP</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card__hint">
          Points come from what happens: a task done, an hour kept, a call, a habit ticked, an entry written. Nothing is given for
          opening the app.
        </p>
      )}
    </Card>
  );
}

function BalanceCard({ progress }: { progress: Progress }) {
  const { week } = progress;
  const most = Math.max(1, ...week.areas.map((row) => row.xp));
  const quiet = week.quiet.map((area) => TASK_AREA_LABEL[area]);
  return (
    <Card
      icon={<Scale size={15} aria-hidden />}
      title="The last seven days"
      hint={
        quiet.length === 0
          ? "Something for every part of your life this week."
          : quiet.length === 4
            ? "Nothing yet this week. Tick a habit, keep an hour, or finish a task."
            : `Nothing for ${list(quiet)} this week.`
      }
    >
      <ul className="balance" aria-label="The last seven days, by area">
        {week.areas.map((row) => (
          <li key={row.area} className={`balance__row${row.xp === 0 ? " balance__row--quiet" : ""}`}>
            <span className={`area area--${row.area} balance__area`}>{TASK_AREA_LABEL[row.area]}</span>
            <span className="balance__track" aria-hidden>
              {row.xp > 0 && <span className={`balance__fill balance__fill--${row.area}`} style={{ width: `${(row.xp / most) * 100}%` }} />}
            </span>
            <span className="balance__words">
              {/* The bar is the XP, so the XP is said: an hour kept and a task done are not the same length. */}
              {row.xp > 0
                ? [row.minutes > 0 ? `${formatDuration(row.minutes)} kept` : null, row.done > 0 ? `${row.done} done` : null, `${row.xp} XP`]
                    .filter(Boolean)
                    .join(" · ")
                : "nothing"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function list(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`;
}

function AchievementsCard({ progress }: { progress: Progress }) {
  const earned = progress.achievements
    .filter((each) => each.earnedOn)
    .sort((a, b) => (b.earnedOn ?? "").localeCompare(a.earnedOn ?? ""));
  // The next few within reach: the ones furthest along first.
  const next = progress.achievements
    .filter((each) => !each.earnedOn)
    .sort((a, b) => b.have / b.need - a.have / a.need)
    .slice(0, earned.length === 0 ? 6 : 4);
  return (
    <Card
      icon={<Award size={15} aria-hidden />}
      title="Achievements"
      actions={
        <span className="card__hint">
          {earned.length} of {progress.achievements.length}
        </span>
      }
    >
      <ul className="achieves" aria-label="Achievements">
        {earned.map((each) => (
          <li key={each.id} className="achieve achieve--earned">
            <Award size={18} className="achieve__icon" aria-hidden />
            <span className="achieve__title">{each.title}</span>
            <span className="achieve__about">{each.about}</span>
            <span className="achieve__when">Earned {formatDay(each.earnedOn ?? progress.today)}</span>
          </li>
        ))}
        {next.map((each) => (
          <li key={each.id} className="achieve">
            <Lock size={16} className="achieve__icon" aria-hidden />
            <span className="achieve__title">{each.title}</span>
            <span className="achieve__about">{each.about}</span>
            {/* A first-of-its-kind is done or not: no bar of one step, no "0 of 1". */}
            {each.need > 1 && (
              <span
                className="achieve__track"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={each.need}
                aria-valuenow={each.have}
                aria-label={`${each.title}: ${each.have} of ${each.need} ${each.unit}`}
              >
                <span className="achieve__fill" style={{ width: `${(each.have / each.need) * 100}%` }} />
              </span>
            )}
            <span className="achieve__when">{each.need > 1 ? `${each.have} of ${each.need} ${each.unit}` : "Not yet"}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Level, the week and achievements together, for Life's overview. */
export function ProgressCards({ companyId, version }: { companyId: string; version: number }) {
  const { progress, error } = useProgress(companyId, version);
  if (!progress) return <ErrorLine>{error}</ErrorLine>;
  return (
    <>
      <div className="life__pair">
        <LevelCard progress={progress} />
        <BalanceCard progress={progress} />
      </div>
      <AchievementsCard progress={progress} />
    </>
  );
}
