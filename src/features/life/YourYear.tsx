import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import type { YearInNumbers } from "@shared/tracker";
import { Card } from "@/components/Card";
import { formatDuration } from "@/lib/format";

/**
 * The year in numbers: what the quick line was told, added up.
 *
 * "Did 20 push ups", said on a Tuesday in March, is a number nobody will
 * remember by December - and three hundred of them are the year. This reads
 * them back the way a year-end summary does: each thing in a sentence that
 * says what is worth saying about it (a total for push ups, a best for the
 * bench press, how far and how fast for running), the hours each hobby got,
 * the books finished, the days written about.
 *
 * Nothing is kept for this: it is read from what is already there, so last
 * year is as right as this one, and a year half over is simply half a year.
 * It says nothing at all until there is something to say.
 */
export function YourYear({ companyId, version = 0 }: { companyId: string; version?: number }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [numbers, setNumbers] = useState<YearInNumbers | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.life.year(companyId, year).then((next) => live && setNumbers(next), () => undefined);
    return () => {
      live = false;
    };
  }, [companyId, year, version]);

  if (!numbers) return null;
  const nothing = numbers.lines.length === 0 && numbers.hours.length === 0 && numbers.booksRead.length === 0;
  // This year with nothing in it is not worth a card; an earlier one looked at on purpose says so.
  if (nothing && year === thisYear) return null;

  return (
    <Card
      icon={<Sparkles size={15} aria-hidden />}
      title={`Your ${numbers.year}`}
      actions={
        <span className="yearnav">
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setYear(year - 1)} aria-label="The year before">
            <ChevronLeft size={14} aria-hidden />
          </button>
          <button type="button" className="btn btn--sm btn--ghost" disabled={year >= thisYear} onClick={() => setYear(year + 1)} aria-label="The year after">
            <ChevronRight size={14} aria-hidden />
          </button>
        </span>
      }
    >
      {nothing ? (
        <p className="card__hint">Nothing was counted in {numbers.year}.</p>
      ) : (
        <>
          <p className="year__lead">
            {numbers.activeDays > 0 && (
              <>
                You showed up on <strong>{numbers.activeDays}</strong> {numbers.activeDays === 1 ? "day" : "days"}
                {numbers.busiest ? <>, most of all in <strong>{numbers.busiest}</strong></> : null}.{" "}
              </>
            )}
            {numbers.journalDays > 0 && <>You wrote about <strong>{numbers.journalDays}</strong> of them. </>}
          </p>
          <ul className="year__lines">
            {numbers.lines.map((line) => (
              <li key={line.topic} className="year__line">
                <strong className="year__topic">{line.topic}</strong>
                <span>{line.says}</span>
              </li>
            ))}
            {numbers.hours.map((hobby) => (
              <li key={`hours-${hobby.title}`} className="year__line">
                <strong className="year__topic">{hobby.title}</strong>
                <span>{formatDuration(hobby.minutes)} given to it.</span>
              </li>
            ))}
            {numbers.booksRead.length > 0 && (
              <li className="year__line">
                <strong className="year__topic">Books</strong>
                <span>
                  {numbers.booksRead.length} finished: {numbers.booksRead.join(", ")}.
                </span>
              </li>
            )}
          </ul>
        </>
      )}
    </Card>
  );
}
