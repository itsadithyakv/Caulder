import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("./log", () => ({ logProblem: () => undefined }));

const { bringAcross, packageFamilyOf, storeHome } = await import("./store-home");

/**
 * A Microsoft Store copy keeps its data in its package's LocalState folder,
 * found from where Windows installed it, and brings a desktop copy's data
 * across the first time it starts.
 */

const INSTALLED = "C:\\Program Files\\WindowsApps\\AdithyaKV.Caulder_0.4.1.0_x64__dhc63ph4798te\\app\\Caulder.exe";

describe("where a Store copy keeps its data", () => {
  it("reads the package family from the folder Windows installed it in", () => {
    expect(packageFamilyOf(INSTALLED)).toBe("AdithyaKV.Caulder_dhc63ph4798te");
    // Installed to another drive, and a resource id in the name.
    expect(packageFamilyOf("E:\\WindowsApps\\AdithyaKV.Caulder_1.2.3.0_neutral_split.scale-100_dhc63ph4798te\\app\\x.exe")).toBe(
      "AdithyaKV.Caulder_dhc63ph4798te",
    );
  });

  it("is LocalState under that family, and nothing for a desktop copy", () => {
    expect(storeHome(INSTALLED, "C:\\Users\\Adi\\AppData\\Local")).toBe(
      join("C:\\Users\\Adi\\AppData\\Local", "Packages", "AdithyaKV.Caulder_dhc63ph4798te", "LocalState"),
    );
    expect(storeHome("C:\\Users\\Adi\\AppData\\Local\\Programs\\Caulder\\Caulder.exe", "C:\\x")).toBeNull();
    expect(storeHome(INSTALLED, undefined)).toBeNull();
  });
});

describe("bringing a desktop copy's data across", () => {
  let from: string;
  let to: string;

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), "caulder-store-"));
    from = join(root, "desktop");
    to = join(root, "store");
    mkdirSync(from);
    mkdirSync(to);
  });

  afterEach(() => {
    rmSync(join(from, ".."), { recursive: true, force: true });
  });

  it("copies the database whole - what is only in its write-ahead log too - with its files and backup folder", () => {
    const desktop = new Database(join(from, "caulder.db"));
    desktop.pragma("journal_mode = WAL");
    desktop.exec("CREATE TABLE companies (name TEXT); INSERT INTO companies VALUES ('Unifloe')");
    // Still open, so the row is in caulder.db-wal and not yet in caulder.db.
    mkdirSync(join(from, "attachments", "lead-1"), { recursive: true });
    writeFileSync(join(from, "attachments", "lead-1", "quote.pdf"), "pdf");
    writeFileSync(join(from, "backup-folder.json"), '{"folder":"D:\\\\OneDrive\\\\Caulder"}');

    expect(bringAcross(from, to)).toBe(true);
    desktop.close();

    const store = new Database(join(to, "caulder.db"), { readonly: true });
    expect(store.prepare("SELECT name FROM companies").all()).toEqual([{ name: "Unifloe" }]);
    store.close();
    expect(readFileSync(join(to, "attachments", "lead-1", "quote.pdf"), "utf8")).toBe("pdf");
    expect(existsSync(join(to, "backup-folder.json"))).toBe(true);
  });

  it("never overwrites a Store copy that already has data, and does nothing with no desktop copy", () => {
    writeFileSync(join(to, "caulder.db"), "mine");
    new Database(join(from, "caulder.db")).close();
    expect(bringAcross(from, to)).toBe(false);
    expect(readFileSync(join(to, "caulder.db"), "utf8")).toBe("mine");

    rmSync(join(to, "caulder.db"));
    rmSync(join(from, "caulder.db"));
    expect(bringAcross(from, to)).toBe(false);
    expect(existsSync(join(to, "caulder.db"))).toBe(false);
  });
});
