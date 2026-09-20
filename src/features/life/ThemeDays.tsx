import { useEffect, useState, type FormEvent } from "react";
import { CalendarHeart, X } from "lucide-react";
import { TASK_AREAS, TASK_AREA_LABEL } from "@shared/domain";
import type { BrainPageSummary } from "@shared/brain";
import { today as todayIn, weekdayOf } from "@shared/dates";
import type { DayTheme, DayThemeInput } from "@shared/goals";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { useWorkspace } from "@/lib/workspace";
import { announceThemes, useDayThemes } from "./useDayThemes";

/**
 * Theme days: a day of your week given to one thing - Mondays for studies,
 * Tuesdays for guitar. A focus, not a lock: the Calendar heads the day with it, Today says
 * it, and a hobby counts how many of its days it got. Press a day to give it
 * a hobby, a course, a goal, an area of your life or words of your own.
 */

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Choice = { key: string; label: string; detail: string; input: DayThemeInput };

export function ThemeDays({ companyId }: { companyId: string }) {
  const { home } = useWorkspace();
  const today = todayIn(home?.timezone ?? "UTC");
  const themes = useDayThemes(companyId);
  const [editing, setEditing] = useState<number | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [words, setWords] = useState("");
  const [error, setError] = useState<string | null>(null);

  // What a day can be for: your hobbies, courses and goals, then the areas of your life.
  useEffect(() => {
    if (editing === null) return;
    let live = true;
    const read = (section: "hobbies" | "studies" | "goals") => window.caulder.brain.section(companyId, section, false);
    Promise.all([read("hobbies"), read("studies"), read("goals")]).then(
      ([hobbies, studies, goals]) => {
        if (!live) return;
        const pages = (list: BrainPageSummary[], template: string, detail: string): Choice[] =>
          list
            .filter((page) => page.template === template)
            .map((page) => ({ key: page.id, label: page.title, detail, input: { label: page.title, pageId: page.id } }));
        setChoices([
          ...pages(hobbies, "hobby", "Hobby"),
          ...pages(studies, "course", "Course"),
          ...pages(goals, "life-goal", "Goal"),
          ...TASK_AREAS.map((area) => ({
            key: `area-${area}`,
            label: TASK_AREA_LABEL[area],
            detail: "Area",
            input: { label: TASK_AREA_LABEL[area], area },
          })),
        ]);
      },
      () => live && setChoices([]),
    );
    return () => {
      live = false;
    };
  }, [companyId, editing]);

  async function give(weekday: number, input: DayThemeInput | null) {
    setError(null);
    try {
      await window.caulder.life.setTheme(companyId, weekday, input);
      announceThemes();
      setEditing(null);
      setWords("");
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  function own(event: FormEvent) {
    event.preventDefault();
    if (editing !== null && words.trim()) void give(editing, { label: words.trim() });
  }

  const byDay = new Map<number, DayTheme>(themes.map((theme) => [theme.weekday, theme]));
  const now = weekdayOf(today);
  const current = editing !== null ? byDay.get(editing) : undefined;

  return (
    <Card
      icon={<CalendarHeart size={15} aria-hidden />}
      title="Theme days"
      hint="Give a day to one thing - Mondays for studies, Tuesdays for guitar. A focus, not a lock."
    >
      <ol className="yourweek" aria-label="Theme days">
        {DAYS.map((name, index) => {
          const weekday = index + 1;
          const theme = byDay.get(weekday);
          return (
            <li key={name}>
              <button
                type="button"
                className={`yourweek__day${theme ? " yourweek__day--set" : ""}${weekday === now ? " yourweek__day--today" : ""}${editing === weekday ? " yourweek__day--open" : ""}`}
                aria-expanded={editing === weekday}
                aria-label={`${name}: ${theme ? theme.label : "free"}`}
                onClick={() => setEditing((open) => (open === weekday ? null : weekday))}
              >
                <span className="yourweek__name">{name.slice(0, 3)}</span>
                <span className="yourweek__theme">{theme ? theme.label : "Free"}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {editing !== null && (
        <div className="yourweek__pick anim-menu" role="group" aria-label={`What ${DAYS[editing - 1]} is for`}>
          <p className="yourweek__ask">{DAYS[editing - 1]} is for…</p>
          <div className="yourweek__choices">
            {choices.map((choice) => (
              <button
                key={choice.key}
                type="button"
                className={`yourweek__choice${current && (current.pageId ?? current.label) === (choice.input.pageId ?? choice.label) ? " yourweek__choice--on" : ""}`}
                onClick={() => void give(editing, choice.input)}
              >
                {choice.label}
                <span className="yourweek__detail">{choice.detail}</span>
              </button>
            ))}
          </div>
          <form className="yourweek__own" onSubmit={own}>
            <input
              className="input"
              value={words}
              onChange={(event) => setWords(event.target.value)}
              placeholder="Or in your own words: Deep work, Family, Rest"
              aria-label="In your own words"
              maxLength={40}
            />
            <button type="submit" className="btn btn--sm" disabled={!words.trim()}>
              Give it that
            </button>
            {current && (
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => void give(editing, null)}>
                <X size={14} aria-hidden />
                Free it
              </button>
            )}
          </form>
        </div>
      )}
      <ErrorLine>{error}</ErrorLine>
    </Card>
  );
}
