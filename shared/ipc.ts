import type { EmailRecord, MailState, SendEmailInput } from "./mail";
import type {
  BrainExport,
  BrainHome,
  BrainPage,
  BrainPageSummary,
  BrainRevision,
  BrainSectionId,
  DecisionEntry,
  PageSaveInput,
} from "./brain";
import type { SearchHit } from "./search";
import type { CallContext, CallInput, CallRecord, CallScript, CallTone } from "./calls";
import type { CashBalanceInput, CostsOverview } from "./costs";
import type { AskAnswer, AskInput, AskState, ConnectInput, ContextSize } from "./ask";
import type {
  CompanyDocument,
  DeadlinesOverview,
  DocumentCategory,
  DocumentInput,
  ObligationDone,
  ObligationInput,
} from "./deadlines";
import type {
  Catalogue,
  PickableProduct,
  PriceInput,
  ProductDetail,
  ProductInput,
} from "./products";
import type { LinkKind, LinkTarget } from "./links";
import type { PageTasks } from "./steps";
import type { ImportOutcome, InvitationPreview, ShareState } from "./share";
import type { HandbookInput, HandbookOutcome, RoomChoices, RoomInput, RoomOutcome } from "./dataroom";
import type { DayRecord, GoalRow, HobbyRow, JournalDay, JournalMonth, PageTime, StudiesOverview, TimeInput } from "./life";
import type { Mood } from "./brain";
import type { HabitInput, HabitsOverview } from "./habits";
import type { VisionInput, VisionPicture, VisionTile } from "./vision";
import type { Progress } from "./progress";
import type { MetricDetail, MetricInput, MetricsOverview, ValueInput } from "./metrics";
import type {
  CandidateStage,
  HireInput,
  OpeningInput,
  PeopleOverview,
  PersonDetail,
  PersonInput,
} from "./people";
import type { MapGraph, MapPosition } from "./map";
import type {
  AccentId,
  Activity,
  ActivityInput,
  Company,
  CompanyInput,
  Deal,
  DealInput,
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
  appReportError: "app:report-error",

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
  dealsForLead: "deals:for-lead",
  dealsCreate: "deals:create",
  dealsUpdate: "deals:update",
  dealsSetStage: "deals:set-stage",
  dealsSetLoss: "deals:set-loss",
  dealsDelete: "deals:delete",
  callsContext: "calls:context",
  callsDial: "calls:dial",
  callsStartScript: "calls:start-script",
  callsLog: "calls:log",
  costsOverview: "costs:overview",
  costsRenew: "costs:renew",
  costsAddBalance: "costs:add-balance",
  costsDeleteBalance: "costs:delete-balance",
  askState: "ask:state",
  askConnect: "ask:connect",
  askDisconnect: "ask:disconnect",
  askSetModel: "ask:set-model",
  askSetContext: "ask:set-context",
  askRefreshModels: "ask:refresh-models",
  askQuestion: "ask:question",
  productsCatalogue: "products:catalogue",
  productsDetail: "products:detail",
  productsPickable: "products:pickable",
  productsCreate: "products:create",
  productsUpdate: "products:update",
  productsDelete: "products:delete",
  productsAddPrice: "products:add-price",
  productsUpdatePrice: "products:update-price",
  productsDeletePrice: "products:delete-price",
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

  brainHome: "brain:home",
  brainSection: "brain:section",
  brainPage: "brain:page",
  brainCreate: "brain:create",
  brainSave: "brain:save",
  brainPin: "brain:pin",
  brainArchive: "brain:archive",
  brainDelete: "brain:delete",
  brainRevisions: "brain:revisions",
  brainRestore: "brain:restore",
  brainReveal: "brain:reveal",
  brainCopySecret: "brain:copy-secret",
  brainFileNote: "brain:file-note",
  brainExport: "brain:export",
  brainDossier: "brain:dossier",
  brainSearch: "brain:search",
  brainLinkTargets: "brain:link-targets",
  brainBacklinks: "brain:backlinks",
  brainMap: "brain:map",
  brainLocalMap: "brain:local-map",
  brainKeepPositions: "brain:keep-positions",
  brainLetGo: "brain:let-go",
  brainSteps: "brain:steps",
  brainMakeTasks: "brain:make-tasks",
  brainDecisions: "brain:decisions",
  metricsOverview: "metrics:overview",
  metricsDetail: "metrics:detail",
  metricsCreate: "metrics:create",
  metricsAddDerived: "metrics:add-derived",
  metricsUpdate: "metrics:update",
  metricsRemove: "metrics:remove",
  metricsRecord: "metrics:record",
  metricsUnrecord: "metrics:unrecord",
  meGet: "me:get",
  meSet: "me:set",
  shareState: "share:state",
  shareStart: "share:start",
  shareCopyInvite: "share:copy-invite",
  sharePreview: "share:preview",
  shareJoin: "share:join",
  shareSync: "share:sync",
  shareStop: "share:stop",
  shareExport: "share:export",
  shareImport: "share:import",
  roomChoices: "room:choices",
  roomWrite: "room:write",
  roomHandbook: "room:handbook",
  roomReveal: "room:reveal",
  lifeEntry: "life:entry",
  lifeFind: "life:find",
  lifeMood: "life:mood",
  lifeMonth: "life:month",
  lifeToday: "life:today",
  lifeDay: "life:day",
  lifeStudies: "life:studies",
  lifeHobbies: "life:hobbies",
  lifeGoals: "life:goals",
  lifeTime: "life:time",
  lifeMakeTime: "life:make-time",
  lifeStopTime: "life:stop-time",
  lifeLinkedPage: "life:linked-page",
  lifeJot: "life:jot",
  lifeLogTime: "life:log-time",
  habitsList: "habits:list",
  habitsAdd: "habits:add",
  habitsUpdate: "habits:update",
  habitsArchive: "habits:archive",
  habitsRemove: "habits:remove",
  habitsTick: "habits:tick",
  visionList: "vision:list",
  visionAdd: "vision:add",
  visionUpdate: "vision:update",
  visionMove: "vision:move",
  visionRemove: "vision:remove",
  progressGet: "progress:get",
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


  documentsList: "documents:list",
  documentsAdd: "documents:add",
  documentsRecord: "documents:record",
  documentsUpdate: "documents:update",
  documentsOpen: "documents:open",
  documentsRemove: "documents:remove",
  deadlinesOverview: "deadlines:overview",
  deadlinesCreate: "deadlines:create",
  deadlinesUpdate: "deadlines:update",
  deadlinesRemove: "deadlines:remove",
  deadlinesDone: "deadlines:done",
  deadlinesUndo: "deadlines:undo",
  deadlinesAddPresets: "deadlines:add-presets",
  deadlinesHistory: "deadlines:history",
  peopleOverview: "people:overview",
  peopleDetail: "people:detail",
  peopleCreate: "people:create",
  peopleUpdate: "people:update",
  peopleRemove: "people:remove",
  peopleStage: "people:stage",
  peopleHire: "people:hire",
  peopleOnboard: "people:onboard",
  openingsCreate: "openings:create",
  openingsUpdate: "openings:update",
  openingsRemove: "openings:remove",


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
  googleCopyScript: "google:copy-script",
  mailState: "mail:state",
  mailForLead: "mail:for-lead",
  mailSend: "mail:send",
  mailCancel: "mail:cancel",
  mailCheck: "mail:check",

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
  /** A screen that failed to draw, sent to the log. Fire and forget. */
  reportError: (detail: string) => void;
};

