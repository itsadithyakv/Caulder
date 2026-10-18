/**
 * A password, a PIN or a card number being written into the line.
 *
 * The line keeps what it is given as plain text - a note, a memory on a page
 * - and search finds plain text. So a line that looks like one of these is
 * never filed as a memory: the line says so before anything is kept, and
 * points at the place that is sealed, a secret field on a brain page
 * (`services/secrets.ts`).
 */
const SECRET =
  /\b(?:password|passcode|passwd|pwd|(?:atm\s+|upi\s+|card\s+|phone\s+|sim\s+|debit\s+card\s+|credit\s+card\s+)?pin(?!\s*code)|otp|cvv|card\s+(?:number|no)|account\s+(?:number|no)|a\/c\s+(?:number|no)|aadhaa?r(?:\s+(?:number|no|card))?|pan(?:\s+card)?\s+(?:number|no)|passport\s+(?:number|no)|ifsc|api\s+key|secret\s+key|recovery\s+(?:code|key|phrase)|seed\s+phrase|security\s+(?:code|answer))\b/i;

export function isSecret(said: string): boolean {
  return SECRET.test(said) && /(?:\bis\b|:|=|-)\s*\S/.test(said);
}
