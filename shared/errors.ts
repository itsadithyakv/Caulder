/**
 * What a failure looks like by the time a person reads it.
 *
 * An error thrown in main crosses the bridge as a string, and Electron builds
 * that string itself: `Error invoking remote method 'words:add': Error: "CS301"
 * is already a word for College.` The last part is a sentence written for
 * somebody; the rest is Electron's bookkeeping, and it sat in front of every
 * error the app could show.
 *
 * Two halves, one each side of the bridge. Main makes sure what it throws is a
 * sentence (`readableError`); the preload takes the wrapper back off
 * (`ipcMessage`). Pure, so both are tested without a window.
 */

const WRAPPER = /^Error invoking remote method '[^']*': /;
/** `Error: `, `TypeError: `, `SqliteError: ` - the name `toString` put in front. */
const NAME = /^[A-Za-z]*Error: /;

/**
 * The sentence inside Electron's wrapper, or the message untouched when there
 * is no wrapper - so running it twice, or on an error that never crossed the
 * bridge, changes nothing. The error's name is only taken off along with the
 * wrapper: a bare "TypeError: x" raised in the window is left saying so.
 */
export function ipcMessage(raw: string): string {
  const inner = raw.replace(WRAPPER, "");
  if (inner === raw) return raw;
  return inner.replace(NAME, "").trim();
}

/**
 * What main should throw instead, when what it caught is not fit to read.
 *
 * A ZodError's message is its whole issue list as JSON, many lines long, so a
 * schema rejecting a 250-character title came back as a screenful of braces
 * with the one useful sentence buried in the middle of it. Every schema here
 * states its own sentence for the ways input actually goes wrong, and the
 * first one is what the person needs. Checked by shape rather than `instanceof` so this file
 * does not pull zod into the preload bundle.
 */
export function readableError(error: unknown): unknown {
  if (
    error instanceof Error &&
    error.name === "ZodError" &&
    "issues" in error &&
    Array.isArray(error.issues)
  ) {
    const first = (error.issues as { message?: unknown }[])[0]?.message;
    return new Error(typeof first === "string" && first.length > 0 ? first : "That was not accepted.");
  }
  return error;
}
