import { app, ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { CHANNELS, type Workspace } from "@shared/ipc";
import {
  ACCENT_IDS,
  LEAD_SORTS,
  activityInput,
  companyInput,
  taskInput,
  stageInput,
  leadInput,
  type AccentId,
  type LeadQuery,
  type LeadSort,
} from "@shared/domain";
import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { existsSync } from "node:fs";
import { dialog } from "electron";
import { MAX_BYTES, type ColumnMapping, type Resolution } from "@shared/import";
import { isDay } from "@shared/dates";
import { buildToday } from "../services/today";
import { buildBoard } from "../services/pipeline";
import { exportEverything } from "../services/export";
import { backupNow, listBackups, restoreBackup } from "../db/backup";
import { backupsDir, closeDatabase, databasePath, openDatabase } from "../db/connection";
import { shell } from "electron";
import { buildOutbox, ingestLog, listSyncBatches, recordOutbox } from "../services/sync";
import {
  addStep,
  createSequence,
  deleteSequence,
  enroll,
  listSequences,
  removeStep,
} from "../services/sequences";
import {
  createTemplate,
  deleteMessage,
  deleteTemplate,
  listMessages,
  requeueMessage,
  listMessagesForLead,
  listTemplates,
  queueMessage,
  updateTemplate,
} from "../repositories/email";
import {
  MAIL_PROVIDERS,
  queueInput,
  sequenceInput,
  templateInput,
  type MailProvider,
} from "@shared/email";
import { today as todayIn } from "@shared/dates";
import {
  createStage,
  deleteStage,
  moveStage,
  renameStage,
  setStageKind,
} from "../repositories/stages";
import {
  completeTask,
  createTask,
  deleteTask,
  listTasksForLead,
  reopenTask,
  rescheduleTask,
  updateTask,
} from "../repositories/tasks";
import {
  buildTemplate,
  commitImport,
  listBatches,
  previewFile,
  readPasted,
  readSheet,
  registerFile,
  undoImport,
} from "../services/import";
import { findDemoBatch, seedDemo } from "../services/demo";
import {
  createLead,
  deleteLead,
  deleteMany,
  setStageForMany,
  findLead,
  listActivities,
  listLeads,
  logActivity,
  setLeadStage,
  updateLead,
} from "../repositories/leads";
import { getDatabase } from "../db/connection";
import {
  archiveCompany,
  deleteCompany,
  createCompany,
  listCompanies,
  listStages,
  renameCompany,
  setCompanyAccent,
} from "../repositories/companies";
import { getSetting, resolveActiveCompanyId, setSetting } from "../repositories/settings";

/**
 * Every mutating company handler returns the whole Workspace rather than the
 * one row it changed. The renderer then replaces its state outright, which
 * removes a class of bug where the list, the active id and the sidebar drift
 * out of step after an edit.
 */
function workspace(): Workspace {
  const db = getDatabase();
  const companies = listCompanies(db);
  const activeCompanyId = resolveActiveCompanyId(
    db,
    companies.map((c) => c.id),
  );
  return { companies, activeCompanyId };
}

/**
 * Renderer input is validated here as well as in the form. The renderer is our
 * own code, but it is the untrusted side of this boundary by construction, and
 * a bad value reaching SQLite is far harder to diagnose than a rejected call.
 */
function assertAccent(value: unknown): AccentId {
  if (typeof value === "string" && (ACCENT_IDS as readonly string[]).includes(value)) {
    return value as AccentId;
  }
  throw new Error(`Unknown accent: ${String(value)}`);
}

/** Defaults to Gmail, which is what the shipped script is set up for. */
function readProvider(): MailProvider {
  const stored = getSetting(getDatabase(), "mailProvider");
  return (MAIL_PROVIDERS as readonly string[]).includes(stored ?? "")
    ? (stored as MailProvider)
    : "gmail";
}

function assertId(value: unknown, label: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`Missing ${label}.`);
}

