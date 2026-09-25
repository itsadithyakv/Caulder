import { useEffect, useState } from "react";
import { BookHeart, CalendarHeart } from "lucide-react";
import { resurface, sayComing, type Memory } from "@shared/memories";
import { daysBetween } from "@shared/dates";

/**
 * One memory brought back on Today, the same one all day (shared/memories.ts,
 * resurface): a birthday or an anniversary coming round this week first, then
 * something kept on this day before, then something from a while ago. What is
 * remembered and never looked at again is not much of a memory.
 *
 * Nothing at all for a brain with nothing old enough to bring back.
 */
export function Remember({ day, onOpenPage }: { day: string; onOpenPage: (pageId: string) => void }) {
  const [memories, setMemories] = useState<Memory[] | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.brain.memories().then(
      (found) => live && setMemories(found.memories),
      () => live && setMemories([]),
    );
    return () => {
      live = false;
    };
  }, [day]);

  if (!memories) return null;
  const { memory, coming } = resurface(memories, day);

  if (coming) {
    return (
      <button type="button" className="today__remember" onClick={() => onOpenPage(coming.pageId)}>
        <CalendarHeart size={14} aria-hidden />
        {sayComing(coming)}.
      </button>
    );
  }
  if (!memory) return null;
  return (
    <button type="button" className="today__remember" onClick={() => onOpenPage(memory.pageId)} title={`On ${memory.pageTitle}`}>
      <BookHeart size={14} aria-hidden />
      <span className="today__rememberWhen">{ago(memory.day, day)}:</span>
      {memory.fact ? (
        <>
          <strong>{memory.fact}</strong>
          {memory.pageTitle !== "About me" && ` · ${memory.pageTitle}`}
        </>
      ) : (
        memory.says
      )}
    </button>
  );
}

/** "A year ago today", "3 months ago", "2 weeks ago". */
function ago(then: string, today: string): string {
  const days = daysBetween(then, today);
  if (then.slice(5) === today.slice(5) && days >= 365) return days < 730 ? "A year ago today" : `${Math.floor(days / 365)} years ago today`;
  if (days >= 60) return `${Math.round(days / 30)} months ago`;
  if (days >= 28) return "A month ago";
  return `${Math.round(days / 7)} weeks ago`;
}
