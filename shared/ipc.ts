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
  QuickInput,
  AreaWord,
  Today,
  Board,
  GoalPeriod,
  Attachment,
  CustomField,
  CustomFieldInput,
  DayPlan,
  WeekPlan,
  BlockInput,
  Term,
  Note,
  GoogleState,
  MoneyOverview,
  Quote,
  Invoice,
  QuoteInput,
  InvoiceInput,
  QuoteStatus,
  InvoiceStatus,
  PaymentInput,
  SpendEntryInput,
} from "./domain";
import type {
  EmailTemplate,
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
  notifyGet: "notify:get",
  notifySet: "notify:set",

  appVersion: "app:version",

  companiesList: "companies:list",
  companiesCreate: "companies:create",
  companiesRename: "companies:rename",
  companiesSetAccent: "companies:set-accent",
  companiesArchive: "companies:archive",
  companiesSetGoal: "companies:set-goal",
  companiesSetRemind: "companies:set-remind",
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
  leadsSetLossReason: "leads:set-loss-reason",
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

  companiesSetCurrency: "companies:set-currency",
  moneyGet: "money:get",
  moneyForLead: "money:for-lead",
  quoteSave: "quotes:save",
  quoteStatus: "quotes:status",
  quoteAccept: "quotes:accept",
  quoteDelete: "quotes:delete",
  invoiceSave: "invoices:save",
  invoiceStatus: "invoices:status",
  invoiceMarkPaid: "invoices:mark-paid",
  invoicePdf: "invoices:pdf",
  invoiceDelete: "invoices:delete",
  paymentAdd: "payments:add",
  paymentDelete: "payments:delete",
  spendEntryAdd: "spend:entry-add",
  spendEntryDelete: "spend:entry-delete",
  outreachWhatsApp: "outreach:whatsapp",
  outreachEmail: "outreach:email",
  outreachEmailSent: "outreach:email-sent",
  outreachFollowUpDays: "outreach:follow-up-days",
  outreachSetFollowUpDays: "outreach:set-follow-up-days",

  dayGet: "day:get",
  weekGet: "week:get",
  blocksCreate: "blocks:create",
  blocksUpdate: "blocks:update",
  blocksMove: "blocks:move",
  blocksDelete: "blocks:delete",
  blocksEndSeries: "blocks:end-series",
  blocksOutcome: "blocks:outcome",
  blocksUpdateSeries: "blocks:update-series",
  blocksSetHabit: "blocks:set-habit",

  termsList: "terms:list",
  termsCreate: "terms:create",
  termsDelete: "terms:delete",

  notesList: "notes:list",
  notesCreate: "notes:create",
  notesUpdate: "notes:update",
  notesPin: "notes:pin",
  notesDelete: "notes:delete",


  googleState: "google:state",
  googleRefresh: "google:refresh",
  googleConnect: "google:connect",
  googleDisconnect: "google:disconnect",
  googleChoose: "google:choose",
  googleSync: "google:sync",
  googleAuto: "google:auto",

  captureGet: "capture:get",
  captureSet: "capture:set",
  captureSave: "capture:save",
  captureClose: "capture:close",
  captureWhich: "capture:which",
  trayKeep: "tray:keep",
  traySetKeep: "tray:set-keep",


  attachmentsList: "attachments:list",
  attachmentsAdd: "attachments:add",
  attachmentsOpen: "attachments:open",
  attachmentsRemove: "attachments:remove",


  fieldsList: "fields:list",
  fieldsCreate: "fields:create",
  fieldsDelete: "fields:delete",
  fieldValuesGet: "fields:values",
  fieldValueSet: "fields:set-value",
  tasksForLead: "tasks:for-lead",
  tasksCreate: "tasks:create",
  tasksQuick: "tasks:quick",
  tasksUpdate: "tasks:update",
  tasksComplete: "tasks:complete",
  tasksReopen: "tasks:reopen",
  tasksReschedule: "tasks:reschedule",
  tasksDelete: "tasks:delete",

  wordsList: "words:list",
  wordsAdd: "words:add",
  wordsRemove: "words:remove",

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



  googleScript: "google:script",

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
  /** Whether a desktop notification is sent when something is overdue. */
  notifications: () => Promise<boolean>;
  setNotifications: (on: boolean) => Promise<boolean>;
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
  /** Display only; nothing is converted. */
  setCurrency: (id: string, currency: string) => Promise<Workspace>;
  list: () => Promise<Workspace>;
  create: (input: CompanyInput) => Promise<Workspace>;
  rename: (id: string, name: string) => Promise<Workspace>;
  setAccent: (id: string, accent: AccentId) => Promise<Workspace>;
  archive: (id: string) => Promise<Workspace>;
  /** What this company is aiming at. Null clears it. */
  setGoal: (id: string, goal: { value: number; period: GoalPeriod } | null) => Promise<Workspace>;
  /**
   * Minutes before a block starts to say so. Null switches reminders off for
   * this workspace, which is also the master switch over any single block.
   */
  setRemind: (id: string, minutes: number | null) => Promise<Workspace>;
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
  /** Why it was lost. Null clears it. */
  setLossReason: (id: string, reason: string | null) => Promise<Lead>;
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
  /**
   * Writes the preview. `campaignId` attributes every lead this CREATES to one
   * campaign — batch-wide, because a spreadsheet of two hundred scraped
   * schools is one push and asking two hundred times means it is never
   * answered. Leads it merely updates keep whatever they came from.
   */
  commit: (
    jobId: string,
    resolutions: Record<number, Resolution>,
    campaignId: string | null,
  ) => Promise<ImportSummary>;
  batches: (companyId: string) => Promise<ImportBatch[]>;
  undo: (batchId: string) => Promise<{ deleted: number; restored: number }>;
  /** Writes the template where the user chooses. Resolves to the path, or null if cancelled. */
  template: () => Promise<string | null>;
};

