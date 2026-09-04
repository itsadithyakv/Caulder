import type {
  AccentId,
  Activity,
  ActivityInput,
  Company,
  CompanyInput,
  Lead,
  LeadInput,
  LeadListRow,
  LeadQuery,
  PipelineStage,
  StageInput,
  StageKind,
  Task,
  TaskInput,
  Today,
  Board,
} from "./domain";
import type {
  EmailMessage,
  EmailTemplate,
  MailProvider,
  ExportResult,
  IngestResult,
  QueueInput,
  Sequence,
  SequenceInput,
  SyncBatch,
  TemplateInput,
} from "./email";
import type { BackupFile, ExportEverything } from "./data";
import type {
  ChosenFile,
  ColumnMapping,
  ImportBatch,
  ImportPreview,
  ImportSummary,
  Resolution,
} from "./import";

/**
 * The typed contract between the renderer and the main process.
 *
 * Declared once here and imported by BOTH sides, so a handler and its caller
 * cannot drift apart. The preload exposes exactly this shape on
 * window.caulder and nothing else; nodeIntegration stays off.
 *
 * Channel names are namespaced "<area>:<verb>" and must stay in sync with
 * CHANNELS below.
 */

export const CHANNELS = {
  windowMinimize: "window:minimize",
  windowToggleMaximize: "window:toggle-maximize",
  windowClose: "window:close",
  windowIsMaximized: "window:is-maximized",

  appVersion: "app:version",

  companiesList: "companies:list",
  companiesCreate: "companies:create",
  companiesRename: "companies:rename",
  companiesSetAccent: "companies:set-accent",
  companiesArchive: "companies:archive",
  companiesDelete: "companies:delete",
  companiesSeedDemo: "companies:seed-demo",
  companiesDemoBatch: "companies:demo-batch",
  companiesStages: "companies:stages",

  activeCompanyGet: "active-company:get",
  activeCompanySet: "active-company:set",

  leadsList: "leads:list",
  leadsFind: "leads:find",
  leadsCreate: "leads:create",
  leadsUpdate: "leads:update",
  leadsSetStage: "leads:set-stage",
  leadsDelete: "leads:delete",
  leadsSetStageMany: "leads:set-stage-many",
  leadsDeleteMany: "leads:delete-many",

  activitiesList: "activities:list",
  activitiesLog: "activities:log",

  importChoose: "import:choose",
  importPaste: "import:paste",
  importPreview: "import:preview",
  importCommit: "import:commit",
  importBatches: "import:batches",
  importUndo: "import:undo",
  importTemplate: "import:template",

  todayGet: "today:get",
  tasksForLead: "tasks:for-lead",
  tasksCreate: "tasks:create",
  tasksUpdate: "tasks:update",
  tasksComplete: "tasks:complete",
  tasksReopen: "tasks:reopen",
  tasksReschedule: "tasks:reschedule",
  tasksDelete: "tasks:delete",

  boardGet: "board:get",
  stagesCreate: "stages:create",
  stagesRename: "stages:rename",
  stagesSetKind: "stages:set-kind",
  stagesMove: "stages:move",
  stagesDelete: "stages:delete",

  templatesList: "templates:list",
  templatesCreate: "templates:create",
  templatesUpdate: "templates:update",
  templatesDelete: "templates:delete",

  emailList: "email:list",
  emailProvider: "email:provider",
  emailSetProvider: "email:set-provider",
  emailRequeue: "email:requeue",
  emailForLead: "email:for-lead",
  emailQueue: "email:queue",
  emailDelete: "email:delete",

  sequencesList: "sequences:list",
  sequencesCreate: "sequences:create",
  sequencesDelete: "sequences:delete",
  sequencesAddStep: "sequences:add-step",
  sequencesRemoveStep: "sequences:remove-step",
  sequencesEnroll: "sequences:enroll",

  syncExport: "sync:export",
  syncImport: "sync:import",
  syncHistory: "sync:history",
  syncScript: "sync:script",

  dataBackups: "data:backups",
  dataBackupNow: "data:backup-now",
  dataRestore: "data:restore",
  dataExportAll: "data:export-all",
  dataRevealFolder: "data:reveal-folder",
  dataPaths: "data:paths",
} as const;

