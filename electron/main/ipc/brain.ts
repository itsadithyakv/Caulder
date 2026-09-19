import { clipboard, dialog } from "electron";
import { CHANNELS } from "@shared/ipc";
import { resealIfPast } from "../services/journal-lock";
import { getDatabase } from "../db/connection";
import { assertId, handle } from "./handle";
import {
  archivePage,
  brainHome,
  fileNote,
  getPage,
  newPage,
  pageRevisions,
  pinPage,
  removePage,
  restoreRevision,
  revealSecret,
  savePage,
  search,
  sectionPages,
} from "../services/brain";
import { exportBrain } from "../services/brain-export";
import { exportDossier } from "../services/dossier";
import { backlinks, connect, disconnect, keepPositions, letGo, linkTargetsFor, localMap, wholeMap } from "../services/map";
import { makeTasks, pageTasks } from "../services/steps";
import { decisionLog } from "../services/brain";

/** A copied number is wiped from the clipboard after this, if nothing replaced it. */
const CLIPBOARD_MS = 30_000;

export function registerBrainHandlers(): void {
  const companyOf = (value: unknown) => assertId(value, "company id");
  const pageOf = (value: unknown) => assertId(value, "page id");

  handle(CHANNELS.brainHome, (_event, companyId: unknown) =>
    brainHome(getDatabase(), companyOf(companyId), new Date()),
  );

  handle(CHANNELS.brainSection, (_event, companyId: unknown, section: unknown, archived: unknown) =>
    sectionPages(getDatabase(), companyOf(companyId), section, archived === true),
  );

  handle(CHANNELS.brainPage, (_event, id: unknown) => getPage(getDatabase(), pageOf(id)));

  handle(CHANNELS.brainCreate, (_event, companyId: unknown, section: unknown, template: unknown, preset: unknown) =>
    newPage(getDatabase(), companyOf(companyId), section, template, new Date(), preset),
  );

  handle(CHANNELS.brainSave, (_event, id: unknown, input: unknown) => {
    const page = savePage(getDatabase(), pageOf(id), input, new Date());
    // A journal entry for a day that is over goes back under its seal; the
    // window keeps the words it just saved.
    resealIfPast(getDatabase(), page.id);
    return page;
  });

  handle(CHANNELS.brainPin, (_event, id: unknown, pinned: unknown) =>
    pinPage(getDatabase(), pageOf(id), pinned === true),
  );

  handle(CHANNELS.brainArchive, (_event, id: unknown, archived: unknown) =>
    archivePage(getDatabase(), pageOf(id), archived === true, new Date()),
  );

  handle(CHANNELS.brainDelete, (_event, id: unknown) => {
    removePage(getDatabase(), pageOf(id));
  });

  handle(CHANNELS.brainRevisions, (_event, id: unknown) => pageRevisions(getDatabase(), pageOf(id)));

  handle(CHANNELS.brainRestore, (_event, id: unknown, revision: unknown) =>
    restoreRevision(getDatabase(), pageOf(id), revision, new Date()),
  );

  handle(CHANNELS.brainReveal, (_event, id: unknown, field: unknown) =>
    revealSecret(getDatabase(), pageOf(id), field),
  );

  // Copied from here rather than from the window, so the window never has to
  // hold the value to copy it.
  handle(CHANNELS.brainCopySecret, (_event, id: unknown, field: unknown) => {
    const value = revealSecret(getDatabase(), pageOf(id), field);
    clipboard.writeText(value);
    setTimeout(() => {
      if (clipboard.readText() === value) clipboard.clear();
    }, CLIPBOARD_MS);
  });

  handle(CHANNELS.brainFileNote, (_event, noteId: unknown, section: unknown) =>
    fileNote(getDatabase(), noteId, section, new Date()),
  );

  handle(CHANNELS.brainExport, async (_event, companyId: unknown, secrets: unknown) => {
    const id = companyOf(companyId);
    const company = getDatabase().prepare(`SELECT name FROM companies WHERE id = ?`).get(id) as
      | { name: string }
      | undefined;
    if (!company) throw new Error("That company no longer exists.");

    const picked = await dialog.showOpenDialog({
      title: "Where should the brain go?",
      properties: ["openDirectory", "createDirectory"],
    });
    if (picked.canceled || !picked.filePaths[0]) return null;

    return exportBrain(getDatabase(), id, company.name, picked.filePaths[0], { secrets: secrets === true });
  });

  handle(CHANNELS.brainDossier, async (_event, companyId: unknown, secrets: unknown) => {
    const id = companyOf(companyId);
    const company = getDatabase().prepare(`SELECT name FROM companies WHERE id = ?`).get(id) as
      | { name: string }
      | undefined;
    if (!company) throw new Error("That company no longer exists.");

    const picked = await dialog.showOpenDialog({
      title: "Where should the dossier go?",
      properties: ["openDirectory", "createDirectory"],
    });
    if (picked.canceled || !picked.filePaths[0]) return null;

    return exportDossier(getDatabase(), id, company.name, picked.filePaths[0], { secrets: secrets === true });
  });

  handle(CHANNELS.brainSearch, (_event, companyId: unknown, text: unknown) =>
    search(getDatabase(), companyOf(companyId), text),
  );

  /* ---- Links and the Map ---- */

  handle(CHANNELS.brainLinkTargets, (_event, companyId: unknown, text: unknown) =>
    linkTargetsFor(getDatabase(), companyOf(companyId), text),
  );

  handle(CHANNELS.brainBacklinks, (_event, kind: unknown, id: unknown) => backlinks(getDatabase(), kind, id));

  handle(CHANNELS.brainMap, (_event, companyId: unknown, allContacts: unknown) =>
    wholeMap(getDatabase(), companyOf(companyId), allContacts),
  );

  handle(CHANNELS.brainLocalMap, (_event, companyId: unknown, kind: unknown, id: unknown, depth: unknown) =>
    localMap(getDatabase(), companyOf(companyId), kind, id, depth),
  );

  handle(CHANNELS.brainKeepPositions, (_event, companyId: unknown, positions: unknown) => {
    keepPositions(getDatabase(), companyOf(companyId), positions);
  });

  handle(CHANNELS.brainLetGo, (_event, companyId: unknown) => {
    letGo(getDatabase(), companyOf(companyId));
  });

  // Linking on the Map writes into a page, so a journal day goes back under its seal after, as with a save.
  handle(CHANNELS.brainConnect, (_event, companyId: unknown, from: unknown, to: unknown) => {
    const outcome = connect(getDatabase(), companyOf(companyId), from, to, new Date());
    if (!outcome.already) resealIfPast(getDatabase(), outcome.pageId);
    return outcome;
  });

  handle(CHANNELS.brainDisconnect, (_event, companyId: unknown, one: unknown, other: unknown) => {
    for (const pageId of disconnect(getDatabase(), companyOf(companyId), one, other, new Date())) {
      resealIfPast(getDatabase(), pageId);
    }
  });

  handle(CHANNELS.brainSteps, (_event, id: unknown) => pageTasks(getDatabase(), pageOf(id)));

  handle(CHANNELS.brainMakeTasks, (_event, id: unknown, leadId: unknown) =>
    makeTasks(
      getDatabase(),
      pageOf(id),
      typeof leadId === "string" && leadId ? assertId(leadId, "contact id") : null,
    ),
  );

  handle(CHANNELS.brainDecisions, (_event, companyId: unknown) => decisionLog(getDatabase(), companyOf(companyId)));
}
