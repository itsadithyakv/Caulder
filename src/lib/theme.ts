/**
 * Theme preference.
 *
 * Three theme states, matching the token file:
 *   "system"  no data-theme attribute; prefers-color-scheme decides
 *   "light"   data-theme="light"; wins over a dark OS setting
 *   "dark"    data-theme="dark";  wins over a light OS setting
 *
 * The initial attribute is set by an inline script in index.html so the
 * window never flashes the wrong theme. This module keeps it in sync
 * afterwards and owns persistence.
 */

export type ThemeChoice = "system" | "light" | "dark";

const THEME_KEY = "caulder.theme";

/** Storage can throw outright when site data is blocked, so never let it escape. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Preference simply does not persist. Not worth interrupting the user.
  }
}

export function getTheme(): ThemeChoice {
  const saved = read(THEME_KEY);
  return saved === "light" || saved === "dark" ? saved : "system";
}

/**
 * Repoints every colour token at once, with transitions suppressed for the
 * duration. Without the suppression each element cross-fades independently and
 * the window smears through a muddy in-between state; see base.css.
 */
export function setTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  root.setAttribute("data-theme-switching", "");

  if (choice === "system") {
    root.removeAttribute("data-theme");
    write(THEME_KEY, null);
  } else {
    root.setAttribute("data-theme", choice);
    write(THEME_KEY, choice);
  }

  // Two frames: one for the attribute change to be styled, one for the new
  // values to paint. Removing it any earlier lets the transitions back in.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.removeAttribute("data-theme-switching"));
  });
}

/** Cycles system -> light -> dark -> system, so every state stays reachable. */
export function nextTheme(choice: ThemeChoice): ThemeChoice {
  if (choice === "system") return "light";
  if (choice === "light") return "dark";
  return "system";
}

/**
 * Notifies when the OS theme changes, which only matters while the choice is
 * "system". Returns an unsubscribe function.
 */
export function onSystemThemeChange(fn: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", fn);
  return () => query.removeEventListener("change", fn);
}