export type AttachmentsApi = {
  list: (leadId: string) => Promise<Attachment[]>;
  /** Opens a file dialog and copies what is chosen. Null if cancelled. */
  add: (companyId: string, leadId: string) => Promise<Attachment[] | null>;
  /** Hands it to whatever the OS opens that kind of file with. */
  open: (id: string) => Promise<void>;
  remove: (id: string) => Promise<Attachment[]>;
};

export type FieldsApi = {
  list: (companyId: string) => Promise<CustomField[]>;
  create: (companyId: string, input: CustomFieldInput) => Promise<CustomField[]>;
  remove: (companyId: string, id: string) => Promise<CustomField[]>;
  values: (leadId: string) => Promise<Record<string, string>>;
  setValue: (leadId: string, fieldId: string, value: string) => Promise<Record<string, string>>;
};

/**
 * Reaching out, without Caulder sending anything.
 *
 * `email` opens the message in the machine's own mail app; `emailSent` is the
 * person saying it went, which is the only thing that writes to the history.
 * The renderer supplies an id and text, never an address.
 */
export type OutreachApi = {
  /** Opens WhatsApp on this lead's own number; main builds the address. */
  whatsapp: (leadId: string, message: string) => Promise<void>;
  email: (leadId: string, subject: string, body: string) => Promise<void>;
  emailSent: (leadId: string, subject: string, body: string) => Promise<void>;
  /** The built-in follow-up: days after a stage move with nothing planned. 0 is never. */
  followUpDays: () => Promise<number>;
  setFollowUpDays: (days: number) => Promise<number>;
};

/**
 * Money: quotes, invoices, payments and spend.
 *
 * Every write returns the whole overview, because a payment changes the
 * invoice it is against, the month's paid figure and the overdue list at once,
 * and a screen that patched those by hand would eventually disagree with the
 * database.
 */
