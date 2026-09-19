import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MOODS } from "@shared/brain";
import type { JournalMonth } from "@shared/life";
import { shiftDay, weekdayOf } from "@shared/dates";
import { ErrorLine } from "@/components/ErrorLine";
import { formatDay, formatMonth } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { MOOD_ICON } from "./moods";
import { MoodTag } from "./MoodPicker";

/**
 * The journal's month, beside the entry being written: a face for each day
 * written, a dot for one written without a mood, the day open ringed. The run
 * of days is a sentence, never a flame to protect - the journal is kept for
 * what is in it. Under it, the same day a week, a month and a year ago.
 */

const WEEKDAY_HEADS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthShift(month: string, by: number): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function daysOf(month: string): string[] {
  const out: string[] = [];
  let day = `${month}-01`;
  while (day.startsWith(month)) {
    out.push(day);
    day = shiftDay(day, 1);
  }
  return out;
}

export function JournalCalendar({
  companyId,
  selected,
  version,
  onPick,
}: {
  companyId: string;
  /** The day whose entry is open. */
  selected: string;
  /** Bumped when an entry is written, so the month is read again. */
  version: number;
  onPick: (day: string) => void;
}) {
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [data, setData] = useState<JournalMonth | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Opening a day in another month turns the page to it.
  useEffect(() => setMonth(selected.slice(0, 7)), [selected]);

  useEffect(() => {
    let live = true;
    window.caulder.life.month(companyId, month).then(
      (next) => live && setData(next),
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
    };
  }, [companyId, month, version]);

  if (!data) return <ErrorLine>{error}</ErrorLine>;

  const byDay = new Map(data.entries.map((entry) => [entry.day, entry]));
  const days = daysOf(data.month);
  const lead = weekdayOf(days[0] ?? `${data.month}-01`) - 1;
  const written = data.entries.length;

  return (
    <>
      <section className="card journal">
        <div className="journal__head">
          <button type="button" className="btn btn--sm btn--ghost" aria-label="The month before" onClick={() => setMonth(monthShift(data.month, -1))}>
            <ChevronLeft size={16} aria-hidden />
          </button>
          <h3 className="journal__month">{formatMonth(`${data.month}-01`)}</h3>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            aria-label="The month after"
            disabled={data.month >= data.today.slice(0, 7)}
            onClick={() => setMonth(monthShift(data.month, 1))}
          >
            <ChevronRight size={16} aria-hidden />
          </button>
          <span className="journal__count">
            {written === 0 ? "No entries" : `${written} ${written === 1 ? "entry" : "entries"}`}
          </span>
        </div>

        {/* Seven columns to the eye; to a screen reader, a run of days that each say their date and mood. */}
        <div className="journal__grid" role="group" aria-label={`The journal, ${formatMonth(`${data.month}-01`)}`}>
          {WEEKDAY_HEADS.map((head) => (
            <span key={head} className="journal__weekday" aria-hidden>
              {head}
            </span>
          ))}
          {Array.from({ length: lead }, (_, index) => (
            <span key={`lead-${index}`} className="journal__slot" aria-hidden />
          ))}
          {days.map((day) => {
            const entry = byDay.get(day);
            const future = day > data.today;
            const Icon = entry?.mood ? MOOD_ICON[entry.mood] : null;
            const word = entry?.mood ? MOODS.find((mood) => mood.value === entry.mood)?.label : null;
            const label = `${formatDay(day)}: ${entry ? (word ? `written, ${word}` : "written") : future ? "to come" : "nothing written"}`;
            return (
              <span key={day} className="journal__slot">
                <button
                  type="button"
                  className={`journal__cell${entry ? " journal__cell--written" : ""}${day === data.today ? " journal__cell--today" : ""}${
                    day === selected ? " journal__cell--open" : ""
                  }`}
                  disabled={future}
                  aria-label={label}
                  aria-current={day === selected ? "date" : undefined}
                  title={label}
                  onClick={() => onPick(day)}
                >
                  <span className="journal__date">{Number(day.slice(8))}</span>
                  {Icon ? <Icon size={16} aria-hidden /> : entry ? <span className="journal__dot" aria-hidden /> : null}
                </button>
              </span>
            );
          })}
        </div>
        <p className="journal__run">
          {data.run > 1
            ? `${data.run} days in a row.`
            : data.run === 1
              ? "Written yesterday or today."
              : "Nothing written yesterday or today yet."}
        </p>
        <ErrorLine>{error}</ErrorLine>
      </section>

      {data.onThisDay.length > 0 && (
        <section className="card">
          <h2 className="card__title">On this day</h2>
          <ul className="pagelist" aria-label="On this day">
            {data.onThisDay.map((item) => (
              <li key={item.entry.pageId}>
                <button type="button" className="pagerow" onClick={() => onPick(item.entry.day)}>
                  <span className="pagerow__main">
                    <span className="pagerow__title">{item.label}</span>
                    {item.entry.locked ? (
                      <span className="pagerow__excerpt">Locked</span>
                    ) : (
                      item.entry.excerpt && <span className="pagerow__excerpt">{item.entry.excerpt}</span>
                    )}
                  </span>
                  <span className="pagerow__meta">{item.entry.mood && <MoodTag mood={item.entry.mood} />}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
