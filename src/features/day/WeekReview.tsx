import { useEffect, useState } from "react";
import type { WeekReview as Review } from "@shared/week";
import { shiftDay } from "@shared/dates";
import { formatDuration, formatValue, numberText } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * The head of the Calendar's week (PLAN.md, part eight, phase 35): what
 * happened in the week shown, what has slipped as of today, and three things
 * for the week after. Read from what is kept - nothing here is filled in -
 * so on a Friday it is true because the week was done in Caulder.
 *
 * A week still to come has nothing to read yet: only its three.
 */
export function WeekReview({ companyId, day, version }: { companyId: string; day: string; version: unknown }) {
  const [review, setReview] = useState<Review | null>(null);
  const [texts, setTexts] = useState<string[]>(["", "", ""]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.week.review(companyId, day).then(
      (found) => {
        if (!live) return;
        setReview(found);
        const chosen = found.upTo === null ? found.three.thisWeek : found.three.nextWeek;
        setTexts([0, 1, 2].map((position) => chosen.find((each) => each.position === position)?.text ?? ""));
      },
      (cause) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
    };
  }, [companyId, day, version]);

  if (!review) return error ? <p className="field__error" role="alert">{error}</p> : null;

  // The three are for the week after the one read - or, for a week to come, that week's own.
  const toCome = review.upTo === null;
  const forWeek = toCome ? review.from : shiftDay(review.from, 7);
  async function save(next: string[]) {
    setError(null);
    try {
      await window.caulder.week.setThings(companyId, { weekStart: forWeek, texts: next.map((text) => text.trim()) });
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  const money = (value: number) => formatValue(value, review.money.currency);
  const count = (n: number, one: string, many: string) => `${numberText(n)} ${n === 1 ? one : many}`;
  const thisWeek = review.slipped !== null;

  return (
    <section className="card weekreview" aria-label={toCome ? "The week to come" : thisWeek ? "This week so far" : "That week"}>
      {!toCome && (
        <>
          <h2 className="card__title">{thisWeek ? "This week so far" : "That week"}</h2>
          <ul className="weekreview__happened">
            <li>
              <strong>{count(review.done.count, "task done", "tasks done")}</strong>
              {review.done.titles.length > 0 && <span className="weekreview__who">{review.done.titles.slice(0, 3).join(", ")}</span>}
            </li>
            <li>
              <strong>{count(review.reached.people, "person reached", "people reached")}</strong>
              {review.reached.people > 0 && <span> · {count(review.reached.answered, "answered", "answered")}</span>}
              {review.reached.names.length > 0 && <span className="weekreview__who">{review.reached.names.join(", ")}</span>}
            </li>
            <li>
              <strong>{count(review.deals.moved, "deal moved", "deals moved")}</strong>
              {review.deals.won > 0 && <span> · {count(review.deals.won, "won", "won")}, {money(review.deals.wonValue)}</span>}
              {review.deals.lost > 0 && <span> · {count(review.deals.lost, "lost", "lost")}</span>}
            </li>
            <li>
              <strong>{money(review.money.invoiced)} invoiced</strong>
              <span> · {money(review.money.paid)} paid</span>
            </li>
            <li>
              <strong>{formatDuration(review.hours.planned)} planned</strong>
              {review.hours.planned > 0 && <span> · {formatDuration(review.hours.kept)} kept, unless you marked it skipped</span>}
            </li>
          </ul>
          {review.slipped && (
            <p className="weekreview__slipped">
              {review.slipped.overdue + review.slipped.quiet + review.slipped.unpaid === 0
                ? "Nothing behind."
                : [
                    review.slipped.overdue > 0 ? `${count(review.slipped.overdue, "task", "tasks")} overdue` : null,
                    review.slipped.quiet > 0 ? `${count(review.slipped.quiet, "contact", "contacts")} going quiet` : null,
                    review.slipped.unpaid > 0 ? `${money(review.slipped.unpaidAmount)} unpaid and late` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
          )}
          {review.three.thisWeek.length > 0 && (
            <p className="weekreview__three">
              The three for {thisWeek ? "this" : "that"} week:{" "}
              {review.three.thisWeek.map((each, index) => (
                <span key={each.id} className={each.done ? "weekreview__done" : undefined}>
                  {index > 0 ? " · " : ""}
                  {each.text}
                  {each.done ? " (done)" : ""}
                </span>
              ))}
            </p>
          )}
        </>
      )}

      <div className="weekreview__next">
        <span className="field__label">{toCome ? "Three things for this week" : "Three things for next week"}</span>
        <div className="weekreview__inputs">
          {texts.map((text, position) => (
            <input
              key={position}
              className="input"
              value={text}
              maxLength={200}
              aria-label={`Thing ${position + 1}`}
              placeholder={position === 0 ? "What would make it a good week" : ""}
              onChange={(event) => setTexts((current) => current.map((each, at) => (at === position ? event.target.value : each)))}
              onBlur={() => void save(texts)}
              onKeyDown={(event) => {
                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
              }}
            />
          ))}
        </div>
      </div>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
