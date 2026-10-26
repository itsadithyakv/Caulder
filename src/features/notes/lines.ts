/**
 * What Notes says when a search finds nothing, a different line each time it
 * is opened - a place for a half-thought should not read like a form. Dry
 * rather than zany: the joke is on the situation, never on the person.
 *
 * The part that tells you something useful - try a shorter word - is said
 * beside it every time. The lines for the box to write in and for an empty
 * list went with them: Today has no box, and draws no card for no notes.
 */

const NO_MATCH = [
  "Nothing matches that. Maybe you only thought about writing it.",
  "Not a single hit. Suspicious.",
  "Looked everywhere. Even under the sofa.",
  "No luck. It was probably a better idea in your head anyway.",
];

/** The one shown last time, per list, so opening Notes twice never says the same thing twice running. */
const last = new Map<readonly string[], number>();

function fresh(lines: readonly string[]): string {
  const before = last.get(lines) ?? -1;
  let at = Math.floor(Math.random() * lines.length);
  if (lines.length > 1 && at === before) at = (at + 1) % lines.length;
  last.set(lines, at);
  return lines[at] ?? lines[0] ?? "";
}

type NotesLines = { noMatch: string };

/** One set of lines, chosen when Notes is opened and kept while it is. */
export function notesLines(): NotesLines {
  return { noMatch: fresh(NO_MATCH) };
}
