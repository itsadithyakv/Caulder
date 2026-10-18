import { useEffect, useRef, useState } from "react";

/**
 * A long list drawn a part at a time.
 *
 * Measured on a company with three thousand contacts: Contacts drew every row
 * at once and the window froze for a second and a half; Today drew a thousand
 * overdue tasks. Nobody reads row 2,000 on arrival. The first part is drawn,
 * and the rest as it is scrolled to - sorting, filtering and selecting still
 * work on the whole list, since only what is drawn is cut.
 */
export function useShowing<T>(items: readonly T[], first: number, step = first) {
  const [limit, setLimit] = useState(first);
  const shown = items.length > limit ? items.slice(0, limit) : items;
  return { shown, left: items.length - shown.length, more: () => setLimit((count) => count + step), step };
}

/**
 * The rest of a list, on a press - or by itself, as it scrolls into view, so
 * scrolling down a long list simply keeps going.
 */
export function ShowMore({ left, step, onMore, auto = false }: { left: number; step: number; onMore: () => void; auto?: boolean }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!auto || left <= 0 || !button.current) return;
    const watcher = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onMore();
    });
    watcher.observe(button.current);
    return () => watcher.disconnect();
  }, [auto, left, onMore]);

  if (left <= 0) return null;
  return (
    <button ref={button} type="button" className="linkbtn showmore" onClick={onMore}>
      Show {Math.min(step, left)} more
    </button>
  );
}