/**
 * A selection, checked at the boundary like every other input.
 *
 * Capped because these run as one transaction and the ids come from a list
 * the renderer built: the cap is the difference between a bulk action and an
 * unbounded one. Well above any selection the table can produce.
 */
function assertIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Missing lead ids.");
  if (value.length > 5000) throw new Error("Too many leads in one action.");
  return value.map((id) => assertId(id, "lead id"));
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  /* ---- Window ---- */

  ipcMain.on(CHANNELS.windowMinimize, () => getWindow()?.minimize());

  ipcMain.on(CHANNELS.windowToggleMaximize, () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.on(CHANNELS.windowClose, () => getWindow()?.close());

  ipcMain.handle(CHANNELS.windowIsMaximized, () => getWindow()?.isMaximized() ?? false);

  ipcMain.handle(CHANNELS.appVersion, () => app.getVersion());

  /* ---- Companies ---- */

  ipcMain.handle(CHANNELS.companiesList, () => workspace());
  ipcMain.handle(CHANNELS.activeCompanyGet, () => workspace());

  ipcMain.handle(CHANNELS.companiesCreate, (_event, raw: unknown) => {
    const input = companyInput.parse(raw);
    const created = createCompany(getDatabase(), input);
    // A newly created company becomes the one you are looking at. Creating a
    // workspace and staying in the old one is never what was meant.
    setSetting(getDatabase(), "activeCompanyId", created.id);
    return workspace();
  });

  ipcMain.handle(CHANNELS.companiesRename, (_event, id: unknown, name: unknown) => {
    const clean = companyInput.shape.name.parse(name);
    renameCompany(getDatabase(), assertId(id, "company id"), clean);
    return workspace();
  });

  ipcMain.handle(CHANNELS.companiesSetAccent, (_event, id: unknown, accent: unknown) => {
    setCompanyAccent(getDatabase(), assertId(id, "company id"), assertAccent(accent));
    return workspace();
  });

  ipcMain.handle(CHANNELS.companiesArchive, (_event, id: unknown) => {
    archiveCompany(getDatabase(), assertId(id, "company id"));
    return workspace();
  });

  ipcMain.handle(CHANNELS.companiesDelete, (_event, id: unknown) => {
    deleteCompany(getDatabase(), assertId(id, "company id"));
    return workspace();
  });

  ipcMain.handle(CHANNELS.companiesSeedDemo, (_event, companyId: unknown) =>
    seedDemo(getDatabase(), assertId(companyId, "company id")),
  );

  ipcMain.handle(CHANNELS.companiesDemoBatch, (_event, companyId: unknown) =>
    findDemoBatch(getDatabase(), assertId(companyId, "company id")),
  );

  ipcMain.handle(CHANNELS.companiesStages, (_event, companyId: unknown) =>
    listStages(getDatabase(), assertId(companyId, "company id")),
  );

  ipcMain.handle(CHANNELS.activeCompanySet, (_event, id: unknown) => {
    setSetting(getDatabase(), "activeCompanyId", assertId(id, "company id"));
    return workspace();
  });

  /* ---- Leads ---- */

  ipcMain.handle(CHANNELS.leadsList, (_event, raw: unknown) =>
    listLeads(getDatabase(), parseQuery(raw)),
  );

  ipcMain.handle(CHANNELS.leadsFind, (_event, id: unknown) =>
    findLead(getDatabase(), assertId(id, "lead id")),
  );

  ipcMain.handle(CHANNELS.leadsCreate, (_event, companyId: unknown, raw: unknown) =>
    createLead(getDatabase(), assertId(companyId, "company id"), leadInput.parse(raw)),
  );

  ipcMain.handle(CHANNELS.leadsUpdate, (_event, id: unknown, raw: unknown) =>
    updateLead(getDatabase(), assertId(id, "lead id"), leadInput.parse(raw)),
  );

  ipcMain.handle(CHANNELS.leadsSetStage, (_event, id: unknown, stageId: unknown) =>
    setLeadStage(
      getDatabase(),
      assertId(id, "lead id"),
      typeof stageId === "string" && stageId.length > 0 ? stageId : null,
    ),
  );

  ipcMain.handle(CHANNELS.leadsDelete, (_event, id: unknown) => {
    deleteLead(getDatabase(), assertId(id, "lead id"));
  });

  ipcMain.handle(
    CHANNELS.leadsSetStageMany,
    (_event, companyId: unknown, ids: unknown, stageId: unknown) =>
      setStageForMany(
        getDatabase(),
        assertId(companyId, "company id"),
        assertIds(ids),
        typeof stageId === "string" && stageId.length > 0 ? stageId : null,
      ),
  );

  ipcMain.handle(CHANNELS.leadsDeleteMany, (_event, companyId: unknown, ids: unknown) =>
    deleteMany(getDatabase(), assertId(companyId, "company id"), assertIds(ids)),
  );

  /* ---- Timeline ---- */

  ipcMain.handle(CHANNELS.activitiesList, (_event, leadId: unknown) =>
    listActivities(getDatabase(), assertId(leadId, "lead id")),
  );

  ipcMain.handle(CHANNELS.activitiesLog, (_event, raw: unknown) =>
    logActivity(getDatabase(), activityInput.parse(raw)),
  );

  registerImportHandlers();
  registerTaskHandlers();
  registerBoardHandlers();
  registerEmailHandlers();
  registerDataHandlers(getWindow);
}