export type MoneyApi = {
  get: (companyId: string) => Promise<MoneyOverview>;
  /** What a contact has been quoted and invoiced. */
  forLead: (leadId: string) => Promise<{ quotes: Quote[]; invoices: Invoice[] }>;
  saveQuote: (companyId: string, id: string | null, input: QuoteInput) => Promise<MoneyOverview>;
  setQuoteStatus: (companyId: string, id: string, status: QuoteStatus) => Promise<MoneyOverview>;
  /** Accepting makes the invoice, and gives the deal a value if it had none. */
  acceptQuote: (companyId: string, id: string) => Promise<MoneyOverview>;
  deleteQuote: (companyId: string, id: string) => Promise<MoneyOverview>;
  saveInvoice: (companyId: string, id: string | null, input: InvoiceInput) => Promise<MoneyOverview>;
  setInvoiceStatus: (companyId: string, id: string, status: InvoiceStatus) => Promise<MoneyOverview>;
  /** Records a payment for whatever is still owed, dated today. */
  markPaid: (companyId: string, id: string) => Promise<MoneyOverview>;
  /** Writes the PDF, attaches it to the contact and opens it. */
  invoicePdf: (companyId: string, id: string) => Promise<void>;
  deleteInvoice: (companyId: string, id: string) => Promise<MoneyOverview>;
  addPayment: (companyId: string, invoiceId: string, input: PaymentInput) => Promise<MoneyOverview>;
  deletePayment: (companyId: string, id: string) => Promise<MoneyOverview>;
  addSpend: (companyId: string, input: SpendEntryInput) => Promise<MoneyOverview>;
  deleteSpend: (companyId: string, id: string) => Promise<MoneyOverview>;
};

export type TodayApi = {
  get: (companyId: string) => Promise<Today>;
};

/**
 * Every mutation returns the whole day back.
 *
 * Moving one block changes what overlaps what, which changes the width and
 * position of blocks nobody touched. Returning the single edited row would
 * leave the screen to recompute a layout it does not own, so the day is
 * rebuilt wholesale - the same rule Today already follows.
 */
export type DayApi = {
  get: (companyId: string, day: string) => Promise<DayPlan>;
  /**
   * The whole week a day falls in. Read-only: everything that changes a block
   * goes through the calls below and comes back as one day, because the week
   * is a view of the plan rather than a second way to hold it.
   */
  week: (companyId: string, day: string) => Promise<WeekPlan>;
  createBlock: (companyId: string, input: BlockInput) => Promise<DayPlan>;
  updateBlock: (id: string, input: BlockInput) => Promise<DayPlan>;
  /** Drag and resize, which must not have to send a whole record. */
  moveBlock: (
    id: string,
    where: { day: string; startsAt: string; minutes: number },
  ) => Promise<DayPlan>;
  deleteBlock: (id: string, companyId: string, day: string) => Promise<DayPlan>;
  /**
   * Ends a repeat from this day on, leaving everything before it.
   *
   * The Tuesdays already sat through are history, not part of a rule
   * since cancelled - deleting them would leave a week claiming you did
   * nothing.
   */
  endSeries: (seriesId: string, companyId: string, day: string) => Promise<DayPlan>;
  /**
   * What became of one. Null puts it back to "nobody said", which past its
   * day counts as kept.
   */
  setOutcome: (
    id: string,
    outcome: string | null,
    companyId: string,
    day: string,
  ) => Promise<DayPlan>;
  /**
   * Changes a whole run from this day forward.
   *
   * Never backwards. "The lecture moved to ten" is a fact about the future;
   * the nine o'clocks already sat through happened at nine.
   */
  updateSeries: (
    seriesId: string,
    companyId: string,
    day: string,
    change: { title: string; startsAt: string; minutes: number; kind: string | null },
  ) => Promise<DayPlan>;
  /** Marks a run as worth a streak. Only habits ever ask anything of you. */
  setHabit: (
    seriesId: string,
    isHabit: boolean,
    companyId: string,
    day: string,
  ) => Promise<DayPlan>;
};

export type TermsApi = {
  list: (companyId: string) => Promise<Term[]>;
  create: (
    companyId: string,
    input: { name: string; fromDay: string; untilDay: string },
  ) => Promise<Term[]>;
  /** Removes the label. The blocks it held stay: last semester happened. */
  remove: (id: string, companyId: string) => Promise<Term[]>;
};

export type NotesApi = {
  list: (companyId: string, search?: string) => Promise<Note[]>;
  create: (companyId: string, body: string) => Promise<Note[]>;
  update: (id: string, body: string, companyId: string) => Promise<Note[]>;
  pin: (id: string, pinned: boolean, companyId: string) => Promise<Note[]>;
  remove: (id: string, companyId: string) => Promise<Note[]>;
};