export type WindowApi = {
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
};

export type AppApi = {
  version: () => Promise<string>;
};

/**
 * What the app needs to render its first frame: every live company and which
 * one is open. Fetched as one call so the shell never flashes an empty
 * sidebar between two round trips.
 */
export type Workspace = {
  companies: Company[];
  activeCompanyId: string | null;
};

export type CompaniesApi = {
  list: () => Promise<Workspace>;
  create: (input: CompanyInput) => Promise<Workspace>;
  rename: (id: string, name: string) => Promise<Workspace>;
  setAccent: (id: string, accent: AccentId) => Promise<Workspace>;
  archive: (id: string) => Promise<Workspace>;
  /** Ends a workspace and everything in it. Archiving only hides one. */
  remove: (id: string) => Promise<Workspace>;
  stages: (companyId: string) => Promise<PipelineStage[]>;
  setActive: (id: string) => Promise<Workspace>;
  /** Fills a company with a small worked week. Returns the batch that undoes it. */
  seedDemo: (companyId: string) => Promise<string>;
  /** The sample batch still in place, if there is one. */
  demoBatch: (companyId: string) => Promise<string | null>;
};

/**
 * Lead mutations return the lead alone rather than the whole list. Unlike
 * companies, a list of leads can run to thousands of rows and is filtered and
 * sorted client-side, so re-sending it on every keystroke of an edit would be
 * wasteful. The caller patches the row it already holds.
 */
export type LeadsApi = {
  list: (query: LeadQuery) => Promise<LeadListRow[]>;
  find: (id: string) => Promise<Lead | null>;
  create: (companyId: string, input: LeadInput) => Promise<Lead>;
  update: (id: string, input: LeadInput) => Promise<Lead>;
  setStage: (id: string, stageId: string | null) => Promise<Lead>;
  remove: (id: string) => Promise<void>;
  /**
   * Acting on a selection. Both apply as one transaction and return how many
   * rows actually changed, which is not always how many were asked for: a
   * lead already in the target stage does not move, and one deleted in
   * another window is no longer there to delete.
   */
  setStageMany: (
    companyId: string,
    ids: string[],
    stageId: string | null,
  ) => Promise<number>;
  removeMany: (companyId: string, ids: string[]) => Promise<number>;
};

export type ActivitiesApi = {
  list: (leadId: string) => Promise<Activity[]>;
  log: (input: ActivityInput) => Promise<Activity>;
};

/**
 * The importer runs in four steps, and each one is a separate call so the user
 * can go back a step without losing the ones before it.
 *
 * The chosen file stays in the main process between `choose` and `preview`, so
 * changing a column mapping re-runs the preview without re-reading the file
 * and without thousands of raw cells crossing the bridge.
 */
export type ImportApi = {
  /** Opens a file dialog. Resolves to null when the user cancels. */
  choose: () => Promise<ChosenFile | null>;
  /**
   * The same thing from pasted text rather than a file. Returns the identical
   * handle, so the rest of the wizard cannot tell the two apart.
   */
  paste: (text: string) => Promise<ChosenFile>;
  preview: (companyId: string, fileId: string, mapping: ColumnMapping) => Promise<ImportPreview>;
  commit: (jobId: string, resolutions: Record<number, Resolution>) => Promise<ImportSummary>;
  batches: (companyId: string) => Promise<ImportBatch[]>;
  undo: (batchId: string) => Promise<{ deleted: number; restored: number }>;
  /** Writes the template where the user chooses. Resolves to the path, or null if cancelled. */
  template: () => Promise<string | null>;
};

/**
 * Today is rebuilt rather than patched. It is five queries against one day,
 * and any mutation can move a task between sections - completing an overdue
 * call empties one list and may add its lead to another. Recomputing is both
 * simpler and always right.
 */
export type TodayApi = {
  get: (companyId: string) => Promise<Today>;
};

export type TasksApi = {
  forLead: (leadId: string) => Promise<Task[]>;
  create: (companyId: string, input: TaskInput) => Promise<Task>;
  update: (id: string, input: TaskInput) => Promise<Task>;
  complete: (id: string) => Promise<Task>;
  reopen: (id: string) => Promise<Task>;
  reschedule: (id: string, dueOn: string) => Promise<Task>;
  remove: (id: string) => Promise<void>;
};

