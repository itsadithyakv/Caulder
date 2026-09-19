import { app, BrowserWindow, clipboard, ipcMain } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { CHANNELS, type Workspace } from "@shared/ipc";
import { assertId, handle } from "./handle";
import { registerBrainHandlers } from "./brain";
import { registerDealHandlers } from "./deals";
import { registerCallHandlers } from "./calls";
import { registerAskHandlers, registerCostHandlers } from "./costs";
import { registerProductHandlers } from "./products";
import { registerDeadlineHandlers } from "./deadlines";
import { registerPeopleHandlers } from "./people";
import { registerMetricHandlers } from "./metrics";
import { registerShareHandlers } from "./share";
import { registerRoomHandlers } from "./dataroom";
import { registerLifeHandlers } from "./life";
import {
  ACCENT_IDS,
  GOAL_PERIODS,
  customFieldInput,
  LEAD_SORTS,
  RELATIONSHIPS,
  type Relationship,
  activityInput,
  companyInput,
  CURRENCIES,
  taskInput,
  type QuickInput,
  areaWordInput,
  stageInput,
  leadInput,
  blockInput,
  noteInput,
  type AccentId,
  type LeadQuery,
  type LeadSort,
  type GoogleState,
} from "@shared/domain";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { dialog } from "electron";
import { MAX_BYTES, type ColumnMapping, type Resolution } from "@shared/import";
import { isDay, isTime } from "@shared/dates";
import { buildToday } from "../services/today";
import { buildDay, buildWeek } from "../services/day";
import {
  createBlock,
  deleteBlock,
  endSeries,
  findBlock,
  moveBlock,
  setOutcome,
  updateBlock,
  updateSeries,
} from "../repositories/blocks";
import { createTerm, deleteTerm, listTerms } from "../repositories/terms";
import {
  createNote,
  deleteNote,
  listNotes,
  setNotePinned,
  updateNote,
} from "../repositories/notes";
import { captureState, closeCapture, setCaptureShortcut, wantedMode } from "../capture";
import { hello, syncNow, readSync, type Hello } from "../services/gsync";
import { autoSyncOn, nudgeSync, startSyncing } from "../services/scheduler";
import {
  encryptionAvailable,
  forgetConnection,
  isConnected,
  saveConnection,
} from "../services/credentials";
import { quickAdd } from "../services/quickadd";
import { addAreaWord, listAreaWords, removeAreaWord } from "../repositories/words";
import {
  followUpDays,
  logEmailSent,
  openMail,
  openWhatsApp,
  setFollowUpDays,
} from "../services/outreach";
import {
  acceptQuote,
  addPayment,
  addSpend as addSpendEntry,
  buildMoney,
  deleteInvoice,
  deletePayment,
  deleteQuote,
  deleteSpend as deleteSpendEntry,
  markPaid,
  moneyForLead,
  saveInvoice,
  saveQuote,
  setInvoiceStatus,
  setQuoteStatus,
} from "../repositories/money";
import { writeInvoicePdf } from "../services/invoice";
import {
  INVOICE_STATUSES,
  QUOTE_STATUSES,
  invoiceInput,
  paymentInput,
  quoteInput,
  spendEntryInput,
} from "@shared/domain";
import { buildBoard } from "../services/pipeline";
import { exportEverything } from "../services/export";
import { backupNow, listBackups, restoreBackup } from "../db/backup";
import { backupsDir, closeDatabase, databasePath, openDatabase } from "../db/connection";
import { shell } from "electron";
import { logProblem, logsDir } from "../log";
import {
  cancelEmail,
  forgetScript,
  mailState,
  rememberScript,
  scriptInfo,
  sendEmail,
  syncEmails,
} from "../services/mail";
import { listEmailsForLead } from "../repositories/mail";
import { checkScriptUrl, normaliseScriptKey } from "@shared/script";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  updateTemplate,
} from "../repositories/email";
import { templateInput } from "@shared/email";
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
  createField,
  deleteField,
  listFields,
  setValue,
  valuesFor,
} from "../repositories/workbench";
import { notificationsOn, resetNotified } from "../services/notify";
import {
  createLead,
  deleteLead,
  deleteMany,
  setStageForMany,
  findLead,
  listActivities,
  listLeads,
  logActivity,
  updateLead,
} from "../repositories/leads";
import { getDatabase } from "../db/connection";
import {
  archiveCompany,
  deleteCompany,
  createCompany,
  listCompanies,
  listStages,
  setCompanyGoal,
  setCompanyRemind,
  setCompanyCurrency,
  renameCompany,
  setCompanyAccent,
  homeCompanyId,
  withHome,
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
  let activeCompanyId = resolveActiveCompanyId(
    db,
    companies.map((c) => c.id),
  );
  // A personal workspace is you, not a company: with a company to choose, the
  // company screens show that instead of an empty list of your own contacts.
  const active = companies.find((c) => c.id === activeCompanyId);
  const firstCompany = companies.find((c) => c.kind !== "personal");
  if (active?.kind === "personal" && firstCompany) {
    activeCompanyId = firstCompany.id;
    setSetting(db, "activeCompanyId", firstCompany.id);
  }
  return { companies, activeCompanyId, homeCompanyId: homeCompanyId(db) };
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
export function savedCaptureShortcut(): string | null {
  // Raw: never set (null) and deliberately off ("") mean different things,
  // and popup.ts's shortcutToClaim tells them apart.
  return getSetting(getDatabase(), "captureShortcut");
}

/** Whether closing the main window leaves Caulder in the tray. Yes unless said. */
export function keepsInTray(): boolean {
  return getSetting(getDatabase(), "keepInTray") !== "0";
}

/**
 * True exactly once per install: the first time the window closes into the
 * tray, which is the moment to say where it went.
 */
export function firstTimeInTray(): boolean {
  const db = getDatabase();
  if (getSetting(db, "trayNoticed") === "1") return false;
  setSetting(db, "trayNoticed", "1");
  return true;
}

function alsoNudge<A extends unknown[], R>(run: (...args: A) => R) {
  return (...args: A): R => {
    const result = run(...args);
    // And Google, debounced. A task written here is meant to reach a phone,
    // and waiting for the next ten-minute tick is most of the way back to
    // pressing a button.
    nudgeSync();
    return result;
  };
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

  /** Every window control acts on the window that asked: the quick window has its own close. */
  const sender = (event: IpcMainEvent | IpcMainInvokeEvent) =>
    BrowserWindow.fromWebContents(event.sender);

  ipcMain.on(CHANNELS.windowMinimize, (event) => sender(event)?.minimize());

  ipcMain.on(CHANNELS.windowToggleMaximize, (event) => {
    const win = sender(event);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.on(CHANNELS.windowClose, (event) => sender(event)?.close());

  handle(CHANNELS.windowIsMaximized, (event) => sender(event)?.isMaximized() ?? false);

  handle(CHANNELS.notifyGet, () => notificationsOn());

  handle(CHANNELS.notifySet, (_event, on: unknown) => {
    setSetting(getDatabase(), "notify", on === true ? "1" : "0");
    // Turning it back on should be heard from today rather than tomorrow.
    resetNotified();
    return notificationsOn();
  });


  handle(CHANNELS.appVersion, () => app.getVersion());

  // A screen that failed to draw reports here, so the log has its stack.
  ipcMain.on(CHANNELS.appReportError, (_event, detail: unknown) => {
    if (typeof detail === "string") logProblem("screen", detail.slice(0, 8000));
  });

  /* ---- Companies ---- */

  handle(CHANNELS.companiesList, () => workspace());
  handle(CHANNELS.activeCompanyGet, () => workspace());

  handle(CHANNELS.companiesCreate, (_event, raw: unknown) => {
    const input = companyInput.parse(raw);
    const created = createCompany(getDatabase(), input);
    // A newly created company becomes the one you are looking at. Creating a
    // workspace and staying in the old one is never what was meant.
    setSetting(getDatabase(), "activeCompanyId", created.id);
    return workspace();
  });

  handle(CHANNELS.companiesRename, (_event, id: unknown, name: unknown) => {
    const clean = companyInput.shape.name.parse(name);
    renameCompany(getDatabase(), assertId(id, "company id"), clean);
    return workspace();
  });

  handle(CHANNELS.companiesSetAccent, (_event, id: unknown, accent: unknown) => {
    setCompanyAccent(getDatabase(), assertId(id, "company id"), assertAccent(accent));
    return workspace();
  });

  handle(CHANNELS.companiesArchive, (_event, id: unknown) => {
    archiveCompany(getDatabase(), assertId(id, "company id"));
    return workspace();
  });

  handle(CHANNELS.companiesDelete, (_event, id: unknown) => {
    deleteCompany(getDatabase(), assertId(id, "company id"));
    return workspace();
  });

  handle(CHANNELS.companiesSeedDemo, (_event, companyId: unknown) =>
    seedDemo(getDatabase(), assertId(companyId, "company id")),
  );

  handle(CHANNELS.companiesDemoBatch, (_event, companyId: unknown) =>
    findDemoBatch(getDatabase(), assertId(companyId, "company id")),
  );

  handle(CHANNELS.companiesStages, (_event, companyId: unknown) =>
    listStages(getDatabase(), assertId(companyId, "company id")),
  );

  handle(CHANNELS.activeCompanySet, (_event, id: unknown) => {
    setSetting(getDatabase(), "activeCompanyId", assertId(id, "company id"));
    return workspace();
  });

  /* ---- Leads ---- */

  handle(CHANNELS.leadsList, (_event, raw: unknown) =>
    listLeads(getDatabase(), parseQuery(raw)),
  );

  handle(CHANNELS.leadsFind, (_event, id: unknown) =>
    findLead(getDatabase(), assertId(id, "lead id")),
  );

  handle(CHANNELS.leadsCreate, (_event, companyId: unknown, raw: unknown) =>
    createLead(getDatabase(), assertId(companyId, "company id"), leadInput.parse(raw)),
  );

  handle(CHANNELS.leadsUpdate, (_event, id: unknown, raw: unknown) =>
    updateLead(getDatabase(), assertId(id, "lead id"), leadInput.parse(raw)),
  );

  handle(CHANNELS.leadsDelete, (_event, id: unknown) => {
    deleteLead(getDatabase(), assertId(id, "lead id"));
  });

  handle(
    CHANNELS.leadsSetStageMany,
    (_event, companyId: unknown, ids: unknown, stageId: unknown) =>
      setStageForMany(
        getDatabase(),
        assertId(companyId, "company id"),
        assertIds(ids),
        typeof stageId === "string" && stageId.length > 0 ? stageId : null,
      ),
  );

  handle(CHANNELS.leadsDeleteMany, (_event, companyId: unknown, ids: unknown) =>
    deleteMany(getDatabase(), assertId(companyId, "company id"), assertIds(ids)),
  );

  /* ---- Timeline ---- */

  handle(CHANNELS.activitiesList, (_event, leadId: unknown) =>
    listActivities(getDatabase(), assertId(leadId, "lead id")),
  );

  handle(CHANNELS.activitiesLog, (_event, raw: unknown) =>
    logActivity(getDatabase(), activityInput.parse(raw)),
  );

  registerImportHandlers();
  registerPersonalHandlers();
  registerTaskHandlers();
  registerBoardHandlers();
  registerTemplateHandlers();
  registerMoneyHandlers();
  registerBrainHandlers();
  registerRoomHandlers();
  registerLifeHandlers();
  registerDealHandlers();
  registerCallHandlers();
  registerCostHandlers();
  registerAskHandlers();
  registerProductHandlers();
  registerDeadlineHandlers();
  registerPeopleHandlers();
  registerMetricHandlers();
  registerShareHandlers();
  registerDataHandlers(getWindow);
}

/* ---- Money ---- */

/** Today, where this company is. */
function companyDay(companyId: string): string {
  const row = getDatabase()
    .prepare(`SELECT timezone FROM companies WHERE id = ?`)
    .get(companyId) as { timezone: string } | undefined;
  return todayIn(row?.timezone ?? "UTC");
}

function registerMoneyHandlers() {
  const company = (raw: unknown) => assertId(raw, "company id");
  const overview = (companyId: string) => buildMoney(getDatabase(), companyId);

  handle(CHANNELS.moneyGet, (_event, companyId: unknown) => overview(company(companyId)));

  handle(CHANNELS.moneyForLead, (_event, leadId: unknown) =>
    moneyForLead(getDatabase(), assertId(leadId, "lead id")),
  );

  handle(CHANNELS.quoteSave, (_event, companyId: unknown, id: unknown, raw: unknown) => {
    const companyId_ = company(companyId);
    saveQuote(getDatabase(), companyId_, id === null ? null : assertId(id, "quote id"), quoteInput.parse(raw));
    return overview(companyId_);
  });

  handle(CHANNELS.quoteStatus, (_event, companyId: unknown, id: unknown, status: unknown) => {
    const companyId_ = company(companyId);
    if (!(QUOTE_STATUSES as readonly string[]).includes(String(status))) {
      throw new Error("That is not a quote status.");
    }
    setQuoteStatus(getDatabase(), companyId_, assertId(id, "quote id"), status as (typeof QUOTE_STATUSES)[number]);
    return overview(companyId_);
  });

  handle(CHANNELS.quoteAccept, (_event, companyId: unknown, id: unknown) => {
    const companyId_ = company(companyId);
    acceptQuote(getDatabase(), companyId_, assertId(id, "quote id"));
    return overview(companyId_);
  });

  handle(CHANNELS.quoteDelete, (_event, companyId: unknown, id: unknown) => {
    const companyId_ = company(companyId);
    deleteQuote(getDatabase(), companyId_, assertId(id, "quote id"));
    return overview(companyId_);
  });

  handle(CHANNELS.invoiceSave, (_event, companyId: unknown, id: unknown, raw: unknown) => {
    const companyId_ = company(companyId);
    saveInvoice(getDatabase(), companyId_, id === null ? null : assertId(id, "invoice id"), invoiceInput.parse(raw));
    return overview(companyId_);
  });

  handle(CHANNELS.invoiceStatus, (_event, companyId: unknown, id: unknown, status: unknown) => {
    const companyId_ = company(companyId);
    if (!(INVOICE_STATUSES as readonly string[]).includes(String(status))) {
      throw new Error("That is not an invoice status.");
    }
    setInvoiceStatus(
      getDatabase(),
      companyId_,
      assertId(id, "invoice id"),
      status as (typeof INVOICE_STATUSES)[number],
    );
    return overview(companyId_);
  });

  handle(CHANNELS.invoiceMarkPaid, (_event, companyId: unknown, id: unknown) => {
    const companyId_ = company(companyId);
    markPaid(getDatabase(), companyId_, assertId(id, "invoice id"));
    return overview(companyId_);
  });

  handle(CHANNELS.invoicePdf, (_event, companyId: unknown, id: unknown) =>
    writeInvoicePdf(getDatabase(), company(companyId), assertId(id, "invoice id")),
  );

  handle(CHANNELS.invoiceDelete, (_event, companyId: unknown, id: unknown) => {
    const companyId_ = company(companyId);
    deleteInvoice(getDatabase(), companyId_, assertId(id, "invoice id"));
    return overview(companyId_);
  });

  handle(CHANNELS.paymentAdd, (_event, companyId: unknown, invoiceId: unknown, raw: unknown) => {
    const companyId_ = company(companyId);
    addPayment(getDatabase(), companyId_, assertId(invoiceId, "invoice id"), paymentInput.parse(raw));
    return overview(companyId_);
  });

  handle(CHANNELS.paymentDelete, (_event, companyId: unknown, id: unknown) => {
    const companyId_ = company(companyId);
    deletePayment(getDatabase(), companyId_, assertId(id, "payment id"));
    return overview(companyId_);
  });

  handle(CHANNELS.spendEntryAdd, (_event, companyId: unknown, raw: unknown) => {
    const companyId_ = company(companyId);
    addSpendEntry(getDatabase(), companyId_, spendEntryInput.parse(raw));
    return overview(companyId_);
  });

  handle(CHANNELS.spendEntryDelete, (_event, companyId: unknown, id: unknown) => {
    const companyId_ = company(companyId);
    deleteSpendEntry(getDatabase(), companyId_, assertId(id, "spend id"));
    return overview(companyId_);
  });
}

/* ---- Backup, restore and export ---- */

function registerDataHandlers(getWindow: () => BrowserWindow | null) {
  handle(CHANNELS.dataBackups, () => listBackups());

  handle(CHANNELS.dataBackupNow, () => backupNow());

  handle(CHANNELS.dataPaths, () => ({
    database: databasePath(),
    backups: backupsDir(),
    logs: logsDir(),
  }));

  // A name, not a path: `openPath` runs a program as readily as it opens a
  // folder, so the window only ever says which of Caulder's own folders.
  handle(CHANNELS.dataRevealFolder, async (_event, which: unknown) => {
    const folder =
      which === "backups"
        ? backupsDir()
        : which === "logs"
          ? logsDir()
          : which === "database"
            ? dirname(databasePath())
            : null;
    if (!folder) throw new Error("Caulder does not have a folder by that name.");
    mkdirSync(folder, { recursive: true });
    const failure = await shell.openPath(folder);
    if (failure) throw new Error(failure);
  });

  /**
   * Restoring replaces the live database, so the window is reloaded rather
   * than left holding state from the file that has just been swapped out.
   * Everything on screen — the open lead, the board, the cached workspace —
   * describes data that no longer exists.
   */
  handle(CHANNELS.dataRestore, (_event, name: unknown) => {
    const result = restoreBackup(
      assertId(name, "backup name"),
      closeDatabase,
      openDatabase,
    );
    // The reload is what discards the screen's now-stale state. It happens
    // after the reply so the caller learns where the safety copy went.
    setTimeout(() => getWindow()?.reload(), 50);
    return result;
  });

  handle(CHANNELS.dataExportAll, async (_event, companyId: unknown) => {
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
function registerPersonalHandlers() {
  const blockOr = (id: string) => {
    const block = findBlock(getDatabase(), id);
    if (!block) throw new Error("That block no longer exists.");
    return block;
  };

  handle(CHANNELS.dayGet, (_event, companyId: unknown, day: unknown) => {
    if (!isDay(day)) throw new Error("That is not a day.");
    return buildDay(getDatabase(), withHome(getDatabase(), assertId(companyId, "company id")), day);
  });

  handle(CHANNELS.weekGet, (_event, companyId: unknown, day: unknown) => {
    if (!isDay(day)) throw new Error("That is not a day.");
    return buildWeek(getDatabase(), withHome(getDatabase(), assertId(companyId, "company id")), day);
  });

  handle(CHANNELS.blocksCreate, (_event, companyId: unknown, raw: unknown) => {
    const id = assertId(companyId, "company id");
    const input = blockInput.parse(raw);
    createBlock(getDatabase(), id, input);
    return buildDay(getDatabase(), withHome(getDatabase(), id), input.day);
  });

  handle(CHANNELS.blocksUpdate, (_event, id: unknown, raw: unknown) => {
    const blockId = assertId(id, "block id");
    const before = blockOr(blockId);
    const input = blockInput.parse(raw);
    updateBlock(getDatabase(), blockId, input);
    return buildDay(getDatabase(), withHome(getDatabase(), before.companyId), input.day);
  });

  handle(CHANNELS.blocksMove, (_event, id: unknown, where: unknown) => {
    const blockId = assertId(id, "block id");
    const before = blockOr(blockId);

    const target = where as { day?: unknown; startsAt?: unknown; minutes?: unknown };
    if (!isDay(target.day)) throw new Error("That is not a day.");
    if (!isTime(target.startsAt)) throw new Error("That is not a time.");
    const minutes = Number(target.minutes);
    if (!Number.isFinite(minutes) || minutes < 5) throw new Error("That is too short.");

    moveBlock(getDatabase(), blockId, {
      day: target.day,
      startsAt: target.startsAt,
      minutes: Math.round(minutes),
    });
    return buildDay(getDatabase(), withHome(getDatabase(), before.companyId), target.day);
  });

  handle(
    CHANNELS.blocksDelete,
    (_event, id: unknown, companyId: unknown, day: unknown) => {
      if (!isDay(day)) throw new Error("That is not a day.");
      deleteBlock(getDatabase(), assertId(id, "block id"));
      return buildDay(getDatabase(), withHome(getDatabase(), assertId(companyId, "company id")), day);
    },
  );

  handle(
    CHANNELS.blocksEndSeries,
    (_event, seriesId: unknown, companyId: unknown, day: unknown) => {
      if (!isDay(day)) throw new Error("That is not a day.");
      endSeries(getDatabase(), assertId(seriesId, "series id"), day);
      return buildDay(getDatabase(), withHome(getDatabase(), assertId(companyId, "company id")), day);
    },
  );

  handle(
    CHANNELS.blocksOutcome,
    (_event, id: unknown, outcome: unknown, companyId: unknown, day: unknown) => {
      if (!isDay(day)) throw new Error("That is not a day.");
      const value =
        outcome === "skipped" || outcome === "moved" ? (outcome as string) : null;
      setOutcome(getDatabase(), assertId(id, "block id"), value);
      return buildDay(getDatabase(), withHome(getDatabase(), assertId(companyId, "company id")), day);
    },
  );

  handle(
    CHANNELS.blocksUpdateSeries,
    (_event, seriesId: unknown, companyId: unknown, day: unknown, raw: unknown) => {
      if (!isDay(day)) throw new Error("That is not a day.");
      const change = raw as {
        title?: unknown;
        startsAt?: unknown;
        minutes?: unknown;
        kind?: unknown;
      };
      if (typeof change.title !== "string" || change.title.trim().length === 0) {
        throw new Error("Give the block a name.");
      }
      if (!isTime(change.startsAt)) throw new Error("That is not a time.");
      const minutes = Number(change.minutes);
      if (!Number.isFinite(minutes) || minutes < 5) throw new Error("That is too short.");

      updateSeries(getDatabase(), assertId(seriesId, "series id"), day, {
        title: change.title.trim().slice(0, 200),
        startsAt: change.startsAt,
        minutes: Math.round(minutes),
        kind: typeof change.kind === "string" && change.kind.length > 0 ? change.kind : null,
      });
      return buildDay(getDatabase(), withHome(getDatabase(), assertId(companyId, "company id")), day);
    },
  );

  handle(
    CHANNELS.blocksSetHabit,
    (_event, seriesId: unknown, isHabit: unknown, companyId: unknown, day: unknown) => {
      if (!isDay(day)) throw new Error("That is not a day.");
      getDatabase()
        .prepare(`UPDATE block_series SET is_habit = ? WHERE id = ?`)
        .run(isHabit === true ? 1 : 0, assertId(seriesId, "series id"));
      return buildDay(getDatabase(), withHome(getDatabase(), assertId(companyId, "company id")), day);
    },
  );

  /* ---- Terms ---- */

  handle(CHANNELS.termsList, (_event, companyId: unknown) =>
    listTerms(getDatabase(), assertId(companyId, "company id")),
  );

  handle(CHANNELS.termsCreate, (_event, companyId: unknown, raw: unknown) => {
    const id = assertId(companyId, "company id");
    const input = raw as { name?: unknown; fromDay?: unknown; untilDay?: unknown };
    if (typeof input.name !== "string" || input.name.trim().length === 0) {
      throw new Error("Give the term a name.");
    }
    if (!isDay(input.fromDay) || !isDay(input.untilDay)) {
      throw new Error("A term needs a first and a last day.");
    }
    if (input.untilDay < input.fromDay) throw new Error("It ends before it starts.");

    createTerm(getDatabase(), id, {
      name: input.name.trim().slice(0, 80),
      fromDay: input.fromDay,
      untilDay: input.untilDay,
    });
    return listTerms(getDatabase(), id);
  });

  handle(CHANNELS.termsDelete, (_event, id: unknown, companyId: unknown) => {
    deleteTerm(getDatabase(), assertId(id, "term id"));
    return listTerms(getDatabase(), assertId(companyId, "company id"));
  });

  /* ---- Notes ---- */

  handle(CHANNELS.notesList, (_event, companyId: unknown, search: unknown) =>
    listNotes(
      getDatabase(),
      assertId(companyId, "company id"),
      typeof search === "string" ? search : "",
    ),
  );

  handle(CHANNELS.notesCreate, (_event, companyId: unknown, raw: unknown) => {
    const id = assertId(companyId, "company id");
    const { body } = noteInput.parse({ body: raw });
    createNote(getDatabase(), id, body, companyDay(id));
    return listNotes(getDatabase(), id);
  });

  handle(
    CHANNELS.notesUpdate,
    (_event, id: unknown, raw: unknown, companyId: unknown) => {
      const { body } = noteInput.parse({ body: raw });
      updateNote(getDatabase(), assertId(id, "note id"), body);
      return listNotes(getDatabase(), assertId(companyId, "company id"));
    },
  );

  handle(
    CHANNELS.notesPin,
    (_event, id: unknown, pinned: unknown, companyId: unknown) => {
      setNotePinned(getDatabase(), assertId(id, "note id"), pinned === true);
      return listNotes(getDatabase(), assertId(companyId, "company id"));
    },
  );

  handle(CHANNELS.notesDelete, (_event, id: unknown, companyId: unknown) => {
    deleteNote(getDatabase(), assertId(id, "note id"));
    return listNotes(getDatabase(), assertId(companyId, "company id"));
  });

  /* ---- The Google link ---- */

  /**
   * What is stored, without asking Google anything.
   *
   * Settings has to be able to open with the network down, and a card that
   * blocks on an HTTPS call before it will draw is a card that makes the whole
   * screen feel broken when Google is slow.
   */
  const googleState = (companyId: string, lists?: Hello): GoogleState => {
    const db = getDatabase();
    const row = db
      .prepare(`SELECT google_calendar_id, google_tasklist_id FROM companies WHERE id = ?`)
      .get(companyId) as
      | { google_calendar_id: string | null; google_tasklist_id: string | null }
      | undefined;

    return {
      connected: isConnected(),
      canStore: encryptionAvailable(),
      account: lists?.email ?? null,
      calendars: lists?.calendars ?? [],
      taskLists: lists?.taskLists ?? [],
      calendarId: row?.google_calendar_id ?? null,
      taskListId: row?.google_tasklist_id ?? null,
      auto: autoSyncOn(),
      sync: readSync(db, companyId),
      script: scriptInfo(db),
    };
  };

  handle(CHANNELS.googleState, (_event, companyId: unknown) =>
    googleState(assertId(companyId, "company id")),
  );

  handle(CHANNELS.googleRefresh, async (_event, companyId: unknown) => {
    const id = assertId(companyId, "company id");
    if (!isConnected()) return googleState(id);
    const said = await hello();
    rememberScript(getDatabase(), said);
    return googleState(id, said);
  });

  handle(
    CHANNELS.googleConnect,
    async (_event, companyId: unknown, url: unknown, secret: unknown) => {
      const id = assertId(companyId, "company id");
      const address = typeof url === "string" ? url.trim() : "";
      const key = typeof secret === "string" ? normaliseScriptKey(secret) : "";

      const wrong = checkScriptUrl(address);
      if (wrong) throw new Error(wrong);
      if (key.length === 0) throw new Error("Paste the key that setUp printed.");

      // Stored only once it has been proved to work. Keeping a URL and key
      // that do not answer would turn a mistake made now into a sync that
      // silently never runs later.
      saveConnection({ url: address, secret: key });
      try {
        const lists = await hello();
        rememberScript(getDatabase(), lists);
        return googleState(id, lists);
      } catch (error) {
        forgetConnection();
        throw error;
      }
    },
  );

  handle(CHANNELS.googleDisconnect, (_event, companyId: unknown) => {
    const id = assertId(companyId, "company id");
    forgetConnection();
    forgetScript(getDatabase());
    getDatabase()
      .prepare(
        `UPDATE companies SET google_calendar_id = NULL, google_tasklist_id = NULL WHERE id = ?`,
      )
      .run(id);
    startSyncing();
    return googleState(id);
  });

  handle(
    CHANNELS.googleChoose,
    (_event, companyId: unknown, calendarId: unknown, taskListId: unknown) => {
      const id = assertId(companyId, "company id");
      const calendar =
        typeof calendarId === "string" && calendarId.length > 0 ? calendarId : null;
      const list = typeof taskListId === "string" && taskListId.length > 0 ? taskListId : null;

      // Two workspaces pointed at one calendar is not a smaller version of
      // working - it is a loop. Each would see the other's blocks as somebody
      // else's events, adopt them, push the copies back, and adopt those in
      // turn. Refused rather than warned about, because by the time it is
      // visible there are already four of everything.
      const clash = getDatabase()
        .prepare(
          `SELECT name FROM companies
            WHERE id != ? AND is_archived = 0
              AND ((? IS NOT NULL AND google_calendar_id = ?)
                OR (? IS NOT NULL AND google_tasklist_id = ?))
            LIMIT 1`,
        )
        .get(id, calendar, calendar, list, list) as { name: string } | undefined;

      if (clash) {
        throw new Error(
          `"${clash.name}" already syncs with that calendar or list. Two workspaces sharing one would copy each other's items back and forth.`,
        );
      }

      getDatabase()
        .prepare(
          `UPDATE companies SET google_calendar_id = ?, google_tasklist_id = ? WHERE id = ?`,
        )
        .run(calendar, list, id);
      startSyncing();
      return googleState(id);
    },
  );

  handle(CHANNELS.googleSync, async (_event, companyId: unknown) => {
    const id = assertId(companyId, "company id");
    await syncNow(getDatabase(), id);
    return googleState(id);
  });

  handle(CHANNELS.googleAuto, (_event, companyId: unknown, on: unknown) => {
    const id = assertId(companyId, "company id");
    setSetting(getDatabase(), "googleAuto", on === true ? "1" : "0");
    startSyncing();
    return googleState(id);
  });

  /* ---- Quick capture ---- */

  // The key as it actually stands, not as it was stored: a default claimed on
  // launch may have been refused because another app got there first.
  handle(CHANNELS.captureGet, () => captureState());

  handle(CHANNELS.captureWhich, () => wantedMode());

  handle(CHANNELS.trayKeep, () => keepsInTray());

  handle(CHANNELS.traySetKeep, (_event, on: unknown) => {
    setSetting(getDatabase(), "keepInTray", on === false ? "0" : "1");
  });

  handle(CHANNELS.captureSet, (_event, accelerator: unknown) => {
    const wanted = typeof accelerator === "string" ? accelerator.trim() : "";
    const outcome = setCaptureShortcut(wanted);
    // Stored only once it is actually held. Remembering a combination we were
    // refused would mean claiming it again, and failing again, every launch.
    if (outcome.ok) setSetting(getDatabase(), "captureShortcut", wanted);
    return outcome.ok ? { ok: true } : { ok: false, reason: outcome.reason };
  });

  handle(CHANNELS.captureSave, (_event, raw: unknown) => {
    const { body } = noteInput.parse({ body: raw });
    const db = getDatabase();
    // Whichever workspace is active: the capture window has no screen of its
    // own on which to have chosen one.
    const active = resolveActiveCompanyId(
      db,
      listCompanies(db).map((company) => company.id),
    );
    if (!active) throw new Error("There is no workspace to write to yet.");
    createNote(db, active, body, companyDay(active));
    closeCapture();
  });

  handle(CHANNELS.captureClose, () => closeCapture());
}

function registerTemplateHandlers() {
  handle(CHANNELS.templatesList, (_event, companyId: unknown) =>
    listTemplates(getDatabase(), assertId(companyId, "company id")),
  );

  handle(CHANNELS.templatesCreate, (_event, companyId: unknown, raw: unknown) =>
    createTemplate(
      getDatabase(),
      assertId(companyId, "company id"),
      templateInput.parse(raw),
    ),
  );

  handle(CHANNELS.templatesUpdate, (_event, id: unknown, raw: unknown) =>
    updateTemplate(getDatabase(), assertId(id, "template id"), templateInput.parse(raw)),
  );

  handle(CHANNELS.templatesDelete, (_event, id: unknown) =>
    deleteTemplate(getDatabase(), assertId(id, "template id")),
  );

  handle(CHANNELS.googleCopyScript, async () => {
    clipboard.writeText(await readFile(scriptPath(), "utf8"));
  });

  /* ---- Email through the script ---- */

  handle(CHANNELS.mailState, () => mailState(getDatabase()));

  handle(CHANNELS.mailForLead, (_event, leadId: unknown) =>
    listEmailsForLead(getDatabase(), assertId(leadId, "contact id")),
  );

  // The schema is parsed in the service, which is also where the contact's
  // own address is read: the renderer never supplies one.
  handle(CHANNELS.mailSend, (_event, input: unknown) => sendEmail(getDatabase(), input));

  handle(CHANNELS.mailCancel, (_event, emailId: unknown) =>
    cancelEmail(getDatabase(), assertId(emailId, "email id")),
  );

  handle(CHANNELS.mailCheck, async (_event, leadId: unknown) => {
    const id = assertId(leadId, "contact id");
    await syncEmails(getDatabase());
    return listEmailsForLead(getDatabase(), id);
  });

  handle(CHANNELS.googleScript, async () => {
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
  handle(CHANNELS.boardGet, (_event, companyId: unknown) =>
    buildBoard(getDatabase(), assertId(companyId, "company id")),
  );

  handle(CHANNELS.stagesCreate, (_event, companyId: unknown, raw: unknown) => {
    const input = stageInput.parse(raw);
    return createStage(
      getDatabase(),
      assertId(companyId, "company id"),
      input.name,
      input.kind,
    );
  });

  handle(CHANNELS.stagesRename, (_event, stageId: unknown, name: unknown) =>
    renameStage(
      getDatabase(),
      assertId(stageId, "stage id"),
      stageInput.shape.name.parse(name),
    ),
  );

  handle(CHANNELS.stagesSetKind, (_event, stageId: unknown, kind: unknown) =>
    setStageKind(
      getDatabase(),
      assertId(stageId, "stage id"),
      stageInput.shape.kind.parse(kind),
    ),
  );

  handle(CHANNELS.stagesMove, (_event, stageId: unknown, direction: unknown) => {
    if (direction !== -1 && direction !== 1) throw new Error("Move up or down.");
    return moveStage(getDatabase(), assertId(stageId, "stage id"), direction);
  });

  handle(CHANNELS.stagesDelete, (_event, stageId: unknown) =>
    deleteStage(getDatabase(), assertId(stageId, "stage id")),
  );
}

/* ---- Today and tasks ---- */

function registerTaskHandlers() {
  handle(CHANNELS.companiesSetGoal, (_event, id: unknown, raw: unknown) => {
    const goal = raw as { value?: unknown; period?: unknown } | null;
    const value = typeof goal?.value === "number" && Number.isFinite(goal.value)
      ? Math.max(0, Math.round(goal.value))
      : null;
    const period =
      typeof goal?.period === "string" && (GOAL_PERIODS as readonly string[]).includes(goal.period)
        ? goal.period
        : null;

    setCompanyGoal(
      getDatabase(),
      assertId(id, "company id"),
      value === null || period === null ? null : { value, period },
    );
    return workspace();
  });

  handle(CHANNELS.companiesSetRemind, (_event, id: unknown, raw: unknown) => {
    // Anything that is not a usable lead time is "off" rather than an error.
    // The only two answers this setting has are a number of minutes and
    // nothing at all, and a third would have to mean something.
    const minutes =
      typeof raw === "number" && Number.isFinite(raw) && raw >= 0
        ? Math.min(24 * 60, Math.round(raw))
        : null;
    setCompanyRemind(getDatabase(), assertId(id, "company id"), minutes);
    return workspace();
  });

  /* ---- The workbench: files, fields ---- */

  handle(CHANNELS.fieldsList, (_event, companyId: unknown) =>
    listFields(getDatabase(), assertId(companyId, "company id")),
  );

  handle(CHANNELS.fieldsCreate, (_event, companyId: unknown, raw: unknown) =>
    createField(getDatabase(), assertId(companyId, "company id"), customFieldInput.parse(raw)),
  );

  handle(CHANNELS.fieldsDelete, (_event, companyId: unknown, id: unknown) =>
    deleteField(getDatabase(), assertId(companyId, "company id"), assertId(id, "field id")),
  );

  handle(CHANNELS.fieldValuesGet, (_event, leadId: unknown) =>
    valuesFor(getDatabase(), assertId(leadId, "lead id")),
  );

  handle(
    CHANNELS.fieldValueSet,
    (_event, leadId: unknown, fieldId: unknown, value: unknown) => {
      const lead = assertId(leadId, "lead id");
      setValue(
        getDatabase(),
        lead,
        assertId(fieldId, "field id"),
        typeof value === "string" ? value.slice(0, 2000) : "",
      );
      return valuesFor(getDatabase(), lead);
    },
  );

  handle(CHANNELS.todayGet, (_event, companyId: unknown) =>
    buildToday(getDatabase(), withHome(getDatabase(), assertId(companyId, "company id"))),
  );

  handle(CHANNELS.companiesSetCurrency, (_event, companyId: unknown, raw: unknown) => {
    // An unknown code is refused rather than stored: the whole value of the
    // field is that a total is a total of one thing.
    if (!(CURRENCIES as readonly string[]).includes(String(raw))) {
      throw new Error("That is not a currency Caulder knows about.");
    }
    setCompanyCurrency(getDatabase(), assertId(companyId, "company id"), String(raw));
    return workspace();
  });

  handle(CHANNELS.outreachEmail, (_event, leadId: unknown, subject: unknown, body: unknown) => {
    openMail(getDatabase(), assertId(leadId, "lead id"), String(subject ?? ""), String(body ?? ""));
  });

  handle(CHANNELS.outreachEmailSent, (_event, leadId: unknown, subject: unknown, body: unknown) => {
    logEmailSent(getDatabase(), assertId(leadId, "lead id"), String(subject ?? ""), String(body ?? ""));
  });

  handle(CHANNELS.outreachFollowUpDays, () => followUpDays(getDatabase()));

  handle(CHANNELS.outreachSetFollowUpDays, (_event, days: unknown) =>
    setFollowUpDays(getDatabase(), Number(days)),
  );

  handle(CHANNELS.outreachWhatsApp, (_event, leadId: unknown, message: unknown) => {
    openWhatsApp(
      getDatabase(),
      assertId(leadId, "lead id"),
      typeof message === "string" ? message.slice(0, 2000) : "",
    );
  });

  handle(CHANNELS.tasksForLead, (_event, leadId: unknown) =>
    listTasksForLead(getDatabase(), assertId(leadId, "lead id")),
  );

  handle(
    CHANNELS.tasksCreate,
    alsoNudge((_event, companyId: unknown, raw: unknown) =>
      createTask(getDatabase(), assertId(companyId, "company id"), taskInput.parse(raw)),
    ),
  );

  handle(
    CHANNELS.tasksQuick,
    alsoNudge((_event, companyId: unknown, raw: unknown) =>
      quickAdd(getDatabase(), assertId(companyId, "company id"), raw as QuickInput),
    ),
  );

  handle(CHANNELS.wordsList, () => listAreaWords(getDatabase()));

  handle(CHANNELS.wordsAdd, (_event, raw: unknown) => {
    const parsed = areaWordInput.safeParse(raw);
    // The schema's own sentence, not zod's: "Keep it under 40 characters"
    // is an answer, "String must contain at most 40 character(s)" is not.
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "That word will not do.");
    return addAreaWord(getDatabase(), parsed.data);
  });

  handle(CHANNELS.wordsRemove, (_event, id: unknown) =>
    removeAreaWord(getDatabase(), assertId(id, "word id")),
  );

  handle(
    CHANNELS.tasksUpdate,
    alsoNudge((_event, id: unknown, raw: unknown) =>
      updateTask(getDatabase(), assertId(id, "task id"), taskInput.parse(raw)),
    ),
  );

  handle(
    CHANNELS.tasksComplete,
    alsoNudge((_event, id: unknown) => completeTask(getDatabase(), assertId(id, "task id"))),
  );

  handle(
    CHANNELS.tasksReopen,
    alsoNudge((_event, id: unknown) => reopenTask(getDatabase(), assertId(id, "task id"))),
  );

  handle(
    CHANNELS.tasksReschedule,
    alsoNudge((_event, id: unknown, dueOn: unknown) => {
      if (!isDay(dueOn)) throw new Error("Pick a date.");
      return rescheduleTask(getDatabase(), assertId(id, "task id"), dueOn);
    }),
  );

  handle(
    CHANNELS.tasksDelete,
    alsoNudge((_event, id: unknown) => {
      deleteTask(getDatabase(), assertId(id, "task id"));
    }),
  );
}

/* ---- Import ---- */

function registerImportHandlers() {
  handle(CHANNELS.importChoose, async () => {
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

  handle(CHANNELS.importPaste, async (_event, raw: unknown) => {
    if (typeof raw !== "string") throw new Error("Nothing was pasted.");
    // Bounded here as well as by the row cap: the text crosses the bridge
    // whole, and a cap on the rows it parses into is not a cap on its size.
    if (raw.length > MAX_BYTES) throw new Error("That is too much text to paste.");
    return registerFile("Pasted list", "csv", await readPasted(raw));
  });

  handle(
    CHANNELS.importPreview,
    (_event, companyId: unknown, fileId: unknown, mapping: unknown) =>
      previewFile(
        getDatabase(),
        assertId(companyId, "company id"),
        assertId(fileId, "file id"),
        (mapping ?? {}) as ColumnMapping,
      ),
  );

  handle(
    CHANNELS.importCommit,
    (_event, jobId: unknown, resolutions: unknown, campaignId: unknown) =>
      commitImport(
        getDatabase(),
        assertId(jobId, "job id"),
        (resolutions ?? {}) as Record<number, Resolution>,
        typeof campaignId === "string" && campaignId.length > 0 ? campaignId : null,
      ),
  );

  handle(CHANNELS.importBatches, (_event, companyId: unknown) =>
    listBatches(getDatabase(), assertId(companyId, "company id")),
  );

  handle(CHANNELS.importUndo, (_event, batchId: unknown) =>
    undoImport(getDatabase(), assertId(batchId, "batch id")),
  );

  handle(CHANNELS.importTemplate, async () => {
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
    typeof source["relationship"] === "string" &&
    (RELATIONSHIPS as readonly string[]).includes(source["relationship"])
  ) {
    query.relationship = source["relationship"] as Relationship;
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