/**
 * The Google link.
 *
 * `connect` verifies before it stores: a URL and key that do not work are
 * worse kept than refused, because the failure would then turn up later as a
 * sync that silently never runs.
 *
 * Nothing here ever hands the URL or the key back. The renderer sends them
 * once and afterwards can only ask whether a connection exists - the same rule
 * as `attachments.open`, where the renderer passes an id and main derives the
 * path from its own records.
 */
export type GoogleApi = {
  /** Cheap and offline: what is stored, and what the last sync did. */
  state: (companyId: string) => Promise<GoogleState>;
  /** Asks Google which calendars and lists exist. One request. */
  refresh: (companyId: string) => Promise<GoogleState>;
  connect: (companyId: string, url: string, secret: string) => Promise<GoogleState>;
  disconnect: (companyId: string) => Promise<GoogleState>;
  choose: (
    companyId: string,
    calendarId: string | null,
    taskListId: string | null,
  ) => Promise<GoogleState>;
  /** Runs one now. Rejects with something a person can act on. */
  sync: (companyId: string) => Promise<GoogleState>;
  /**
   * Turns the background sync on or off.
   *
   * Also restarts it, so switching it on takes effect now - and clears
   * the give-up state, because somebody changing this setting has
   * probably just fixed whatever was wrong.
   */
  setAuto: (companyId: string, on: boolean) => Promise<GoogleState>;
  /** Saves the Apps Script file to paste into Google. Null when cancelled. */
  saveScript: () => Promise<string | null>;
};

/**
 * The system-wide key that catches a thought.
 *
 * `set` reports what happened rather than returning void: another application
 * may already own the combination, and a capture key you believe in and do not
 * have is worse than none at all.
 */
export type CaptureApi = {
  /**
   * The key as it actually stands. `held` false with a `reason` is a key
   * another app already had - including the default, claimed on launch.
   */
  get: () => Promise<{ accelerator: string; held: boolean; reason: string | null }>;
  set: (accelerator: string) => Promise<{ ok: boolean; reason?: string }>;
  /** Writes into whichever workspace is active, then closes. */
  save: (body: string) => Promise<void>;
  close: () => Promise<void>;
  /** The mode this showing was asked for - the tray asks for a task - or null. */
  mode: () => Promise<"task" | "note" | null>;
  /** Told each time the window is opened in a particular mode. */
  onMode: (fn: (mode: "task" | "note") => void) => () => void;
  /** Whether closing the main window leaves Caulder in the tray. */
  keepInTray: () => Promise<boolean>;
  setKeepInTray: (on: boolean) => Promise<void>;
};

export type TasksApi = {
  forLead: (leadId: string) => Promise<Task[]>;
  create: (companyId: string, input: TaskInput) => Promise<Task>;
  /**
   * A task from the quick-add line, and - when it has a time - the hour set
   * aside for it, linked to it. Both or neither. A repeat makes the run of
   * blocks and no task, and says how many it made.
   */
  quick: (
    companyId: string,
    input: QuickInput,
  ) => Promise<{ task: Task | null; blocked: boolean; repeats: number }>;
  update: (id: string, input: TaskInput) => Promise<Task>;
  complete: (id: string) => Promise<Task>;
  reopen: (id: string) => Promise<Task>;
  reschedule: (id: string, dueOn: string) => Promise<Task>;
  remove: (id: string) => Promise<void>;
};

/**
 * Your words: what the quick-add line knows about this particular life.
 *
 * Global, so none of these take a company id. Each change returns the whole
 * list, alphabetical, because that is what the screen is about to draw.
 */
export type WordsApi = {
  list: () => Promise<AreaWord[]>;
  add: (input: { word: string; area: string }) => Promise<AreaWord[]>;
  remove: (id: string) => Promise<AreaWord[]>;
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
  outreach: OutreachApi;
  money: MoneyApi;
  day: DayApi;
  terms: TermsApi;
  notes: NotesApi;
  google: GoogleApi;
  capture: CaptureApi;
  attachments: AttachmentsApi;
  fields: FieldsApi;
  tasks: TasksApi;
  words: WordsApi;
  board: BoardApi;
  email: EmailApi;
  data: DataApi;
};
