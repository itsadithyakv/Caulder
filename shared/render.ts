/**
 * Filling a template in.
 *
 * The same substitution runs for the preview and for the queued message, so
 * what somebody approves is what goes out.
 */

type RenderContext = {
  leadName: string;
  leadContact: string | null;
  leadCity: string | null;
  companyName: string;
};

const TOKENS: Record<string, (context: RenderContext) => string | null> = {
  "lead.name": (c) => c.leadName,
  "lead.contact": (c) => c.leadContact,
  "lead.city": (c) => c.leadCity,
  "company.name": (c) => c.companyName,

  /**
   * A greeting that works when nobody's name is known.
   *
   * Most of the imported leads have no contact person, so a template written
   * as "Hi {{lead.contact}}," goes out as "Hi ," — which reads as broken
   * rather than impersonal. This token is the one to use in a greeting;
   * {{lead.contact}} stays literal for the rest of a sentence, where "there"
   * would be wrong.
   */
  "lead.greeting": (c) => c.leadContact ?? "there",
};

/**
 * Replaces every known token.
 *
 * Two rules that matter more than they look:
 *
 *  - An **unknown** token is left exactly as written. A typo like
 *    `{{lead.nmae}}` then shows up in the preview instead of quietly deleting
 *    itself, which is the difference between catching it and sending it.
 *  - A **known but empty** token becomes nothing. For the common case of a
 *    missing contact name, `{{lead.greeting}}` falls back to "there" so a
 *    greeting never reads as "Hi ,".
 */
export function render(text: string, context: RenderContext): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, token: string) => {
    const resolve = TOKENS[token];
    if (!resolve) return whole;
    return resolve(context) ?? "";
  });
}

/** Tokens in the text that nothing will replace. Shown beside the preview. */
export function unknownTokens(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const token = match[1];
    if (token && !TOKENS[token]) found.add(match[0]);
  }
  return [...found];
}
