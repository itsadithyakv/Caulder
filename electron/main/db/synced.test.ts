import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { syncedFolders } from "./synced";

/** Folders OneDrive, Dropbox and Google Drive keep in step, found without asking them anything. */
describe("synced folders", () => {
  const look = (paths: string[], env: Record<string, string>, files: Record<string, string> = {}) => ({
    env,
    exists: (path: string) => paths.includes(path),
    read: (path: string) => files[path] ?? null,
  });

  it("finds OneDrive from the environment, and puts the copies in a folder of their own", () => {
    const found = syncedFolders(look(["C:\\Users\\a\\OneDrive"], { OneDrive: "C:\\Users\\a\\OneDrive" }));
    expect(found).toEqual([{ id: "onedrive", name: "OneDrive", folder: join("C:\\Users\\a\\OneDrive", "Caulder backups") }]);
  });

  it("does not offer a OneDrive the environment names but that is not there", () => {
    expect(syncedFolders(look([], { OneDrive: "C:\\Users\\a\\OneDrive" }))).toEqual([]);
  });

  it("reads where Dropbox is from its own info.json, before the usual place", () => {
    const info = join("C:\\Users\\a\\AppData\\Local", "Dropbox", "info.json");
    const found = syncedFolders(
      look(["D:\\Dropbox", "C:\\Users\\a\\Dropbox"], { LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local", USERPROFILE: "C:\\Users\\a" }, {
        [info]: JSON.stringify({ personal: { path: "D:\\Dropbox" } }),
      }),
    );
    expect(found.map((each) => each.folder)).toEqual([join("D:\\Dropbox", "Caulder backups")]);
  });

  it("finds Google Drive's My Drive on its drive letter", () => {
    const found = syncedFolders(look(["H:\\My Drive"], {}));
    expect(found).toEqual([{ id: "gdrive", name: "Google Drive", folder: join("H:\\My Drive", "Caulder backups") }]);
  });

  it("offers nothing on a computer with none of them", () => {
    expect(syncedFolders(look([], {}))).toEqual([]);
  });
});
