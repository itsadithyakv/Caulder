import { clipboard, dialog } from "electron";
import { readFileSync } from "node:fs";
import { CHANNELS } from "@shared/ipc";
import { getDatabase } from "../db/connection";
import { assertId, handle } from "./handle";
import { readMe, writeMe } from "../repositories/me";
import {
  invitationFor,
  joinBrain,
  previewInvitation,
  shareState,
  startSharing,
  stopSharing,
  syncBrain,
} from "../services/brainsync";
import { importBrainFile, writeBrainFile } from "../services/brainfile";
import { safeName, stamp } from "../services/names";

/** A brain file is small, but not unlimited: past this it is not a brain file. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Two founders from the window. */
export function registerShareHandlers(): void {
  const companyOf = (value: unknown) => assertId(value, "company id");

  handle(CHANNELS.meGet, () => readMe(getDatabase()).name);

  handle(CHANNELS.meSet, (_event, name: unknown) => writeMe(getDatabase(), name).name);

  handle(CHANNELS.shareState, (_event, companyId: unknown) => shareState(getDatabase(), companyOf(companyId)));

  handle(CHANNELS.shareStart, (_event, companyId: unknown) => startSharing(getDatabase(), companyOf(companyId)));

  // The invitation holds the script's address, which the window never sees:
  // main puts it straight on the clipboard.
  handle(CHANNELS.shareCopyInvite, async (_event, companyId: unknown) => {
    clipboard.writeText(await invitationFor(getDatabase(), companyOf(companyId)));
  });

  handle(CHANNELS.sharePreview, (_event, invitation: unknown) => previewInvitation(invitation));

  handle(CHANNELS.shareJoin, (_event, companyId: unknown, invitation: unknown) =>
    joinBrain(getDatabase(), companyOf(companyId), invitation),
  );

  handle(CHANNELS.shareSync, (_event, companyId: unknown) => syncBrain(getDatabase(), companyOf(companyId)));

  handle(CHANNELS.shareStop, (_event, companyId: unknown) => stopSharing(getDatabase(), companyOf(companyId)));

  handle(CHANNELS.shareExport, async (_event, companyId: unknown) => {
    const id = companyOf(companyId);
    const company = getDatabase().prepare(`SELECT name FROM companies WHERE id = ?`).get(id) as { name: string } | undefined;
    const picked = await dialog.showSaveDialog({
      title: "Save the brain as a file",
      defaultPath: `${safeName(company?.name ?? "Caulder")} brain ${stamp(new Date())}.json`,
      filters: [{ name: "Brain file", extensions: ["json"] }],
    });
    if (picked.canceled || !picked.filePath) return null;
    return { pages: writeBrainFile(getDatabase(), id, picked.filePath) };
  });

  handle(CHANNELS.shareImport, async (_event, companyId: unknown) => {
    const id = companyOf(companyId);
    const picked = await dialog.showOpenDialog({
      title: "Bring in a brain file",
      properties: ["openFile"],
      filters: [{ name: "Brain file", extensions: ["json"] }],
    });
    const path = picked.filePaths[0];
    if (picked.canceled || !path) return null;
    const text = readFileSync(path, "utf8");
    if (text.length > MAX_FILE_BYTES) throw new Error("That file is too big to be a brain file.");
    return importBrainFile(getDatabase(), id, text);
  });
}
