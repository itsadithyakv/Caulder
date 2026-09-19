import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The log: that it writes, that it stays small, and that it only records
 * faults rather than every sentence the app says to a person.
 */

let home = "";
vi.mock("electron", () => ({ app: { getPath: () => home } }));

const { isFault, logProblem, logsDir } = await import("./log");

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "caulder-log-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("writing the log", () => {
  it("records the scope and the stack", () => {
    logProblem("sync", new TypeError("cannot read x of undefined"));
    const text = readFileSync(join(logsDir(), "caulder.log"), "utf8");
    expect(text).toContain("[sync]");
    expect(text).toContain("TypeError: cannot read x of undefined");
  });

  it("starts a new file once the old one passes a megabyte", () => {
    logProblem("first", "a line");
    const file = join(logsDir(), "caulder.log");
    writeFileSync(file, "x".repeat(1_000_001));
    logProblem("second", "another line");
    expect(existsSync(`${file}.1`)).toBe(true);
    expect(readFileSync(file, "utf8")).toContain("[second]");
  });

  it("never throws, even when there is nowhere to write", () => {
    // A file where the folder should be, so creating the folder fails.
    const real = home;
    const blocker = join(real, "not-a-folder");
    writeFileSync(blocker, "a file");
    home = blocker;
    try {
      expect(() => logProblem("anywhere", "a line")).not.toThrow();
    } finally {
      home = real;
    }
  });
});

describe("what counts as a fault", () => {
  it("is a programming error or something SQLite raised", () => {
    expect(isFault(new TypeError("x"))).toBe(true);
    expect(isFault(new ReferenceError("x"))).toBe(true);
    expect(isFault(Object.assign(new Error("disk I/O error"), { code: "SQLITE_IOERR" }))).toBe(true);
  });

  it("is not a sentence written for the person", () => {
    expect(isFault(new Error("That lead no longer exists."))).toBe(false);
    expect(isFault("a string")).toBe(false);
    expect(isFault(null)).toBe(false);
  });
});
