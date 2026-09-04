import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS, type CaulderApi } from "@shared/ipc";

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
    isMaximized: () => ipcRenderer.invoke(CHANNELS.windowIsMaximized),
  },
  app: {
    version: () => ipcRenderer.invoke(CHANNELS.appVersion),
  },
  companies: {
    list: () => ipcRenderer.invoke(CHANNELS.companiesList),
    create: (input) => ipcRenderer.invoke(CHANNELS.companiesCreate, input),
    rename: (id, name) => ipcRenderer.invoke(CHANNELS.companiesRename, id, name),
    setAccent: (id, accent) => ipcRenderer.invoke(CHANNELS.companiesSetAccent, id, accent),
    archive: (id) => ipcRenderer.invoke(CHANNELS.companiesArchive, id),
    remove: (id) => ipcRenderer.invoke(CHANNELS.companiesDelete, id),
    seedDemo: (companyId) => ipcRenderer.invoke(CHANNELS.companiesSeedDemo, companyId),
    demoBatch: (companyId) => ipcRenderer.invoke(CHANNELS.companiesDemoBatch, companyId),
    stages: (companyId) => ipcRenderer.invoke(CHANNELS.companiesStages, companyId),
    setActive: (id) => ipcRenderer.invoke(CHANNELS.activeCompanySet, id),
  },
  leads: {
    list: (query) => ipcRenderer.invoke(CHANNELS.leadsList, query),
    find: (id) => ipcRenderer.invoke(CHANNELS.leadsFind, id),
    create: (companyId, input) =>
      ipcRenderer.invoke(CHANNELS.leadsCreate, companyId, input),
    update: (id, input) => ipcRenderer.invoke(CHANNELS.leadsUpdate, id, input),
    setStage: (id, stageId) => ipcRenderer.invoke(CHANNELS.leadsSetStage, id, stageId),
    remove: (id) => ipcRenderer.invoke(CHANNELS.leadsDelete, id),
    setStageMany: (companyId, ids, stageId) =>
      ipcRenderer.invoke(CHANNELS.leadsSetStageMany, companyId, ids, stageId),
    removeMany: (companyId, ids) =>
      ipcRenderer.invoke(CHANNELS.leadsDeleteMany, companyId, ids),
  },
  activities: {
    list: (leadId) => ipcRenderer.invoke(CHANNELS.activitiesList, leadId),
    log: (input) => ipcRenderer.invoke(CHANNELS.activitiesLog, input),
  },
  imports: {
    choose: () => ipcRenderer.invoke(CHANNELS.importChoose),
    paste: (text) => ipcRenderer.invoke(CHANNELS.importPaste, text),
    preview: (companyId, fileId, mapping) =>
      ipcRenderer.invoke(CHANNELS.importPreview, companyId, fileId, mapping),
    commit: (jobId, resolutions) =>
      ipcRenderer.invoke(CHANNELS.importCommit, jobId, resolutions),
    batches: (companyId) => ipcRenderer.invoke(CHANNELS.importBatches, companyId),
    undo: (batchId) => ipcRenderer.invoke(CHANNELS.importUndo, batchId),
    template: () => ipcRenderer.invoke(CHANNELS.importTemplate),
  },
  today: {
    get: (companyId) => ipcRenderer.invoke(CHANNELS.todayGet, companyId),
  },
  tasks: {
    forLead: (leadId) => ipcRenderer.invoke(CHANNELS.tasksForLead, leadId),
    create: (companyId, input) => ipcRenderer.invoke(CHANNELS.tasksCreate, companyId, input),
    update: (id, input) => ipcRenderer.invoke(CHANNELS.tasksUpdate, id, input),
    complete: (id) => ipcRenderer.invoke(CHANNELS.tasksComplete, id),
    reopen: (id) => ipcRenderer.invoke(CHANNELS.tasksReopen, id),
    reschedule: (id, dueOn) => ipcRenderer.invoke(CHANNELS.tasksReschedule, id, dueOn),
    remove: (id) => ipcRenderer.invoke(CHANNELS.tasksDelete, id),
  },
  board: {
    get: (companyId) => ipcRenderer.invoke(CHANNELS.boardGet, companyId),
    createStage: (companyId, input) =>
      ipcRenderer.invoke(CHANNELS.stagesCreate, companyId, input),
    renameStage: (stageId, name) => ipcRenderer.invoke(CHANNELS.stagesRename, stageId, name),
    setStageKind: (stageId, kind) =>
      ipcRenderer.invoke(CHANNELS.stagesSetKind, stageId, kind),
    moveStage: (stageId, direction) =>
      ipcRenderer.invoke(CHANNELS.stagesMove, stageId, direction),
    deleteStage: (stageId) => ipcRenderer.invoke(CHANNELS.stagesDelete, stageId),
  },
  email: {
    templates: (companyId) => ipcRenderer.invoke(CHANNELS.templatesList, companyId),
    createTemplate: (companyId, input) =>
      ipcRenderer.invoke(CHANNELS.templatesCreate, companyId, input),
    updateTemplate: (id, input) => ipcRenderer.invoke(CHANNELS.templatesUpdate, id, input),
    deleteTemplate: (id) => ipcRenderer.invoke(CHANNELS.templatesDelete, id),

    list: (companyId) => ipcRenderer.invoke(CHANNELS.emailList, companyId),
    provider: () => ipcRenderer.invoke(CHANNELS.emailProvider),
    setProvider: (provider) => ipcRenderer.invoke(CHANNELS.emailSetProvider, provider),
    requeue: (id) => ipcRenderer.invoke(CHANNELS.emailRequeue, id),
    forLead: (leadId) => ipcRenderer.invoke(CHANNELS.emailForLead, leadId),
    queue: (companyId, input) => ipcRenderer.invoke(CHANNELS.emailQueue, companyId, input),
    remove: (id) => ipcRenderer.invoke(CHANNELS.emailDelete, id),

    sequences: (companyId) => ipcRenderer.invoke(CHANNELS.sequencesList, companyId),
    createSequence: (companyId, input) =>
      ipcRenderer.invoke(CHANNELS.sequencesCreate, companyId, input),
    deleteSequence: (id) => ipcRenderer.invoke(CHANNELS.sequencesDelete, id),
    addStep: (sequenceId, templateId, offsetDays) =>
      ipcRenderer.invoke(CHANNELS.sequencesAddStep, sequenceId, templateId, offsetDays),
    removeStep: (stepId) => ipcRenderer.invoke(CHANNELS.sequencesRemoveStep, stepId),
    enroll: (sequenceId, leadId) =>
      ipcRenderer.invoke(CHANNELS.sequencesEnroll, sequenceId, leadId),

    exportOutbox: (companyId) => ipcRenderer.invoke(CHANNELS.syncExport, companyId),
    importLog: (companyId) => ipcRenderer.invoke(CHANNELS.syncImport, companyId),
    history: (companyId) => ipcRenderer.invoke(CHANNELS.syncHistory, companyId),
    saveScript: () => ipcRenderer.invoke(CHANNELS.syncScript),
  },
  data: {
    backups: () => ipcRenderer.invoke(CHANNELS.dataBackups),
    backupNow: () => ipcRenderer.invoke(CHANNELS.dataBackupNow),
    restore: (path) => ipcRenderer.invoke(CHANNELS.dataRestore, path),
    exportAll: (companyId) => ipcRenderer.invoke(CHANNELS.dataExportAll, companyId),
    revealFolder: (path) => ipcRenderer.invoke(CHANNELS.dataRevealFolder, path),
    paths: () => ipcRenderer.invoke(CHANNELS.dataPaths),
  },
};

contextBridge.exposeInMainWorld("caulder", api);
