import { shell, type WebContents } from "electron";

/**
 * What a window is allowed to hand to the rest of the machine.
 *
 * The window runs Caulder's own code, but it shows text other people wrote - a
 * contact's website, a note pasted out of a chat - and a link in that text is
 * one click from the operating system. So a link leaves only as a web page or
 * an email, and a window never navigates away from the app itself: a page that
 * replaced Caulder's would still find `window.caulder` there to call.
 */

const ALLOWED = new Set(["https:", "mailto:"]);

/** A web page or an email address. Anything else stays inside. */
export function isSafeExternal(url: string): boolean {
  try {
    return ALLOWED.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * The same document, give or take a fragment.
 *
 * A reload - the development server's, or the one a restore asks for - is
 * not a departure, and treating it as one would leave the window stuck on the
 * data it was showing before.
 */
export function isSameDocument(target: string, current: string): boolean {
  const withoutFragment = (value: string) => value.split("#")[0];
  return withoutFragment(target) === withoutFragment(current);
}

function openOutside(url: string): void {
  if (isSafeExternal(url)) void shell.openExternal(url);
}

/** Applied to every window and web view the app makes, as it is made. */
export function guardContents(contents: WebContents): void {
  contents.on("will-navigate", (event, url) => {
    if (isSameDocument(url, contents.getURL())) return;
    event.preventDefault();
    openOutside(url);
  });

  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
}
