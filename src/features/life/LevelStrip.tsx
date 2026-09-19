import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { useProgress } from "./ProgressCards";

/**
 * Your level, on Today (PLAN.md, phase 17): one line at the top of the life
 * half of the day, read again whenever the day changes - a task done, a habit
 * ticked, a line kept - so what you just did shows at once. Crossing into a
 * new level says so for a moment; nothing else here asks for attention.
 */
export function LevelStrip({
  companyId,
  version,
  watch,
  onOpen,
}: {
  companyId: string;
  version: number;
  /** Anything whose change means something may have happened: Today's own data. */
  watch: unknown;
  onOpen: () => void;
}) {
  const { progress } = useProgress(companyId, version, watch);

  // Up a level since the strip last looked: said, then let go of.
  const seen = useRef<number | null>(null);
  const [up, setUp] = useState<number | null>(null);
  useEffect(() => {
    if (!progress) return;
    const level = progress.level.level;
    if (seen.current !== null && level > seen.current) {
      setUp(level);
      const timer = window.setTimeout(() => setUp(null), 4000);
      seen.current = level;
      return () => window.clearTimeout(timer);
    }
    seen.current = level;
    return undefined;
  }, [progress]);

  if (!progress) return null;
  const { level, weekXp } = progress;
  const share = Math.round(((level.xp - level.from) / Math.max(1, level.to - level.from)) * 100);

  return (
    <>
      <button
        type="button"
        className={`levelstrip${up ? " levelstrip--up" : ""}`}
        onClick={onOpen}
        aria-label={`Level ${level.level}, ${level.xp} XP. Open Life.`}
      >
        <span className="levelstrip__badge" aria-hidden>
          <Zap size={13} />
          {level.level}
        </span>
        <span className="levelstrip__body" aria-hidden>
          <span className="levelstrip__words">
            {up ? (
              <strong className="anim-spring-pop">Up to level {up}</strong>
            ) : (
              <>
                <strong>Level {level.level}</strong> · {level.to - level.xp} XP to {level.level + 1}
              </>
            )}
            {weekXp > 0 && <span className="levelstrip__week">+{weekXp} this week</span>}
          </span>
          <span className="levelstrip__track">
            <span className="levelstrip__fill" style={{ width: `${Math.max(share, 2)}%` }} />
          </span>
        </span>
      </button>
      {/* Outside the button, whose own name is its label: a live region inside it is not reliably read. */}
      <span className="visually-hidden" role="status">
        {up ? `Up to level ${up}` : ""}
      </span>
    </>
  );
}