/* ---- Backup, restore and export ---- */

function registerDataHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle(CHANNELS.dataBackups, () => listBackups());

  ipcMain.handle(CHANNELS.dataBackupNow, () => backupNow());

  ipcMain.handle(CHANNELS.dataPaths, () => ({
    database: databasePath(),
    backups: backupsDir(),
  }));

  ipcMain.handle(CHANNELS.dataRevealFolder, async (_event, path: unknown) => {
    if (typeof path !== "string" || path.length === 0) return;
    await shell.openPath(path);
  });

  /**
   * Restoring replaces the live database, so the window is reloaded rather
   * than left holding state from the file that has just been swapped out.
   * Everything on screen — the open lead, the board, the cached workspace —
   * describes data that no longer exists.
   */
  ipcMain.handle(CHANNELS.dataRestore, (_event, path: unknown) => {
    const result = restoreBackup(
      assertId(path, "backup path"),
      closeDatabase,
      openDatabase,
    );
    // The reload is what discards the screen's now-stale state. It happens
    // after the reply so the caller learns where the safety copy went.
    setTimeout(() => getWindow()?.reload(), 50);
    return result;
  });

  ipcMain.handle(CHANNELS.dataExportAll, async (_event, companyId: unknown) => {
    const id = assertId(companyId, "company id");
    const company = getDatabase()
      .prepare(`SELECT name FROM companies WHERE id = ?`)
      .get(id) as { name: string } | undefined;
    if (!company) throw new Error("That company no longer exists.");

    const picked = await dialog.showOpenDialog({
      title: "Where should the export go?",
      properties: ["openDirectory", "createDirectory"],
    });
    if (picked.canceled || !picked.filePaths[0]) return null;

    return exportEverything(getDatabase(), id, company.name, picked.filePaths[0]);
  });
}

/* ---- Email and the bridge ---- */

/** Reads the day in the company's own timezone, as everything else does. */
function companyDay(companyId: string): string {
  const row = getDatabase()
    .prepare(`SELECT timezone FROM companies WHERE id = ?`)
    .get(companyId) as { timezone: string } | undefined;
  return todayIn(row?.timezone ?? "UTC");
}

