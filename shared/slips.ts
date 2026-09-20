/**
 * Slips of the keyboard, and what they were aiming at.
 *
 * "Meetining" is a meeting and "invocie" is an invoice; "contact" is not a
 * contract and "finding" is not funding. The difference is the whole of this
 * file: a word is only ever read as a slip at something the app already knows
 * - a day, a kind of task, an area word, a contact's name - and only when the
 * way it differs is the way fingers go wrong rather than the way two real
 * words differ.
 *
 * Whatever is read this way is said under the line, with a button to keep the
 * word as typed (shared/quickadd.ts), and asked about later in Settings
 * (Tune), so a wrong guess is wrong once.
 */

/**
 * Edits between two words, counting a swapped pair as one - "firday" is one
 * slip from "friday", not two.
 */
export function distance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = new Array<number>(rows * cols).fill(0);
  const at = (i: number, j: number) => d[i * cols + j] ?? 0;
  for (let i = 0; i < rows; i += 1) d[i * cols] = i;
  for (let j = 0; j < cols; j += 1) d[j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      d[i * cols + j] = best;
    }
  }
  return at(a.length, b.length);
}

/** The same letters the same number of times: one is the other, shuffled. */
function sameLetters(a: string, b: string): boolean {
  return a.length === b.length && [...a].sort().join("") === [...b].sort().join("");
}

/**
 * Real words that are one dropped letter from a word the line listens for.
 * No rule about letters can tell "contact" from a mistyped "contract"; only
 * knowing that it is a word can.
 */
const REAL_WORDS = new Set([
  "contact", "contacts", "compete", "meting", "finnish", "moves", "bother", "costumer", "costumers",
]);

/**
 * Whether `typed` is plausibly a slip of the keyboard at `target`.
 *
 * Asked only about words that are not already something the app knows, and
 * only against vocabulary it does: both lowercase, never equal.
 *
 * Letters swapped, dropped or doubled - and never a letter that is not in the
 * target at all. A substitution ("meetimg") is refused on purpose: that is
 * also how "finding" differs from "funding" and "glasses" from "classes", and
 * a slip it misses costs a keystroke where a real word rewritten costs trust.
 */
export function isSlip(typed: string, target: string): boolean {
  if (typed.length < 5 || target.length < 5 || typed[0] !== target[0] || REAL_WORDS.has(typed)) return false;
  // One is the start of the other: "check" and "checkup", "lecturer" and
  // "lecture". Those are two words, not one of them mistyped.
  if (target.startsWith(typed) || typed.startsWith(target)) return false;

  const extra = typed.length - target.length;
  const d = distance(typed, target);
  if (d === 0 || d > (target.length >= 7 ? 2 : 1)) return false;
  if (extra === 0) return sameLetters(typed, target);
  // Letters stuttered in - "meetining" - can be two. A letter dropped has to be
  // the only thing wrong: drop one from "campaign", swap two, and that is
  // "camping", which is a word.
  if (extra > 2 || (extra < 0 && d > 1)) return false;
  return [...typed].every((letter) => target.includes(letter));
}

/** The one of `targets` that `word` is a slip at - the nearest, when several are - or null. */
export function slipAt(word: string, targets: Iterable<string>): string | null {
  let best: { target: string; d: number } | null = null;
  for (const target of targets) {
    if (target === word) return null;
    if (!isSlip(word, target)) continue;
    const d = distance(word, target);
    if (!best || d < best.d) best = { target, d };
  }
  return best?.target ?? null;
}