/**
 * Every stage mutation returns the whole list, for the same reason the company
 * ones do: reordering touches several rows, and replacing the list outright
 * keeps positions from drifting out of step with the screen.
 */
export type BoardApi = {
  get: (companyId: string) => Promise<Board>;
  createStage: (companyId: string, input: StageInput) => Promise<PipelineStage[]>;
  renameStage: (stageId: string, name: string) => Promise<PipelineStage[]>;
  setStageKind: (stageId: string, kind: StageKind) => Promise<PipelineStage[]>;
  /** -1 moves the stage earlier on the board, 1 moves it later. */
  moveStage: (stageId: string, direction: -1 | 1) => Promise<PipelineStage[]>;
  deleteStage: (stageId: string) => Promise<PipelineStage[]>;
};

/**
 * Email, and the two halves of the file bridge.
 *
 * Caulder never sends. `export` writes an outbox for Apps Script to pick up
 * and `import` reads back the log it writes, and both are explicit buttons
 * rather than a watched folder — Google Drive for Desktop is not installed on
 * this machine, so nothing can be assumed to sync on its own.
 */
export type EmailApi = {
  templates: (companyId: string) => Promise<EmailTemplate[]>;
  createTemplate: (companyId: string, input: TemplateInput) => Promise<EmailTemplate[]>;
  updateTemplate: (id: string, input: TemplateInput) => Promise<EmailTemplate[]>;
  deleteTemplate: (id: string) => Promise<EmailTemplate[]>;

  list: (companyId: string) => Promise<EmailMessage[]>;
  forLead: (leadId: string) => Promise<EmailMessage[]>;
  /** Which service the Apps Script is set up against, for the setup guide. */
  provider: () => Promise<MailProvider>;
  setProvider: (provider: MailProvider) => Promise<MailProvider>;
  /** Puts a bounced or failed message back in the queue, once fixed. */
  requeue: (id: string) => Promise<EmailMessage>;
  queue: (companyId: string, input: QueueInput) => Promise<EmailMessage>;
  remove: (id: string) => Promise<void>;

  sequences: (companyId: string) => Promise<Sequence[]>;
  createSequence: (companyId: string, input: SequenceInput) => Promise<Sequence[]>;
  deleteSequence: (sequenceId: string) => Promise<Sequence[]>;
  addStep: (sequenceId: string, templateId: string, offsetDays: number) => Promise<Sequence[]>;
  removeStep: (stepId: string) => Promise<Sequence[]>;
  enroll: (sequenceId: string, leadId: string) => Promise<void>;

  /** Writes the outbox where the user chooses. Null when cancelled. */
  exportOutbox: (companyId: string) => Promise<ExportResult | null>;
  /** Reads a log the user picks. Null when cancelled. */
  importLog: (companyId: string) => Promise<IngestResult | null>;
  history: (companyId: string) => Promise<SyncBatch[]>;
  /** Saves the Apps Script file to paste into Google. Null when cancelled. */
  saveScript: () => Promise<string | null>;
};

/**
 * Backup, restore and getting everything out.
 *
 * This is the user's only copy of their business data, on one machine, with no
 * cloud behind it — so every one of these is a first-class feature rather than
 * a hidden maintenance command.
 */
export type DataApi = {
  backups: () => Promise<BackupFile[]>;
  backupNow: () => Promise<BackupFile>;
  /** Replaces the live database. The app reloads afterwards. */
  restore: (path: string) => Promise<{ safetyCopy: string }>;
  /** Writes CSVs and a database copy where the user chooses. Null if cancelled. */
  exportAll: (companyId: string) => Promise<ExportEverything | null>;
  revealFolder: (path: string) => Promise<void>;
  paths: () => Promise<{ database: string; backups: string }>;
};

export type CaulderApi = {
  window: WindowApi;
  app: AppApi;
  companies: CompaniesApi;
  leads: LeadsApi;
  activities: ActivitiesApi;
  imports: ImportApi;
  today: TodayApi;
  tasks: TasksApi;
  board: BoardApi;
  email: EmailApi;
  data: DataApi;
};
