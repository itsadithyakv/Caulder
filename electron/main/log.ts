import { app } from "electron";
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A file to read when something has gone wrong.
 *
 * Caulder runs on one person's machine with nobody watching it, so the only
 * record of a failure is one it writes down itself. One file, capped: past a
 * megabyte it becomes `caulder.log.1` and a new one starts, so the log can
 * never become a problem of its own.
 *
 * Writing a line must never be the thing that breaks. Every failure in here is
 * swallowed - the one place in the app where that is the right answer.
 */

const MAX_BYTES = 1_000_000;

export function logsDir(): string {
  return join(app.getPath("userData"), "logs");
}

export function logProblem(scope: string, problem: unknown): void {
  try {
    const dir = logsDir();
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "caulder.log");
    if (existsSync(file) && statSync(file).size > MAX_BYTES) {
      renameSync(file, `${file}.1`);
    }
    const detail =
      problem instanceof Error ? (problem.stack ?? problem.message) : String(problem);
    appendFileSync(file, `${new Date().toISOString()} [${scope}] ${detail}\n`, "utf8");
  } catch {
    // Nowhere left to report it.
  }
}

/**
 * Whether an error is a fault rather than an answer.
 *
 * Most throws in main are sentences meant for the person - "That lead no
 * longer exists" - and logging each one would bury the few that matter. A
 * type error, or anything SQLite raised on its own, is a bug or a damaged
 * file, and those are what the log is for.
 */
export function isFault(error: unknown): boolean {
  if (
    error instanceof TypeError ||
    error instanceof RangeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError
  ) {
    return true;
  }
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.startsWith("SQLITE_");
}
