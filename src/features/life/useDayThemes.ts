import { useEffect, useState } from "react";
import type { DayTheme } from "@shared/goals";

/** Said when a theme is set or taken off, so every screen showing the week keeps up. */
const CHANGED = "caulder:themes";

export function announceThemes(): void {
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * Your week's themes, for whichever screen shows them - Life, Today, the
 * Calendar, a hobby - read again whenever one is changed anywhere.
 */
export function useDayThemes(companyId: string | null | undefined): DayTheme[] {
  const [themes, setThemes] = useState<DayTheme[]>([]);
  useEffect(() => {
    if (!companyId) return;
    let live = true;
    const read = () =>
      void window.caulder.life.themes(companyId).then(
        (next) => live && setThemes(next),
        () => undefined,
      );
    read();
    window.addEventListener(CHANGED, read);
    return () => {
      live = false;
      window.removeEventListener(CHANGED, read);
    };
  }, [companyId]);
  return themes;
}
