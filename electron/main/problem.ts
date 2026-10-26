import { app, shell } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { release } from "node:os";
import { join } from "node:path";
import { logsDir } from "./log";

/**
 * Report a problem (after 0.3). Caulder has no server and sends nothing on
 * its own, so a report is text the person sees in full first: which version,
 * which Windows, and the end of the log with what could identify anyone taken
 * out. Then they copy it, or open an issue on GitHub with it filled in and
 * send that themselves.
 */

const ISSUES = "https://github.com/itsadithyakv/Caulder/issues/new";
/** The end of the log, which is where the problem being reported will be. */
const LINES = 60;
/** A URL a browser will open whole. */
const URL_BUDGET = 6000;

/** Emails, phone numbers and the Windows account name out of a line. */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    // A run of digits long enough to be a phone number - but not a date, which the log is full of.
    .replace(/\+?\d[\d\s().-]{6,}\d/g, (run) =>
      /^\d{4}-\d{2}-\d{2}/.test(run) || run.replace(/\D/g, "").length < 8 ? run : "[number]",
    )
    .replace(/([A-Za-z]:\\Users\\)[^\\\s"']+/g, "$1[you]")
    .replace(/(\/(?:home|Users)\/)[^/\s"']+/g, "$1[you]");
}

export function problemReport(): string {
  const file = join(logsDir(), "caulder.log");
  const tail = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).slice(-LINES) : [];
  return [
    `Caulder ${app.getVersion()} on Windows ${release()} (${process.arch}), Electron ${process.versions.electron}`,
    "",
    "What happened:",
    "(Say what you did and what you expected, in a sentence or two.)",
    "",
    tail.length > 0 ? `The last ${tail.length} lines of the log:` : "The log is empty.",
    ...tail.map(redact),
  ].join("\n");
}

/** Opens a new issue with the report filled in; the person reads it and sends it, or does not. */
export function openIssue(text: unknown): void {
  const body = typeof text === "string" ? text : "";
  const cut = body.length > URL_BUDGET ? `${body.slice(0, URL_BUDGET)}\n…(cut to fit; paste the rest if it matters)` : body;
  void shell.openExternal(`${ISSUES}?title=${encodeURIComponent("A problem in Caulder")}&body=${encodeURIComponent(cut)}`);
}
