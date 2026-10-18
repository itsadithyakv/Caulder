import { shell } from "electron";
import { CHANNELS } from "@shared/ipc";
import { isSheetUrl } from "@shared/sheet";
import { getDatabase } from "../db/connection";
import { assertId, handle } from "./handle";
import { readMe, writeMe } from "../repositories/me";
import { linkSheet, sheetState, sheetUrl, syncSheet, unlinkSheet } from "../services/sheetsync";

/** Who this Caulder is: the name Today greets, and a page's history is signed with. */
export function registerMeHandlers(): void {
  handle(CHANNELS.meGet, () => readMe(getDatabase()).name);

  handle(CHANNELS.meSet, (_event, name: unknown) => writeMe(getDatabase(), name).name);
}

/** A company's contacts as a Google Sheet (services/sheetsync.ts). */
export function registerSheetHandlers(): void {
  const companyOf = (value: unknown) => assertId(value, "company id");

  handle(CHANNELS.sheetState, (_event, companyId: unknown) => sheetState(getDatabase(), companyOf(companyId)));

  handle(CHANNELS.sheetLink, (_event, companyId: unknown) => linkSheet(getDatabase(), companyOf(companyId)));

  handle(CHANNELS.sheetSync, (_event, companyId: unknown) => syncSheet(getDatabase(), companyOf(companyId)));

  handle(CHANNELS.sheetUnlink, (_event, companyId: unknown) => unlinkSheet(getDatabase(), companyOf(companyId)));

  // The address came from the script, so it is checked before it is opened:
  // a Google spreadsheet and nothing else. The window never sees it.
  handle(CHANNELS.sheetOpen, (_event, companyId: unknown) => {
    const url = sheetUrl(getDatabase(), companyOf(companyId));
    if (!isSheetUrl(url)) throw new Error("There is no sheet to open yet. Sync once, and there will be.");
    void shell.openExternal(url);
  });
}
