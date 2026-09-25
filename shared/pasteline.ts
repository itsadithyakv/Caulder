/**
 * Something pasted into the line, as the line it means.
 *
 * A message copied from WhatsApp comes with its date and who sent it -
 * "[23/09/26, 10:32 am] Rahul: can you send the deck by friday" - and an email
 * with its headers. What is kept is what was asked, and whose it was: "send
 * the deck by friday for Rahul", so it becomes Rahul's task. Several lines
 * pasted at once become one, since the line is one line. Anything else pasted
 * is left exactly as it was.
 */

const WHATSAPP = /^\s*\[?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\s*(?:[ap]\.?\s?m\.?)?\]?\s*(?:-\s*)?([^:\n]{1,40}):\s*(.*)$/i;
/** How a request is put to somebody else, which is not part of the thing to do. */
const ASKED = /^(?:hey|hi|hello|yo|bro|dude)?[,!\s]*(?:(?:can|could|would|will)\s+you\s+(?:please\s+|pls\s+)?|(?:please|pls|plz|kindly)\s+|(?:just\s+)?(?:a\s+)?reminder\s+to\s+|don'?t\s+forget\s+to\s+)/i;

function asked(message: string): string {
  return message.replace(ASKED, "").replace(/\s*[?]+\s*$/, "").trim();
}

export function cleanPaste(pasted: string): string {
  const lines = pasted
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return pasted;

  // A message, or a run of them: what was said, and by whom.
  const messages = lines.map((line) => WHATSAPP.exec(line)).filter((m): m is RegExpExecArray => m !== null);
  if (messages.length > 0) {
    const who = (messages[0]?.[1] ?? "").trim();
    const said = messages.map((m) => asked(m[2] ?? "")).filter(Boolean).join(". ");
    const mine = /^(?:you|me)$/i.test(who) || !/\p{L}/u.test(who);
    if (mine || !said) return said;
    // "call me tomorrow", from Priya, is calling Priya.
    const first = who.split(/\s+/)[0] ?? who;
    const meant = said.replace(/\bme\b/gi, first).replace(/\bmy\b/gi, `${first}'s`);
    return meant === said ? `${said} for ${who}` : meant;
  }

  // An email: its subject, and who it was from.
  const subject = lines.find((line) => /^subject:/i.test(line))?.replace(/^subject:\s*/i, "").replace(/^(?:re|fwd?):\s*/gi, "");
  if (subject) {
    const from = lines.find((line) => /^from:/i.test(line))?.replace(/^from:\s*/i, "").replace(/\s*<[^>]*>/, "").trim();
    return from ? `${subject} for ${from}` : subject;
  }

  return lines.length > 1 ? lines.join(" ") : pasted;
}
