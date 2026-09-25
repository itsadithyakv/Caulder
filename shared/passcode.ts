/**
 * How good a journal passcode is, said before it is set.
 *
 * The lock is only as strong as the passcode, and not because of how many
 * tries the screen allows: anybody holding a copy of the database can guess
 * at it as fast as their computer goes, with no screen at all. So a new
 * passcode needs some length to it, and the easiest way to get length is a
 * few words - "tiger lily at dawn" - which is also the easiest to remember.
 *
 * Only new passcodes are held to this. One set before it still opens the
 * journal, and changing it is the moment to make it longer.
 */

const MIN_PASSCODE = 8;
export const MAX_PASSCODE = 200;

type PasscodeStrength = {
  /** 0 to 4: too short, weak, fair, good, strong. */
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
  /** Whether it can be set. */
  ok: boolean;
  /** What would make it better, when something would. */
  hint: string | null;
};

/** The ones tried first, by anybody. */
const GUESSED = new Set([
  "password",
  "password1",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "87654321",
  "qwertyui",
  "qwertyuiop",
  "iloveyou",
  "letmein1",
  "abcdefgh",
  "abcd1234",
  "11111111",
  "00000000",
  "caulder1",
  "journal1",
  "mydiary1",
]);

function isRun(text: string): boolean {
  if (/^(.)\1+$/.test(text)) return true;
  // 12345678, abcdefgh, and backwards.
  const codes = [...text].map((each) => each.charCodeAt(0));
  const steps = codes.slice(1).map((code, index) => code - (codes[index] as number));
  return steps.length > 0 && (steps.every((step) => step === 1) || steps.every((step) => step === -1));
}

export function passcodeStrength(raw: string): PasscodeStrength {
  const text = raw.normalize("NFC");
  const plain = text.toLowerCase().replace(/\s+/g, "");
  if (text.length < MIN_PASSCODE) {
    return { score: 0, label: "Too short", ok: false, hint: `At least ${MIN_PASSCODE} characters. A few words is easiest.` };
  }
  if (GUESSED.has(plain) || isRun(plain)) {
    return { score: 1, label: "Weak", ok: false, hint: "That one is among the first anybody would try." };
  }

  const words = text.trim().split(/\s+/).filter((word) => word.length >= 2).length;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z\d\s]/].filter((kind) => kind.test(text)).length;
  const distinct = new Set(plain).size;

  let points = 0;
  if (text.length >= 12) points += 1;
  if (text.length >= 16) points += 1;
  if (words >= 3) points += 1;
  if (kinds >= 3) points += 1;
  if (distinct < 5) points -= 1;

  const score = Math.max(2, Math.min(4, 2 + points)) as 2 | 3 | 4;
  const label = score === 2 ? "Fair" : score === 3 ? "Good" : "Strong";
  const hint = score >= 3 ? null : words < 3 ? "Another word or two would make it much harder to guess." : "A little longer would help.";
  return { score, label, ok: true, hint };
}
