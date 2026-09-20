/**
 * The Google script, from Caulder's side of the connection.
 *
 * Pure: what a pasted URL and key have to look like, and which version of the
 * script can do what. The network is in electron/main/services/gsync.ts.
 */

/**
 * The version of resources/appsscript/Caulder.gs this build ships. Keep the
 * two in step: Settings offers the update to any script older than this.
 *
 * The script reports its own in `hello`; Settings says what an older one is
 * missing and how to update it. A script too old to report a version at all
 * is version 1.
 */
export const SCRIPT_VERSION = 4;

/** The first version that sends email. */
export const MAIL_SINCE_VERSION = 2;

/** The first version that saves contacts to Google Contacts and backups to Drive. */
export const CONTACTS_SINCE_VERSION = 4;

/**
 * What is wrong with a pasted web app URL, or null when it looks right.
 *
 * The two mistakes people actually make each get their own sentence: pasting
 * the test URL (it ends in /dev and only works while signed in to Google),
 * and pasting something that is not an Apps Script deployment at all.
 * Workspace accounts deploy under /a/<domain>/, which is allowed.
 */
export function checkScriptUrl(url: string): string | null {
  const value = url.trim();
  const shape = /^https:\/\/script\.google\.com\/(?:a\/[^/\s]+\/)?macros\/s\/[\w-]+\/(exec|dev)$/;
  const match = shape.exec(value);
  if (!match) {
    return "That does not look like an Apps Script web app URL. It starts with https://script.google.com/macros/s/ and ends in /exec — copy it from Deploy › Manage deployments.";
  }
  if (match[1] === "dev") {
    return "That is the test URL, which ends in /dev and only works while you are signed in. Copy the Web app URL from Deploy › Manage deployments instead; it ends in /exec.";
  }
  return null;
}

/**
 * The key, from whatever was pasted.
 *
 * The script prints "Your Caulder key: 7f3a…" and people copy the whole line,
 * sometimes with the log's timestamp and level in front. All of that is
 * dropped, and so are stray quotes and spaces.
 */
export function normaliseScriptKey(pasted: string): string {
  const afterLabel = /Caulder key:\s*(\S+)/i.exec(pasted);
  const key = afterLabel?.[1] ?? pasted;
  return key.trim().replace(/^["'`]+|["'`]+$/g, "");
}