function registerEmailHandlers() {
  ipcMain.handle(CHANNELS.templatesList, (_event, companyId: unknown) =>
    listTemplates(getDatabase(), assertId(companyId, "company id")),
  );

  ipcMain.handle(CHANNELS.templatesCreate, (_event, companyId: unknown, raw: unknown) =>
    createTemplate(
      getDatabase(),
      assertId(companyId, "company id"),
      templateInput.parse(raw),
    ),
  );

  ipcMain.handle(CHANNELS.templatesUpdate, (_event, id: unknown, raw: unknown) =>
    updateTemplate(getDatabase(), assertId(id, "template id"), templateInput.parse(raw)),
  );

  ipcMain.handle(CHANNELS.templatesDelete, (_event, id: unknown) =>
    deleteTemplate(getDatabase(), assertId(id, "template id")),
  );

  ipcMain.handle(CHANNELS.emailList, (_event, companyId: unknown) =>
    listMessages(getDatabase(), assertId(companyId, "company id")),
  );

  ipcMain.handle(CHANNELS.emailProvider, () => readProvider());

  ipcMain.handle(CHANNELS.emailSetProvider, (_event, raw: unknown) => {
    if (!(MAIL_PROVIDERS as readonly unknown[]).includes(raw)) {
      throw new Error("That is not a provider Caulder knows about.");
    }
    setSetting(getDatabase(), "mailProvider", raw as MailProvider);
    return readProvider();
  });

  ipcMain.handle(CHANNELS.emailRequeue, (_event, id: unknown) =>
    requeueMessage(getDatabase(), assertId(id, "message id")),
  );

  ipcMain.handle(CHANNELS.emailForLead, (_event, leadId: unknown) =>
    listMessagesForLead(getDatabase(), assertId(leadId, "lead id")),
  );

  ipcMain.handle(CHANNELS.emailQueue, (_event, companyId: unknown, raw: unknown) =>
    queueMessage(getDatabase(), assertId(companyId, "company id"), queueInput.parse(raw)),
  );

  ipcMain.handle(CHANNELS.emailDelete, (_event, id: unknown) => {
    deleteMessage(getDatabase(), assertId(id, "message id"));
  });

  ipcMain.handle(CHANNELS.sequencesList, (_event, companyId: unknown) =>
    listSequences(getDatabase(), assertId(companyId, "company id")),
  );

  ipcMain.handle(CHANNELS.sequencesCreate, (_event, companyId: unknown, raw: unknown) =>
    createSequence(
      getDatabase(),
      assertId(companyId, "company id"),
      sequenceInput.parse(raw),
    ),
  );

  ipcMain.handle(CHANNELS.sequencesDelete, (_event, id: unknown) =>
    deleteSequence(getDatabase(), assertId(id, "sequence id")),
  );

  ipcMain.handle(
    CHANNELS.sequencesAddStep,
    (_event, sequenceId: unknown, templateId: unknown, offsetDays: unknown) =>
      addStep(
        getDatabase(),
        assertId(sequenceId, "sequence id"),
        assertId(templateId, "template id"),
        typeof offsetDays === "number" ? offsetDays : 0,
      ),
  );

  ipcMain.handle(CHANNELS.sequencesRemoveStep, (_event, stepId: unknown) =>
    removeStep(getDatabase(), assertId(stepId, "step id")),
  );

  ipcMain.handle(CHANNELS.sequencesEnroll, (_event, sequenceId: unknown, leadId: unknown) => {
    enroll(getDatabase(), assertId(sequenceId, "sequence id"), assertId(leadId, "lead id"));
  });

  /* The bridge itself. */

  ipcMain.handle(CHANNELS.syncExport, async (_event, companyId: unknown) => {
    const id = assertId(companyId, "company id");
    const file = await buildOutbox(getDatabase(), id, companyDay(id));
    if (file.count === 0) return { path: "", count: 0 };

    const target = await dialog.showSaveDialog({
      title: "Save the outbox",
      defaultPath: `caulder-outbox-${companyDay(id)}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (target.canceled || !target.filePath) return null;

    // Written first, recorded second. A message marked exported for a file
    // that failed to write would never be sent and never be noticed.
    await writeFile(target.filePath, file.csv, "utf8");
    recordOutbox(getDatabase(), id, basename(target.filePath), file);

    return { path: target.filePath, count: file.count };
  });

  ipcMain.handle(CHANNELS.syncImport, async (_event, companyId: unknown) => {
    const picked = await dialog.showOpenDialog({
      title: "Choose the log file",
      properties: ["openFile"],
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (picked.canceled || !picked.filePaths[0]) return null;

    const path = picked.filePaths[0];
    return ingestLog(
      getDatabase(),
      assertId(companyId, "company id"),
      basename(path),
      await readFile(path, "utf8"),
    );
  });

  ipcMain.handle(CHANNELS.syncHistory, (_event, companyId: unknown) =>
    listSyncBatches(getDatabase(), assertId(companyId, "company id")),
  );

  ipcMain.handle(CHANNELS.syncScript, async () => {
    const target = await dialog.showSaveDialog({
      title: "Save the Apps Script file",
      defaultPath: "Caulder.gs",
      filters: [{ name: "Apps Script", extensions: ["gs"] }],
    });
    if (target.canceled || !target.filePath) return null;

    await writeFile(target.filePath, await readFile(scriptPath(), "utf8"), "utf8");
    return target.filePath;
  });
}

/**
 * Where the shipped .gs file lives.
 *
 * A packaged build keeps it beside the app resources; in development it is
 * still in the repository.
 */
function scriptPath(): string {
  const packaged = join(process.resourcesPath, "appsscript", "Caulder.gs");
  if (existsSync(packaged)) return packaged;
  return join(app.getAppPath(), "resources", "appsscript", "Caulder.gs");
}

/* ---- The board and its stages ---- */

function registerBoardHandlers() {
  ipcMain.handle(CHANNELS.boardGet, (_event, companyId: unknown) =>
    buildBoard(getDatabase(), assertId(companyId, "company id")),
  );

  ipcMain.handle(CHANNELS.stagesCreate, (_event, companyId: unknown, raw: unknown) => {
    const input = stageInput.parse(raw);
    return createStage(
      getDatabase(),
      assertId(companyId, "company id"),
      input.name,
      input.kind,
    );
  });

  ipcMain.handle(CHANNELS.stagesRename, (_event, stageId: unknown, name: unknown) =>
    renameStage(
      getDatabase(),
      assertId(stageId, "stage id"),
      stageInput.shape.name.parse(name),
    ),
  );

  ipcMain.handle(CHANNELS.stagesSetKind, (_event, stageId: unknown, kind: unknown) =>
    setStageKind(
      getDatabase(),
      assertId(stageId, "stage id"),
      stageInput.shape.kind.parse(kind),
    ),
  );

  ipcMain.handle(CHANNELS.stagesMove, (_event, stageId: unknown, direction: unknown) => {
    if (direction !== -1 && direction !== 1) throw new Error("Move up or down.");
    return moveStage(getDatabase(), assertId(stageId, "stage id"), direction);
  });

  ipcMain.handle(CHANNELS.stagesDelete, (_event, stageId: unknown) =>
    deleteStage(getDatabase(), assertId(stageId, "stage id")),
  );
}

/* ---- Today and tasks ---- */

function registerTaskHandlers() {
  ipcMain.handle(CHANNELS.todayGet, (_event, companyId: unknown) =>
    buildToday(getDatabase(), assertId(companyId, "company id")),
  );

  ipcMain.handle(CHANNELS.tasksForLead, (_event, leadId: unknown) =>
    listTasksForLead(getDatabase(), assertId(leadId, "lead id")),
  );

  ipcMain.handle(CHANNELS.tasksCreate, (_event, companyId: unknown, raw: unknown) =>
    createTask(getDatabase(), assertId(companyId, "company id"), taskInput.parse(raw)),
  );

  ipcMain.handle(CHANNELS.tasksUpdate, (_event, id: unknown, raw: unknown) =>
    updateTask(getDatabase(), assertId(id, "task id"), taskInput.parse(raw)),
  );

  ipcMain.handle(CHANNELS.tasksComplete, (_event, id: unknown) =>
    completeTask(getDatabase(), assertId(id, "task id")),
  );

  ipcMain.handle(CHANNELS.tasksReopen, (_event, id: unknown) =>
    reopenTask(getDatabase(), assertId(id, "task id")),
  );

  ipcMain.handle(CHANNELS.tasksReschedule, (_event, id: unknown, dueOn: unknown) => {
    if (!isDay(dueOn)) throw new Error("Pick a date.");
    return rescheduleTask(getDatabase(), assertId(id, "task id"), dueOn);
  });

  ipcMain.handle(CHANNELS.tasksDelete, (_event, id: unknown) => {
    deleteTask(getDatabase(), assertId(id, "task id"));
  });
}

/* ---- Import ---- */

function registerImportHandlers() {
  ipcMain.handle(CHANNELS.importChoose, async () => {
    const picked = await dialog.showOpenDialog({
      title: "Choose a spreadsheet",
      properties: ["openFile"],
      filters: [{ name: "Spreadsheets", extensions: ["xlsx", "csv"] }],
    });
    if (picked.canceled || !picked.filePaths[0]) return null;

    const path = picked.filePaths[0];
    const type = extname(path).toLowerCase() === ".csv" ? "csv" : "xlsx";
    const sheet = await readSheet(await readFile(path), type);
    return registerFile(basename(path), type, sheet);
  });

  ipcMain.handle(CHANNELS.importPaste, async (_event, raw: unknown) => {
    if (typeof raw !== "string") throw new Error("Nothing was pasted.");
    // Bounded here as well as by the row cap: the text crosses the bridge
    // whole, and a cap on the rows it parses into is not a cap on its size.
    if (raw.length > MAX_BYTES) throw new Error("That is too much text to paste.");
    return registerFile("Pasted list", "csv", await readPasted(raw));
  });

  ipcMain.handle(
    CHANNELS.importPreview,
    (_event, companyId: unknown, fileId: unknown, mapping: unknown) =>
      previewFile(
        getDatabase(),
        assertId(companyId, "company id"),
        assertId(fileId, "file id"),
        (mapping ?? {}) as ColumnMapping,
      ),
  );

  ipcMain.handle(CHANNELS.importCommit, (_event, jobId: unknown, resolutions: unknown) =>
    commitImport(
      getDatabase(),
      assertId(jobId, "job id"),
      (resolutions ?? {}) as Record<number, Resolution>,
    ),
  );

  ipcMain.handle(CHANNELS.importBatches, (_event, companyId: unknown) =>
    listBatches(getDatabase(), assertId(companyId, "company id")),
  );

  ipcMain.handle(CHANNELS.importUndo, (_event, batchId: unknown) =>
    undoImport(getDatabase(), assertId(batchId, "batch id")),
  );

  ipcMain.handle(CHANNELS.importTemplate, async () => {
    const target = await dialog.showSaveDialog({
      title: "Save the import template",
      defaultPath: "Caulder lead template.xlsx",
      filters: [{ name: "Excel workbook", extensions: ["xlsx"] }],
    });
    if (target.canceled || !target.filePath) return null;

    await writeFile(target.filePath, await buildTemplate());
    return target.filePath;
  });
}

/**
 * The query object is built from UI state, so it is shaped rather than parsed
 * with Zod: stageId is meaningfully three-valued (a stage, explicitly no
 * stage, or no filter at all) and that distinction is easier to state here
 * than to encode in a schema.
 */
function parseQuery(raw: unknown): LeadQuery {
  const source = (raw ?? {}) as Record<string, unknown>;
  const query: LeadQuery = { companyId: assertId(source["companyId"], "company id") };

  if (typeof source["search"] === "string" && source["search"].trim().length > 0) {
    query.search = source["search"];
  }

  if (source["stageId"] === null) query.stageId = null;
  else if (typeof source["stageId"] === "string" && source["stageId"].length > 0) {
    query.stageId = source["stageId"];
  }

  if (
    typeof source["sort"] === "string" &&
    (LEAD_SORTS as readonly string[]).includes(source["sort"])
  ) {
    query.sort = source["sort"] as LeadSort;
  }

  if (source["direction"] === "asc" || source["direction"] === "desc") {
    query.direction = source["direction"];
  }

  return query;
}
