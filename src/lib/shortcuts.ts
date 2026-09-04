import { useEffect } from "react";
import type { RouteId } from "@/app/routes";

/**
 * Keyboard shortcuts.
 *
 * Single letters, no modifier, in the style of a tool somebody uses all day.
 * That only works if they never fire while typing, so every handler checks
 * first — a shortcut that eats a letter mid-sentence is worse than no shortcut.
 */

type Shortcut = {
  keys: string;
  describes: string;
};

export const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: "Going places",
    items: [
      { keys: "T", describes: "Today" },
      { keys: "L", describes: "Leads" },
      { keys: "P", describes: "Pipeline" },
      { keys: "I", describes: "Import" },
      { keys: "E", describes: "Email" },
      { keys: "S", describes: "Settings" },
    ],
  },
  {
    group: "Doing things",
    items: [
      { keys: "/", describes: "Search the leads" },
      { keys: "N", describes: "Add a lead" },
      { keys: "Ctrl + K", describes: "Switch company" },
      { keys: "?", describes: "This list" },
      { keys: "Esc", describes: "Close whatever is open" },
    ],
  },
];

const ROUTE_KEYS: Record<string, RouteId> = {
  t: "today",
  l: "leads",
  p: "pipeline",
  i: "import",
  e: "email",
  s: "settings",
};

/**
 * True when the keystroke belongs to whatever the user is writing in.
 *
 * `isContentEditable` matters as much as the tag check: a rich-text field is
 * a div, and swallowing letters inside one would be the most confusing
 * possible bug to track down.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function useShortcuts(handlers: {
  onRoute: (route: RouteId) => void;
  onSearch: () => void;
  onNewLead: () => void;
  onSwitchCompany: () => void;
  onHelp: () => void;
  onEscape: () => void;
}): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Escape is the exception: it is how somebody gets out of a field, so it
      // has to work from inside one.
      //
      // Unless something nearer the keypress already dealt with it. A form
      // that closes on Escape marks the event handled, and without this check
      // one press would close the form AND whatever sits behind it.
      if (event.key === "Escape") {
        if (!event.defaultPrevented) handlers.onEscape();
        return;
      }

      if (isTyping(event.target)) return;

      // Ctrl+K is the one combination, because it is the switcher convention
      // everywhere else and muscle memory beats consistency here.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        handlers.onSwitchCompany();
        return;
      }

      // Any other modifier means the user is doing something else entirely.
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "?") {
        event.preventDefault();
        handlers.onHelp();
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        handlers.onSearch();
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "n") {
        event.preventDefault();
        handlers.onNewLead();
        return;
      }

      const route = ROUTE_KEYS[key];
      if (route) {
        event.preventDefault();
        handlers.onRoute(route);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
