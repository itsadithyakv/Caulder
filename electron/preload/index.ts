import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS, type CaulderApi } from "@shared/ipc";
import { ipcMessage } from "@shared/errors";

/**
 * `ipcRenderer.invoke`, minus the wrapper Electron puts round a failure.
 *
 * Every call below goes through this, so every `catch` in the window gets the
 * sentence main threw - not "Error invoking remote method 'x': Error: ..." in
 * front of it.
 */
const invoke = (channel: string, ...args: unknown[]): ReturnType<typeof ipcRenderer.invoke> =>
  ipcRenderer.invoke(channel, ...args).catch((error: unknown) => {
    throw new Error(ipcMessage(error instanceof Error ? error.message : String(error)));
  });

/**
 * The only surface the renderer gets. Context isolation is on and
 * nodeIntegration is off, so this file is the complete list of things the UI
 * can ask the main process to do.
 */
const api: CaulderApi = {
  window: {
    minimize: () => ipcRenderer.send(CHANNELS.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(CHANNELS.windowToggleMaximize),
    close: () => ipcRenderer.send(CHANNELS.windowClose),
    isMaximized: () => invoke(CHANNELS.windowIsMaximized),
    notifications: () => invoke(CHANNELS.notifyGet),
    setNotifications: (on: boolean) => invoke(CHANNELS.notifySet, on),
  },
  app: {
    version: () => invoke(CHANNELS.appVersion),
  },
  companies: {
    setCurrency: (id, currency) => invoke(CHANNELS.companiesSetCurrency, id, currency),
    list: () => invoke(CHANNELS.companiesList),
    create: (input) => invoke(CHANNELS.companiesCreate, input),
    rename: (id, name) => invoke(CHANNELS.companiesRename, id, name),
    setAccent: (id, accent) => invoke(CHANNELS.companiesSetAccent, id, accent),
    archive: (id) => invoke(CHANNELS.companiesArchive, id),
    setGoal: (id, goal) => invoke(CHANNELS.companiesSetGoal, id, goal),
    setRemind: (id, minutes) => invoke(CHANNELS.companiesSetRemind, id, minutes),
    remove: (id) => invoke(CHANNELS.companiesDelete, id),
    seedDemo: (companyId) => invoke(CHANNELS.companiesSeedDemo, companyId),
    demoBatch: (companyId) => invoke(CHANNELS.companiesDemoBatch, companyId),
    stages: (companyId) => invoke(CHANNELS.companiesStages, companyId),
    setActive: (id) => invoke(CHANNELS.activeCompanySet, id),
  },
  leads: {
    list: (query) => invoke(CHANNELS.leadsList, query),
    find: (id) => invoke(CHANNELS.leadsFind, id),
    create: (companyId, input) =>
      invoke(CHANNELS.leadsCreate, companyId, input),
    update: (id, input) => invoke(CHANNELS.leadsUpdate, id, input),
    setStage: (id, stageId) => invoke(CHANNELS.leadsSetStage, id, stageId),
    setLossReason: (id, reason) =>
      invoke(CHANNELS.leadsSetLossReason, id, reason),
    remove: (id) => invoke(CHANNELS.leadsDelete, id),
    setStageMany: (companyId, ids, stageId) =>
      invoke(CHANNELS.leadsSetStageMany, companyId, ids, stageId),
    removeMany: (companyId, ids) =>
      invoke(CHANNELS.leadsDeleteMany, companyId, ids),
  },
  activities: {
    list: (leadId) => invoke(CHANNELS.activitiesList, leadId),
    log: (input) => invoke(CHANNELS.activitiesLog, input),
  },
  imports: {
    choose: () => invoke(CHANNELS.importChoose),
    paste: (text) => invoke(CHANNELS.importPaste, text),
    preview: (companyId, fileId, mapping) =>
      invoke(CHANNELS.importPreview, companyId, fileId, mapping),
    commit: (jobId, resolutions, campaignId) =>
      invoke(CHANNELS.importCommit, jobId, resolutions, campaignId),
    batches: (companyId) => invoke(CHANNELS.importBatches, companyId),
    undo: (batchId) => invoke(CHANNELS.importUndo, batchId),
    template: () => invoke(CHANNELS.importTemplate),
  },
  attachments: {
    list: (leadId) => invoke(CHANNELS.attachmentsList, leadId),
    add: (companyId, leadId) => invoke(CHANNELS.attachmentsAdd, companyId, leadId),
    open: (id) => invoke(CHANNELS.attachmentsOpen, id),
    remove: (id) => invoke(CHANNELS.attachmentsRemove, id),
  },
  fields: {
    list: (companyId) => invoke(CHANNELS.fieldsList, companyId),
    create: (companyId, input) => invoke(CHANNELS.fieldsCreate, companyId, input),
    remove: (companyId, id) => invoke(CHANNELS.fieldsDelete, companyId, id),
    values: (leadId) => invoke(CHANNELS.fieldValuesGet, leadId),
    setValue: (leadId, fieldId, value) =>
      invoke(CHANNELS.fieldValueSet, leadId, fieldId, value),
  },
  money: {
    get: (companyId) => invoke(CHANNELS.moneyGet, companyId),
    forLead: (leadId) => invoke(CHANNELS.moneyForLead, leadId),
    saveQuote: (companyId, id, input) => invoke(CHANNELS.quoteSave, companyId, id, input),
    setQuoteStatus: (companyId, id, status) =>
      invoke(CHANNELS.quoteStatus, companyId, id, status),
    acceptQuote: (companyId, id) => invoke(CHANNELS.quoteAccept, companyId, id),
    deleteQuote: (companyId, id) => invoke(CHANNELS.quoteDelete, companyId, id),
    saveInvoice: (companyId, id, input) => invoke(CHANNELS.invoiceSave, companyId, id, input),
    setInvoiceStatus: (companyId, id, status) =>
      invoke(CHANNELS.invoiceStatus, companyId, id, status),
    markPaid: (companyId, id) => invoke(CHANNELS.invoiceMarkPaid, companyId, id),
    invoicePdf: (companyId, id) => invoke(CHANNELS.invoicePdf, companyId, id),
    deleteInvoice: (companyId, id) => invoke(CHANNELS.invoiceDelete, companyId, id),
    addPayment: (companyId, invoiceId, input) =>
      invoke(CHANNELS.paymentAdd, companyId, invoiceId, input),
    deletePayment: (companyId, id) => invoke(CHANNELS.paymentDelete, companyId, id),
    addSpend: (companyId, input) => invoke(CHANNELS.spendEntryAdd, companyId, input),
    deleteSpend: (companyId, id) => invoke(CHANNELS.spendEntryDelete, companyId, id),
  },
  outreach: {
    whatsapp: (leadId, message) => invoke(CHANNELS.outreachWhatsApp, leadId, message),
    email: (leadId, subject, body) => invoke(CHANNELS.outreachEmail, leadId, subject, body),
    emailSent: (leadId, subject, body) =>
      invoke(CHANNELS.outreachEmailSent, leadId, subject, body),
    followUpDays: () => invoke(CHANNELS.outreachFollowUpDays),
    setFollowUpDays: (days) => invoke(CHANNELS.outreachSetFollowUpDays, days),
  },
  today: {
    get: (companyId) => invoke(CHANNELS.todayGet, companyId),
  },
  day: {
    get: (companyId, day) => invoke(CHANNELS.dayGet, companyId, day),
    week: (companyId, day) => invoke(CHANNELS.weekGet, companyId, day),
    createBlock: (companyId, input) =>
      invoke(CHANNELS.blocksCreate, companyId, input),
    updateBlock: (id, input) => invoke(CHANNELS.blocksUpdate, id, input),
    moveBlock: (id, where) => invoke(CHANNELS.blocksMove, id, where),
    deleteBlock: (id, companyId, day) =>
      invoke(CHANNELS.blocksDelete, id, companyId, day),
    endSeries: (seriesId, companyId, day) =>
      invoke(CHANNELS.blocksEndSeries, seriesId, companyId, day),
    setOutcome: (id, outcome, companyId, day) =>
      invoke(CHANNELS.blocksOutcome, id, outcome, companyId, day),
    updateSeries: (seriesId, companyId, day, change) =>
      invoke(CHANNELS.blocksUpdateSeries, seriesId, companyId, day, change),
    setHabit: (seriesId, isHabit, companyId, day) =>
      invoke(CHANNELS.blocksSetHabit, seriesId, isHabit, companyId, day),
  },
  terms: {
    list: (companyId) => invoke(CHANNELS.termsList, companyId),
    create: (companyId, input) => invoke(CHANNELS.termsCreate, companyId, input),
    remove: (id, companyId) => invoke(CHANNELS.termsDelete, id, companyId),
  },
  notes: {
    list: (companyId, search) => invoke(CHANNELS.notesList, companyId, search ?? ""),
    create: (companyId, body) => invoke(CHANNELS.notesCreate, companyId, body),
    update: (id, body, companyId) =>
      invoke(CHANNELS.notesUpdate, id, body, companyId),
    pin: (id, pinned, companyId) =>
      invoke(CHANNELS.notesPin, id, pinned, companyId),
    remove: (id, companyId) => invoke(CHANNELS.notesDelete, id, companyId),
  },
  google: {
    state: (companyId) => invoke(CHANNELS.googleState, companyId),
    refresh: (companyId) => invoke(CHANNELS.googleRefresh, companyId),
    connect: (companyId, url, secret) =>
      invoke(CHANNELS.googleConnect, companyId, url, secret),
    disconnect: (companyId) => invoke(CHANNELS.googleDisconnect, companyId),
    choose: (companyId, calendarId, taskListId) =>
      invoke(CHANNELS.googleChoose, companyId, calendarId, taskListId),
    sync: (companyId) => invoke(CHANNELS.googleSync, companyId),
    setAuto: (companyId, on) => invoke(CHANNELS.googleAuto, companyId, on),
    saveScript: () => invoke(CHANNELS.googleScript),
  },
  capture: {
    get: () => invoke(CHANNELS.captureGet),
    set: (accelerator) => invoke(CHANNELS.captureSet, accelerator),
    save: (body) => invoke(CHANNELS.captureSave, body),
    close: () => invoke(CHANNELS.captureClose),
    mode: () => invoke(CHANNELS.captureWhich),
    onMode: (fn: (mode: "task" | "note") => void) => {
      const handler = (_event: unknown, mode: "task" | "note") => fn(mode);
      ipcRenderer.on("capture:mode", handler);
      return () => ipcRenderer.removeListener("capture:mode", handler);
    },
    keepInTray: () => invoke(CHANNELS.trayKeep),
    setKeepInTray: (on: boolean) => invoke(CHANNELS.traySetKeep, on),
  },
  tasks: {
    forLead: (leadId) => invoke(CHANNELS.tasksForLead, leadId),
    create: (companyId, input) => invoke(CHANNELS.tasksCreate, companyId, input),
    quick: (companyId, input) => invoke(CHANNELS.tasksQuick, companyId, input),
    update: (id, input) => invoke(CHANNELS.tasksUpdate, id, input),
    complete: (id) => invoke(CHANNELS.tasksComplete, id),
    reopen: (id) => invoke(CHANNELS.tasksReopen, id),
    reschedule: (id, dueOn) => invoke(CHANNELS.tasksReschedule, id, dueOn),
    remove: (id) => invoke(CHANNELS.tasksDelete, id),
  },
  words: {
    list: () => invoke(CHANNELS.wordsList),
    add: (input) => invoke(CHANNELS.wordsAdd, input),
    remove: (id) => invoke(CHANNELS.wordsRemove, id),
  },
  board: {
    get: (companyId) => invoke(CHANNELS.boardGet, companyId),
    createStage: (companyId, input) =>
      invoke(CHANNELS.stagesCreate, companyId, input),
    renameStage: (stageId, name) => invoke(CHANNELS.stagesRename, stageId, name),
    setStageKind: (stageId, kind) =>
      invoke(CHANNELS.stagesSetKind, stageId, kind),
    moveStage: (stageId, direction) =>
      invoke(CHANNELS.stagesMove, stageId, direction),
    deleteStage: (stageId) => invoke(CHANNELS.stagesDelete, stageId),
  },
  email: {
    templates: (companyId) => invoke(CHANNELS.templatesList, companyId),
    createTemplate: (companyId, input) =>
      invoke(CHANNELS.templatesCreate, companyId, input),
    updateTemplate: (id, input) => invoke(CHANNELS.templatesUpdate, id, input),
    deleteTemplate: (id) => invoke(CHANNELS.templatesDelete, id),
  },
  data: {
    backups: () => invoke(CHANNELS.dataBackups),
    backupNow: () => invoke(CHANNELS.dataBackupNow),
    restore: (path) => invoke(CHANNELS.dataRestore, path),
    exportAll: (companyId) => invoke(CHANNELS.dataExportAll, companyId),
    revealFolder: (path) => invoke(CHANNELS.dataRevealFolder, path),
    paths: () => invoke(CHANNELS.dataPaths),
  },
};

contextBridge.exposeInMainWorld("caulder", api);