/**
 * What the app needs to render its first frame: every live company and which
 * one is open. Fetched as one call so the shell never flashes an empty
 * sidebar between two round trips.
 */
export type Workspace = {
  companies: Company[];
  /** The company chosen in the sidebar: what Contacts, Deals, Money and Brain show. */
  activeCompanyId: string | null;
  /** Where your own things live - the journal, Life, habits - whichever company is chosen. */
  homeCompanyId: string | null;
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

/**
 * What is being sold to a contact. The board moves deals; a contact's page
 * lists and edits them. Changes to a contact's list return the whole list.
 */
export type DealsApi = {
  forLead: (leadId: string) => Promise<Deal[]>;
  create: (leadId: string, input: DealInput) => Promise<Deal[]>;
  update: (id: string, input: DealInput) => Promise<Deal[]>;
  setStage: (id: string, stageId: string | null) => Promise<Deal>;
  /** Why it was lost. Null clears it. */
  setLoss: (id: string, reason: string | null) => Promise<Deal>;
  remove: (id: string) => Promise<Deal[]>;
};

/**
 * The call prompter. `dial` names a contact and which of its numbers; the
 * number itself never crosses the bridge, the same rule as WhatsApp.
 */
export type CallsApi = {
  context: (leadId: string) => Promise<CallContext>;
  dial: (leadId: string, which: "phone" | "alt") => Promise<void>;
  /** A new script in Playbooks, from one of the tones. */
  startScript: (companyId: string, tone: CallTone) => Promise<CallScript>;
  /** Everything hanging up implies, at once. */
  log: (companyId: string, input: CallInput) => Promise<CallRecord>;
};

/**
 * Running costs, read from the brain's pages, and runway. The costs are
 * edited as pages; what is here is paying one and saying what is in the bank.
 */
export type CostsApi = {
  overview: (companyId: string) => Promise<CostsOverview>;
  /** Paid: onto the spend list, and the date moves on a cycle. */
  renew: (companyId: string, pageId: string) => Promise<CostsOverview>;
  addBalance: (companyId: string, input: CashBalanceInput) => Promise<CostsOverview>;
  removeBalance: (companyId: string, id: string) => Promise<CostsOverview>;
};

/**
 * Ask the brain, through whichever AI service is connected. The key goes in
 * once and never comes back out: the window can only ask whether one is kept,
 * and its last four characters.
 */
export type AskApi = {
  state: () => Promise<AskState>;
  /** Checked with the service - by asking it for its models - before it is kept. */
  connect: (input: ConnectInput) => Promise<AskState>;
  disconnect: () => Promise<AskState>;
  setModel: (model: string) => Promise<AskState>;
  setContext: (size: ContextSize) => Promise<AskState>;
  refreshModels: () => Promise<AskState>;
  question: (companyId: string, input: AskInput) => Promise<AskAnswer>;
};

/**
 * The catalogue and the price book. A product's prices are what it asks; what
 * it was charged at comes from the invoice lines that named it, so the detail
 * carries both.
 */
export type ProductsApi = {
  catalogue: (companyId: string) => Promise<Catalogue>;
  detail: (id: string) => Promise<ProductDetail>;
  /** What a quote or invoice line can pick, what is selling first. */
  pickable: (companyId: string) => Promise<PickableProduct[]>;
  create: (companyId: string, input: ProductInput) => Promise<ProductDetail>;
  update: (id: string, input: ProductInput) => Promise<ProductDetail>;
  remove: (id: string) => Promise<Catalogue>;
  addPrice: (productId: string, input: PriceInput) => Promise<ProductDetail>;
  updatePrice: (id: string, input: PriceInput) => Promise<ProductDetail>;
  removePrice: (id: string) => Promise<ProductDetail>;
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

/**
 * The company's documents, and a contact's among them. The renderer names a
 * document by id and main finds the file, the same rule as always: no path
 * crosses the bridge. Changes hand back the list they were made in - the
 * contact's, or the company's.
 */
export type DocumentsApi = {
  list: (companyId: string, leadId?: string | null) => Promise<CompanyDocument[]>;
  /** Opens a file dialog, copies what is chosen, and keeps each as a document. Null if cancelled. */
  add: (
    companyId: string,
    owner: { leadId?: string | null; pageId?: string | null; category?: DocumentCategory; expiresOn?: string | null },
  ) => Promise<CompanyDocument[] | null>;
  /** A document with no file here: only where it is. */
  record: (companyId: string, input: DocumentInput) => Promise<CompanyDocument[]>;
  update: (id: string, input: DocumentInput) => Promise<CompanyDocument>;
  /** Hands it to whatever the OS opens that kind of file with. */
  open: (id: string) => Promise<void>;
  remove: (id: string) => Promise<CompanyDocument[]>;
};

/**
 * Deadlines: the obligations, and everything with a date the brain holds. A
 * change hands back the whole calendar, since marking one done moves what is
 * next.
 */
export type DeadlinesApi = {
  overview: (companyId: string) => Promise<DeadlinesOverview>;
  create: (companyId: string, input: ObligationInput) => Promise<DeadlinesOverview>;
  update: (id: string, input: ObligationInput) => Promise<DeadlinesOverview>;
  remove: (id: string) => Promise<DeadlinesOverview>;
  /** Marks one occurrence - the one due on that day - done today. */
  done: (id: string, dueOn: string) => Promise<DeadlinesOverview>;
  undo: (id: string, dueOn: string) => Promise<DeadlinesOverview>;
  addPresets: (companyId: string, presetIds: string[]) => Promise<DeadlinesOverview>;
  /** What was done for it, and when, newest first. */
  history: (id: string) => Promise<ObligationDone[]>;
};

/**
 * People and hiring. The list hands back the whole section; a change made
 * on somebody's page hands back that page, and a delete nothing, because
 * what was being looked at has gone.
 */
export type PeopleApi = {
  overview: (companyId: string) => Promise<PeopleOverview>;
  detail: (personId: string) => Promise<PersonDetail>;
  create: (companyId: string, input: PersonInput) => Promise<PersonDetail>;
  update: (personId: string, input: PersonInput) => Promise<PersonDetail>;
  remove: (personId: string) => Promise<void>;
  /** Moves a candidate along. Hiring is its own step, because it asks what as. */
  stage: (personId: string, stage: CandidateStage) => Promise<PeopleOverview>;
  hire: (personId: string, input: HireInput) => Promise<PersonDetail>;
  /** Runs a checklist as tasks: the default for their kind, or a playbook page's steps. */
  onboard: (personId: string, playbookId: string | null) => Promise<PersonDetail>;
  createOpening: (companyId: string, input: OpeningInput) => Promise<PeopleOverview>;
  updateOpening: (id: string, input: OpeningInput) => Promise<PeopleOverview>;
  removeOpening: (id: string) => Promise<PeopleOverview>;
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

/**
 * The company brain, and search over everything.
 *
 * A secret field never comes back through `page`: only its mask does. `reveal`
 * hands one over for as long as somebody is looking at it, and `copySecret`
 * puts it on the clipboard from main and clears it again shortly after.
 */
export type BrainApi = {
  home: (companyId: string) => Promise<BrainHome>;
  section: (companyId: string, section: BrainSectionId, archived: boolean) => Promise<BrainPageSummary[]>;
  page: (id: string) => Promise<BrainPage>;
  /** `preset` picks one of the template's starting points, such as a script's tone. */
  create: (companyId: string, section: BrainSectionId, template: string, preset?: string) => Promise<BrainPage>;
  save: (id: string, input: PageSaveInput) => Promise<BrainPage>;
  pin: (id: string, pinned: boolean) => Promise<BrainPage>;
  archive: (id: string, archived: boolean) => Promise<BrainPage>;
  remove: (id: string) => Promise<void>;
  revisions: (id: string) => Promise<BrainRevision[]>;
  restore: (id: string, revision: number) => Promise<BrainPage>;
  reveal: (id: string, field: string) => Promise<string>;
  copySecret: (id: string, field: string) => Promise<void>;
  /** A caught note becomes a page; the note goes once the page exists. */
  fileNote: (noteId: string, section: BrainSectionId) => Promise<BrainPage>;
  /** Asks for a folder; null when the person cancelled. */
  exportAll: (companyId: string, secrets: boolean) => Promise<BrainExport | null>;
  /** The few long documents written for an assistant. Asks for a folder; null when cancelled. */
  dossier: (companyId: string, secrets: boolean) => Promise<BrainExport | null>;
  search: (companyId: string, text: string) => Promise<SearchHit[]>;
  /** What `[[` offers for what has been typed after it. */
  linkTargets: (companyId: string, text: string) => Promise<LinkTarget[]>;
  /** The pages that link to a page or a contact. */
  backlinks: (kind: LinkKind, id: string) => Promise<BrainPageSummary[]>;
  map: (companyId: string, allContacts: boolean) => Promise<MapGraph>;
  /** What is around one dot, one to three links out: two when not said. */
  localMap: (companyId: string, kind: LinkKind, id: string, depth?: number) => Promise<MapGraph>;
  /** Where the dots were left, and which are pinned. */
  keepPositions: (companyId: string, positions: MapPosition[]) => Promise<void>;
  /** Unpins every dot. */
  letGo: (companyId: string) => Promise<void>;
  /** A meeting's action items or a playbook's steps, and the tasks they have become. */
  steps: (pageId: string) => Promise<PageTasks>;
  /** A meeting: its open items not yet tasks. A playbook: every step, again, for a contact if one is named. */
  makeTasks: (pageId: string, leadId: string | null) => Promise<PageTasks>;
  /** Every decision, newest first. */
  decisions: (companyId: string) => Promise<DecisionEntry[]>;
};

/**
 * Two founders: who this Caulder is, the shared brain, and the brain file.
 * The invitation is copied to the clipboard by main: the script's address
 * never reaches the window.
 */
export type ShareApi = {
  me: () => Promise<string | null>;
  setMe: (name: string) => Promise<string | null>;
  state: (companyId: string) => Promise<ShareState>;
  start: (companyId: string) => Promise<ShareState>;
  copyInvitation: (companyId: string) => Promise<void>;
  preview: (invitation: string) => Promise<InvitationPreview>;
  join: (companyId: string, invitation: string) => Promise<ShareState>;
  sync: (companyId: string) => Promise<ShareState>;
  stop: (companyId: string) => Promise<ShareState>;
  /** Asks where to save; null when cancelled. */
  exportFile: (companyId: string) => Promise<{ pages: number } | null>;
  /** Asks which file; null when cancelled. */
  importFile: (companyId: string) => Promise<ImportOutcome | null>;
};

/**
 * The data room and the handbook: the company handed to somebody else. Main
 * asks where to save and remembers where it put each, so the window never
 * handles a path.
 */
export type RoomApi = {
  choices: (companyId: string) => Promise<RoomChoices>;
  /** A zip with an index. Null when the save was cancelled. */
  write: (companyId: string, input: RoomInput) => Promise<RoomOutcome | null>;
  /** One PDF. Null when the save was cancelled. */
  handbook: (companyId: string, input: HandbookInput) => Promise<HandbookOutcome | null>;
  /** Shows the last one written, in its folder. */
  reveal: (companyId: string, which: "room" | "handbook") => Promise<void>;
};

/**
 * The founder's own half of the brain: the journal, the day as Caulder saw
 * it, studies, hobbies and goals, and time set aside for a page.
 */
export type LifeApi = {
  /** The entry for a day - today when null - made if there is none. */
  entry: (companyId: string, day: string | null) => Promise<BrainPage>;
  /** The entry for a day if there is one; opening the journal does not make one. */
  find: (companyId: string, day: string) => Promise<BrainPage | null>;
  mood: (pageId: string, mood: Mood | null) => Promise<BrainPage>;
  month: (companyId: string, month: string | null) => Promise<JournalMonth>;
  today: (companyId: string) => Promise<{ day: string; entry: JournalDay | null }>;
  day: (companyId: string, day: string) => Promise<DayRecord>;
  studies: (companyId: string) => Promise<StudiesOverview>;
  hobbies: (companyId: string) => Promise<HobbyRow[]>;
  goals: (companyId: string) => Promise<GoalRow[]>;
  time: (pageId: string) => Promise<PageTime>;
  makeTime: (pageId: string, input: TimeInput) => Promise<PageTime>;
  stopTime: (seriesId: string) => Promise<PageTime>;
  /** An exam from its course, class notes from theirs: a new page linked back. */
  linkedPage: (fromPageId: string, template: string) => Promise<BrainPage>;
  /** A line into today's journal, under its Today heading; the entry is made if there is none. */
  jot: (companyId: string, text: string) => Promise<BrainPage>;
  /** Time given to a page just now - a hobby, a course - kept on the Calendar as having happened. */
  logTime: (pageId: string, minutes: number) => Promise<PageTime>;
};

/** Habits: ticked on Today, their streaks and weeks worked out from the ticks. */
export type HabitsApi = {
  list: (companyId: string, archived?: boolean) => Promise<HabitsOverview>;
  add: (companyId: string, input: HabitInput) => Promise<HabitsOverview>;
  update: (id: string, input: HabitInput) => Promise<HabitsOverview>;
  archive: (id: string, archived: boolean) => Promise<HabitsOverview>;
  remove: (id: string) => Promise<HabitsOverview>;
  /** A day ticked, or the tick taken back. Today when no day is given. */
  tick: (id: string, day: string | null, done: boolean) => Promise<HabitsOverview>;
};

/** The vision board: each call answers with the whole board, in its order. */
export type VisionApi = {
  list: (companyId: string) => Promise<VisionTile[]>;
  /** A tile of words, a picture, or both. The picture is made smaller before it is sent. */
  add: (companyId: string, input: VisionInput, picture: VisionPicture | null) => Promise<VisionTile[]>;
  update: (id: string, input: VisionInput) => Promise<VisionTile[]>;
  /** To a place on the board, counting from 0; the rest close up. */
  move: (id: string, index: number) => Promise<VisionTile[]>;
  remove: (id: string) => Promise<VisionTile[]>;
};

/** Your level, the week across the four areas, and achievements - all worked out, none of it kept. */
export type ProgressApi = {
  get: (companyId: string) => Promise<Progress>;
};

/** Metrics: the derived ones and the ones written down, each with a year of history. */
export type MetricsApi = {
  overview: (companyId: string) => Promise<MetricsOverview>;
  detail: (id: string) => Promise<MetricDetail>;
  create: (companyId: string, input: MetricInput) => Promise<MetricsOverview>;
  addDerived: (companyId: string, source: string) => Promise<MetricsOverview>;
  update: (id: string, input: MetricInput) => Promise<MetricDetail>;
  remove: (id: string) => Promise<MetricsOverview>;
  /** A reading on a day. One on the same day replaces it. */
  record: (id: string, input: ValueInput) => Promise<MetricDetail>;
  unrecord: (valueId: string) => Promise<MetricDetail>;
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
  /** Puts the whole Apps Script file on the clipboard, ready to paste. */
  copyScript: () => Promise<void>;
};

/**
 * Email through the Google script.
 *
 * Like WhatsApp, the renderer names a contact and never an address: main
 * reads the contact's own email from the database.
 */
export type MailApi = {
  /** Whether this page can send, and why not when it cannot. */
  state: () => Promise<MailState>;
  forLead: (leadId: string) => Promise<EmailRecord[]>;
  /** Sends now or schedules, and returns the contact's messages. */
  send: (input: SendEmailInput) => Promise<EmailRecord[]>;
  /** Stops a message that has not gone, or its waiting follow-up. */
  cancel: (emailId: string) => Promise<EmailRecord[]>;
  /** Asks the script now what became of everything, then returns this contact's messages. */
  check: (leadId: string) => Promise<EmailRecord[]>;
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
type DataFolder = "database" | "backups" | "logs";

export type DataApi = {
  backups: () => Promise<BackupFile[]>;
  backupNow: () => Promise<BackupFile>;
  /**
   * Replaces the live database with one of the listed backups, named by its
   * file name - never a path, so nothing outside the backups folder can be
   * put in its place. The app reloads afterwards.
   */
  restore: (name: string) => Promise<{ safetyCopy: string }>;
  /** Writes CSVs and a database copy where the user chooses. Null if cancelled. */
  exportAll: (companyId: string) => Promise<ExportEverything | null>;
  /** Opens one of Caulder's own folders. Named, not a path, for the same reason. */
  revealFolder: (which: DataFolder) => Promise<void>;
  paths: () => Promise<{ database: string; backups: string; logs: string }>;
};

export type CaulderApi = {
  window: WindowApi;
  app: AppApi;
  companies: CompaniesApi;
  leads: LeadsApi;
  deals: DealsApi;
  calls: CallsApi;
  costs: CostsApi;
  ask: AskApi;
  products: ProductsApi;
  activities: ActivitiesApi;
  imports: ImportApi;
  today: TodayApi;
  outreach: OutreachApi;
  money: MoneyApi;
  day: DayApi;
  terms: TermsApi;
  notes: NotesApi;
  brain: BrainApi;
  google: GoogleApi;
  mail: MailApi;
  capture: CaptureApi;
  documents: DocumentsApi;
  deadlines: DeadlinesApi;
  people: PeopleApi;
  metrics: MetricsApi;
  share: ShareApi;
  room: RoomApi;
  life: LifeApi;
  habits: HabitsApi;
  vision: VisionApi;
  progress: ProgressApi;
  fields: FieldsApi;
  tasks: TasksApi;
  words: WordsApi;
  board: BoardApi;
  email: EmailApi;
  data: DataApi;
};
