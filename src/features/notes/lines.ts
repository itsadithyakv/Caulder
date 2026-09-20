/**
 * What Notes says, a different line each time it is opened - a place for a
 * half-thought should not read like a form. Dry rather than zany: the joke is
 * on the situation (it is 2am, you will not remember it), never on the person.
 *
 * The part that tells you something useful - the key that writes a note from
 * any app, what to do when a search finds nothing - stays in every version.
 */

const WRITE = [
  "That thing you will definitely remember later? You will not.",
  "Half an idea is still an idea.",
  "Shower thought, napkin maths, a name to look up...",
  "Brain dump. Nobody is marking this.",
  "Write it down before the next tab steals it.",
  "A pitch line, a grudge, a grocery item. All welcome.",
  "The idea that woke you at 3am. Go on.",
  "Future you asked for this to be written down.",
  "Slightly unhinged idea? Good. Those are the ones.",
  "The first line of the investor update starts here.",
  "Quick, before the meeting ends.",
  "What did the customer actually say?",
  "Put it here and stop holding it in your head.",
  "A thought with nowhere else to go.",
];

const EMPTY = [
  "A blank page. Suspiciously calm.",
  "Nothing here but potential.",
  "Zero notes. Very zen, or very busy.",
  "Empty. Either you remember everything, or you will not.",
  "No notes yet. The good ideas are hiding.",
  "Clean slate. Enjoy it while it lasts.",
];

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

type NotesLines = { write: string; empty: string; noMatch: string };

/** One set of lines, chosen when Notes is opened and kept while it is. */
export function notesLines(): NotesLines {
  return { write: fresh(WRITE), empty: fresh(EMPTY), noMatch: fresh(NO_MATCH) };
}
