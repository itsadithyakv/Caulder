import { useEffect, useState } from "react";
import type { LaidOutBlock } from "@shared/domain";
import { whatNow, priorityOf, PRIORITY_SHORT } from "@shared/priority";
import { minutesOf, timeNow } from "@shared/dates";
import { formatDuration, formatTime } from "@/lib/format";

/**
 * What you should be doing, right now.
 *
 * The whole point of putting a priority on anything. One line, at the top of
 * the screen you land on, answering the question you actually opened the app
 * to ask.
 *
 * The important behaviour is the refusal. When two things clash and both are
 * "has to happen", this names both and says they clash — it does not pick.
 * Caulder does not know whether the client or the exam matters more once you
 * have called them equal, and an app that guesses at that and states it as
 * advice is worse than one that says nothing.
 */
export function NowLine({
  blocks,
  timezone,
  onOpenDay,
}: {
  blocks: readonly LaidOutBlock[];
  timezone: string;
  onOpenDay: () => void;
}) {
  const [minutes, setMinutes] = useState(() => minutesOf(timeNow(timezone)));

  // A minute is the finest this needs to be, and the cheapest that is never
  // visibly wrong.
  useEffect(() => {
    const timer = setInterval(() => setMinutes(minutesOf(timeNow(timezone))), 30_000);
    return () => clearInterval(timer);
  }, [timezone]);

  const advice = whatNow(blocks, minutes);

  // Nothing on and nothing coming is not worth a line saying so.
  if (advice.at.length === 0 && !advice.next) return null;

  const tie = advice.at.length > 1;

  return (
    <section className="nowline" aria-label="What you should be doing">
      {advice.at.length === 0 ? (
        <p className="nowline__free">
          <span className="nowline__label">Free until</span>{" "}
          <strong>{formatTime(advice.next?.startsAt ?? "")}</strong>
          {advice.nextIn !== null && (
            <span className="nowline__meta">
              {" "}
              &mdash; {formatDuration(advice.nextIn)} before {advice.next?.title}
            </span>
          )}
        </p>
      ) : (
        <>
          <p className="nowline__main">
            <span className="nowline__label">{tie ? "Two things now" : "Right now"}</span>{" "}
            <strong>{advice.at.map((block) => block.title).join("  ·  ")}</strong>
          </p>

          {tie && (
            // Named, never ranked. This is the sentence the whole feature is
            // built around.
            <p className="nowline__meta">
              Both are {PRIORITY_SHORT[priorityOf(advice.at[0]?.kind ?? null, advice.at[0]?.priority ?? null)].toLowerCase()}.
              Caulder will not choose between them.
            </p>
          )}

          {advice.yielding.length > 0 && (
            <p className="nowline__meta">
              {advice.yielding.map((block) => block.title).join(", ")} can wait.
            </p>
          )}

          {advice.next && advice.nextIn !== null && (
            <p className="nowline__meta">
              Next: {advice.next.title} in {formatDuration(advice.nextIn)}.
            </p>
          )}
        </>
      )}

      <button type="button" className="btn btn--sm btn--ghost" onClick={onOpenDay}>
        Open the day
      </button>
    </section>
  );
}
