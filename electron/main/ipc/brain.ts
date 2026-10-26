import { clipboard, dialog } from "electron";
import { CHANNELS } from "@shared/ipc";
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
import { nearestTo, readFirstFor, understandingOn } from "../services/understand";
import { modelHere, readLines } from "../understand/host";
import { z } from "zod";

/** What Export for an AI is told besides which company (phase 22). */
const dossierOptions = z.object({
  purpose: z.string().max(200, "Say what it is for in under 200 characters.").optional(),
});
import { buildTopicBrief } from "../services/topic";
import { backlinks, connect, disconnect, keepPositions, letGo, linkTargetsFor, localMap, wholeMap } from "../services/map";
import { makeTasks, pageTasks } from "../services/steps";
import { allMemories, editMemory, forgetMemory, pageTitles } from "../services/memories";
import { remember } from "../services/remember";
import { applySort, rulesOn, sortPlan } from "../services/howwework";
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
    return savePage(getDatabase(), pageOf(id), input, new Date());
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

  handle(CHANNELS.brainDossier, async (_event, companyId: unknown, secrets: unknown, raw: unknown) => {
    const id = companyOf(companyId);
    const options = dossierOptions.parse(raw ?? {});
    const company = getDatabase().prepare(`SELECT name FROM companies WHERE id = ?`).get(id) as
      | { name: string }
      | undefined;
    if (!company) throw new Error("That company no longer exists.");

    const picked = await dialog.showOpenDialog({
      title: "Where should the dossier go?",
      properties: ["openDirectory", "createDirectory"],
    });
    if (picked.canceled || !picked.filePaths[0]) return null;

    // What it is for, and what to read first for it - by meaning, when understanding is on (phase 22).
    const db = getDatabase();
    const purpose = options.purpose?.trim() || null;
    const reading = understandingOn(db) && modelHere() ? readLines : null;
    const first = purpose && reading ? await readFirstFor(db, reading, id, purpose).catch(() => []) : [];
    return exportDossier(db, id, company.name, picked.filePaths[0], { secrets: secrets === true }, new Date(), {
      purpose: purpose ? { said: purpose, first } : null,
    });
  });

  handle(CHANNELS.brainSearch, (_event, companyId: unknown, text: unknown) =>
    search(getDatabase(), companyOf(companyId), text),
  );

  // The brief goes on the clipboard from here rather than being handed to
  // the window to copy: it is the pages and the contacts written out in
  // full, and the screen has no use for the words. It is also not wiped
  // after thirty seconds the way a revealed number is - the whole point is
  // to paste it into something else, which may be minutes away.
  handle(CHANNELS.brainTopic, async (_event, companyId: unknown, text: unknown) => {
    const db = getDatabase();
    const id = companyOf(companyId);
    // Pages near the topic in meaning join what its words found (phase 22).
    const meant =
      typeof text === "string" && text.trim() && understandingOn(db) && modelHere()
        ? [...new Set((await nearestTo(db, readLines, [id], text.trim(), { kinds: ["page", "memory"], most: 8, floor: 0.35 }).catch(() => [])).map((hit) => hit.sourceId))]
        : [];
    const brief = buildTopicBrief(db, id, text, new Date(), meant);
    clipboard.writeText(brief.markdown);
    return { topic: brief.topic, chars: brief.chars, went: brief.went, cut: brief.cut };
  });

  /* ---- Links and the Map ---- */

  handle(CHANNELS.brainLinkTargets, (_event, companyId: unknown, text: unknown) =>
    linkTargetsFor(getDatabase(), companyOf(companyId), text),
  );

  handle(CHANNELS.brainBacklinks, (_event, kind: unknown, id: unknown) => backlinks(getDatabase(), kind, id));

  handle(CHANNELS.brainTitles, (_event, companyId: unknown) => pageTitles(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.brainMemories, (_event, companyId: unknown) => allMemories(getDatabase(), companyOf(companyId)));
  handle(CHANNELS.brainEditMemory, (_event, input: unknown) => editMemory(getDatabase(), input, new Date()));
  handle(CHANNELS.brainForgetMemory, (_event, input: unknown) => forgetMemory(getDatabase(), input, new Date()));
  handle(CHANNELS.brainRemember, (_event, input: unknown) => remember(getDatabase(), input, new Date()));
  handle(CHANNELS.brainRulesOn, (_event, companyId: unknown, subject: unknown) => rulesOn(getDatabase(), companyOf(companyId), subject));
  handle(CHANNELS.brainSortPlan, (_event, companyId: unknown, pageId: unknown) =>
    sortPlan(getDatabase(), companyOf(companyId), assertId(pageId, "page id")),
  );
  handle(CHANNELS.brainSortApply, (_event, companyId: unknown, input: unknown) => applySort(getDatabase(), companyOf(companyId), input));

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

  handle(CHANNELS.brainConnect, (_event, companyId: unknown, from: unknown, to: unknown) =>
    connect(getDatabase(), companyOf(companyId), from, to, new Date()),
  );

  handle(CHANNELS.brainDisconnect, (_event, companyId: unknown, one: unknown, other: unknown) => {
    disconnect(getDatabase(), companyOf(companyId), one, other, new Date());
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
