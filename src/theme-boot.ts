/**
 * Applies the saved theme before the first paint.
 *
 * This has to be its own file rather than an inline `<script>` in index.html.
 * The renderer runs under `script-src 'self'`, which refuses inline script —
 * and refuses it silently, as a console message rather than an error anything
 * would notice. The inline version was there for months and never once ran,
 * so the flash it exists to prevent happened every launch.
 *
 * Loaded from the head, ahead of the app bundle, and deliberately tiny: it
 * imports nothing, so nothing has to be parsed before it can run. It mirrors
 * the resolution order in src/lib/theme.ts — an explicit choice wins,
 * otherwise the OS decides through prefers-color-scheme.
 */
try {
  const saved = localStorage.getItem("caulder.theme");
  if (saved === "light" || saved === "dark") {
    document.documentElement.setAttribute("data-theme", saved);
  }
} catch {
  // Storage blocked. Falling through to the OS theme is the right answer.
}
