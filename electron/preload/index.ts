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
    reportError: (detail) => ipcRenderer.send(CHANNELS.appReportError, detail),
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
  documents: {
    list: (companyId, leadId) => invoke(CHANNELS.documentsList, companyId, leadId ?? null),
    add: (companyId, owner) => invoke(CHANNELS.documentsAdd, companyId, owner),
    record: (companyId, input) => invoke(CHANNELS.documentsRecord, companyId, input),
    update: (id, input) => invoke(CHANNELS.documentsUpdate, id, input),
    open: (id) => invoke(CHANNELS.documentsOpen, id),
    remove: (id) => invoke(CHANNELS.documentsRemove, id),
  },
  deadlines: {
    overview: (companyId) => invoke(CHANNELS.deadlinesOverview, companyId),
    create: (companyId, input) => invoke(CHANNELS.deadlinesCreate, companyId, input),
    update: (id, input) => invoke(CHANNELS.deadlinesUpdate, id, input),
    remove: (id) => invoke(CHANNELS.deadlinesRemove, id),
    done: (id, dueOn) => invoke(CHANNELS.deadlinesDone, id, dueOn),
    undo: (id, dueOn) => invoke(CHANNELS.deadlinesUndo, id, dueOn),
    addPresets: (companyId, presetIds) => invoke(CHANNELS.deadlinesAddPresets, companyId, presetIds),
    history: (id) => invoke(CHANNELS.deadlinesHistory, id),
  },
  share: {
    me: () => invoke(CHANNELS.meGet),
    setMe: (name) => invoke(CHANNELS.meSet, name),
    state: (companyId) => invoke(CHANNELS.shareState, companyId),
    start: (companyId) => invoke(CHANNELS.shareStart, companyId),
    copyInvitation: (companyId) => invoke(CHANNELS.shareCopyInvite, companyId),
    preview: (invitation) => invoke(CHANNELS.sharePreview, invitation),
    join: (companyId, invitation) => invoke(CHANNELS.shareJoin, companyId, invitation),
    sync: (companyId) => invoke(CHANNELS.shareSync, companyId),
    stop: (companyId) => invoke(CHANNELS.shareStop, companyId),
    exportFile: (companyId) => invoke(CHANNELS.shareExport, companyId),
    importFile: (companyId) => invoke(CHANNELS.shareImport, companyId),
  },
  life: {
    entry: (companyId, day) => invoke(CHANNELS.lifeEntry, companyId, day),
    find: (companyId, day) => invoke(CHANNELS.lifeFind, companyId, day),
    mood: (pageId, mood) => invoke(CHANNELS.lifeMood, pageId, mood),
    month: (companyId, month) => invoke(CHANNELS.lifeMonth, companyId, month),
    today: (companyId) => invoke(CHANNELS.lifeToday, companyId),
    day: (companyId, day) => invoke(CHANNELS.lifeDay, companyId, day),
    studies: (companyId) => invoke(CHANNELS.lifeStudies, companyId),
    hobbies: (companyId) => invoke(CHANNELS.lifeHobbies, companyId),
    goals: (companyId) => invoke(CHANNELS.lifeGoals, companyId),
    time: (pageId) => invoke(CHANNELS.lifeTime, pageId),
    makeTime: (pageId, input) => invoke(CHANNELS.lifeMakeTime, pageId, input),
    stopTime: (seriesId) => invoke(CHANNELS.lifeStopTime, seriesId),
    linkedPage: (fromPageId, template) => invoke(CHANNELS.lifeLinkedPage, fromPageId, template),
    jot: (companyId, text) => invoke(CHANNELS.lifeJot, companyId, text),
    logTime: (pageId, minutes) => invoke(CHANNELS.lifeLogTime, pageId, minutes),
  },
  habits: {
    list: (companyId, archived) => invoke(CHANNELS.habitsList, companyId, archived ?? false),
    add: (companyId, input) => invoke(CHANNELS.habitsAdd, companyId, input),
    update: (id, input) => invoke(CHANNELS.habitsUpdate, id, input),
    archive: (id, archived) => invoke(CHANNELS.habitsArchive, id, archived),
    remove: (id) => invoke(CHANNELS.habitsRemove, id),
    tick: (id, day, done) => invoke(CHANNELS.habitsTick, id, day, done),
  },
  vision: {
    list: (companyId) => invoke(CHANNELS.visionList, companyId),
    add: (companyId, input, picture) => invoke(CHANNELS.visionAdd, companyId, input, picture),
    update: (id, input) => invoke(CHANNELS.visionUpdate, id, input),
    move: (id, index) => invoke(CHANNELS.visionMove, id, index),
    remove: (id) => invoke(CHANNELS.visionRemove, id),
  },
  progress: {
    get: (companyId) => invoke(CHANNELS.progressGet, companyId),
  },
  room: {
    choices: (companyId) => invoke(CHANNELS.roomChoices, companyId),
    write: (companyId, input) => invoke(CHANNELS.roomWrite, companyId, input),
    handbook: (companyId, input) => invoke(CHANNELS.roomHandbook, companyId, input),
    reveal: (companyId, which) => invoke(CHANNELS.roomReveal, companyId, which),
  },
  metrics: {
    overview: (companyId) => invoke(CHANNELS.metricsOverview, companyId),
    detail: (id) => invoke(CHANNELS.metricsDetail, id),
    create: (companyId, input) => invoke(CHANNELS.metricsCreate, companyId, input),
    addDerived: (companyId, source) => invoke(CHANNELS.metricsAddDerived, companyId, source),
    update: (id, input) => invoke(CHANNELS.metricsUpdate, id, input),
    remove: (id) => invoke(CHANNELS.metricsRemove, id),
    record: (id, input) => invoke(CHANNELS.metricsRecord, id, input),
    unrecord: (valueId) => invoke(CHANNELS.metricsUnrecord, valueId),
  },
  people: {
    overview: (companyId) => invoke(CHANNELS.peopleOverview, companyId),
    detail: (personId) => invoke(CHANNELS.peopleDetail, personId),
    create: (companyId, input) => invoke(CHANNELS.peopleCreate, companyId, input),
    update: (personId, input) => invoke(CHANNELS.peopleUpdate, personId, input),
    remove: (personId) => invoke(CHANNELS.peopleRemove, personId),
    stage: (personId, stage) => invoke(CHANNELS.peopleStage, personId, stage),
    hire: (personId, input) => invoke(CHANNELS.peopleHire, personId, input),
    onboard: (personId, playbookId) => invoke(CHANNELS.peopleOnboard, personId, playbookId),
    createOpening: (companyId, input) => invoke(CHANNELS.openingsCreate, companyId, input),
    updateOpening: (id, input) => invoke(CHANNELS.openingsUpdate, id, input),
    removeOpening: (id) => invoke(CHANNELS.openingsRemove, id),
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
  brain: {
    home: (companyId) => invoke(CHANNELS.brainHome, companyId),
    section: (companyId, section, archived) => invoke(CHANNELS.brainSection, companyId, section, archived),
    page: (id) => invoke(CHANNELS.brainPage, id),
    dossier: (companyId, secrets) => invoke(CHANNELS.brainDossier, companyId, secrets),
    create: (companyId, section, template, preset) =>
      invoke(CHANNELS.brainCreate, companyId, section, template, preset ?? null),
    save: (id, input) => invoke(CHANNELS.brainSave, id, input),
    pin: (id, pinned) => invoke(CHANNELS.brainPin, id, pinned),
    archive: (id, archived) => invoke(CHANNELS.brainArchive, id, archived),
    remove: (id) => invoke(CHANNELS.brainDelete, id),
    revisions: (id) => invoke(CHANNELS.brainRevisions, id),
    restore: (id, revision) => invoke(CHANNELS.brainRestore, id, revision),
    reveal: (id, field) => invoke(CHANNELS.brainReveal, id, field),
    copySecret: (id, field) => invoke(CHANNELS.brainCopySecret, id, field),
    fileNote: (noteId, section) => invoke(CHANNELS.brainFileNote, noteId, section),
    exportAll: (companyId, secrets) => invoke(CHANNELS.brainExport, companyId, secrets),
    search: (companyId, text) => invoke(CHANNELS.brainSearch, companyId, text),
    linkTargets: (companyId, text) => invoke(CHANNELS.brainLinkTargets, companyId, text),
    backlinks: (kind, id) => invoke(CHANNELS.brainBacklinks, kind, id),
    map: (companyId, allContacts) => invoke(CHANNELS.brainMap, companyId, allContacts),
    localMap: (companyId, kind, id, depth) => invoke(CHANNELS.brainLocalMap, companyId, kind, id, depth ?? 2),
    keepPositions: (companyId, positions) => invoke(CHANNELS.brainKeepPositions, companyId, positions),
    letGo: (companyId) => invoke(CHANNELS.brainLetGo, companyId),
    steps: (pageId) => invoke(CHANNELS.brainSteps, pageId),
    makeTasks: (pageId, leadId) => invoke(CHANNELS.brainMakeTasks, pageId, leadId),
    decisions: (companyId) => invoke(CHANNELS.brainDecisions, companyId),
  },
  deals: {
    forLead: (leadId) => invoke(CHANNELS.dealsForLead, leadId),
    create: (leadId, input) => invoke(CHANNELS.dealsCreate, leadId, input),
    update: (id, input) => invoke(CHANNELS.dealsUpdate, id, input),
    setStage: (id, stageId) => invoke(CHANNELS.dealsSetStage, id, stageId),
    setLoss: (id, reason) => invoke(CHANNELS.dealsSetLoss, id, reason),
    remove: (id) => invoke(CHANNELS.dealsDelete, id),
  },
  calls: {
    context: (leadId) => invoke(CHANNELS.callsContext, leadId),
    dial: (leadId, which) => invoke(CHANNELS.callsDial, leadId, which),
    startScript: (companyId, tone) => invoke(CHANNELS.callsStartScript, companyId, tone),
    log: (companyId, input) => invoke(CHANNELS.callsLog, companyId, input),
  },
  ask: {
    state: () => invoke(CHANNELS.askState),
    connect: (input) => invoke(CHANNELS.askConnect, input),
    disconnect: () => invoke(CHANNELS.askDisconnect),
    setModel: (model) => invoke(CHANNELS.askSetModel, model),
    setContext: (size) => invoke(CHANNELS.askSetContext, size),
    refreshModels: () => invoke(CHANNELS.askRefreshModels),
    question: (companyId, input) => invoke(CHANNELS.askQuestion, companyId, input),
  },
  products: {
    catalogue: (companyId) => invoke(CHANNELS.productsCatalogue, companyId),
    detail: (id) => invoke(CHANNELS.productsDetail, id),
    pickable: (companyId) => invoke(CHANNELS.productsPickable, companyId),
    create: (companyId, input) => invoke(CHANNELS.productsCreate, companyId, input),
    update: (id, input) => invoke(CHANNELS.productsUpdate, id, input),
    remove: (id) => invoke(CHANNELS.productsDelete, id),
    addPrice: (productId, input) => invoke(CHANNELS.productsAddPrice, productId, input),
    updatePrice: (id, input) => invoke(CHANNELS.productsUpdatePrice, id, input),
    removePrice: (id) => invoke(CHANNELS.productsDeletePrice, id),
  },
  costs: {
    overview: (companyId) => invoke(CHANNELS.costsOverview, companyId),
    renew: (companyId, pageId) => invoke(CHANNELS.costsRenew, companyId, pageId),
    addBalance: (companyId, input) => invoke(CHANNELS.costsAddBalance, companyId, input),
    removeBalance: (companyId, id) => invoke(CHANNELS.costsDeleteBalance, companyId, id),
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
    copyScript: () => invoke(CHANNELS.googleCopyScript),
  },
  mail: {
    state: () => invoke(CHANNELS.mailState),
    forLead: (leadId) => invoke(CHANNELS.mailForLead, leadId),
    send: (input) => invoke(CHANNELS.mailSend, input),
    cancel: (emailId) => invoke(CHANNELS.mailCancel, emailId),
    check: (leadId) => invoke(CHANNELS.mailCheck, leadId),
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
    restore: (name) => invoke(CHANNELS.dataRestore, name),
    exportAll: (companyId) => invoke(CHANNELS.dataExportAll, companyId),
    revealFolder: (which) => invoke(CHANNELS.dataRevealFolder, which),
    paths: () => invoke(CHANNELS.dataPaths),
  },
};

contextBridge.exposeInMainWorld("caulder", api);
