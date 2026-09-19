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
      { keys: "D", describes: "The calendar" },
      { keys: "J", describes: "The journal, on today" },
      { keys: "Y", describes: "Your life: studies, hobbies, goals" },
      { keys: "L", describes: "Contacts" },
      { keys: "P", describes: "Deals" },
      { keys: "M", describes: "Money" },
      { keys: "B", describes: "The company brain" },
      { keys: "I", describes: "Import" },
      { keys: "S", describes: "Settings" },
    ],
  },
  {
    group: "Doing things",
    items: [
      { keys: "A", describes: "Add a task in one line" },
      { keys: "Ctrl + K", describes: "Search everything" },
      { keys: "/", describes: "Search the contacts" },
      { keys: "N", describes: "Add a contact" },
      { keys: "?", describes: "This list" },
      { keys: "Esc", describes: "Close whatever is open" },
    ],
  },
];

/** The quick window's own keys - the window the tray and the global key open. */
export const QUICK_WINDOW_SHORTCUTS: { group: string; items: Shortcut[] } = {
  group: "In the quick window",
  items: [
    { keys: "Ctrl + T", describes: "A task" },
    { keys: "Ctrl + N", describes: "A note" },
    { keys: "Enter", describes: "Add the task" },
    { keys: "Ctrl + Enter", describes: "Keep the note" },
    { keys: "Esc", describes: "Clear it, then close it" },
  ],
};

const ROUTE_KEYS: Record<string, RouteId> = {
  t: "today",
  d: "day",
  j: "journal",
  y: "life",
  l: "leads",
  p: "pipeline",
  m: "money",
  b: "brain",
  i: "import",
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
  // The app's own dropdown is a button, so the tag check below cannot see it -
  // and it answers to letters the way a native select does. Without this,
  // pressing D to reach "Deep work" would leave for the Day screen instead.
  if (target.getAttribute("role") === "combobox") return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function useShortcuts(handlers: {
  onRoute: (route: RouteId) => void;
  onSearch: () => void;
  onNewLead: () => void;
  /** Ctrl+K: search everything. Switching company is the sidebar header. */
  onSearchAll: () => void;
  /** Today's quick-add line, from anywhere. */
  onQuickAdd: () => void;
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

      // Ctrl+K is the one combination, because it is the search-everything
      // convention everywhere else and muscle memory beats consistency here.
      // It works from inside a field too: it types nothing, and "find that
      // page" is a thought people have mid-sentence.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        handlers.onSearchAll();
        return;
      }

      if (isTyping(event.target)) return;

      // Any other modifier means the user is doing something else entirely.
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "?") {
        event.preventDefault();
        handlers.onHelp();
        return;
      }

      // A dialog has the window: a letter pressed on one of its buttons is not
      // a request to go to another screen behind it, mid-call or mid-invoice. Help
      // is above this, so ? still closes the list it opened.
      if (document.querySelector('[aria-modal="true"]')) return;

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

      // Prevented, so the A does not also land in the line it just focused.
      if (key === "a") {
        event.preventDefault();
        handlers.onQuickAdd();
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
