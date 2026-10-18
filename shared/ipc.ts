import type { SupportAnswer } from "./support";
import type { EmailRecord, MailState, SendEmailInput, TemplateStats } from "./mail";
import type { ProfileKind } from "./profiles";
import type { SheetState } from "./sheet";
import type { Fact, FactInput, PaidFromInput } from "./domain";
import type { WeekReview, WeekThing, WeekThingsInput } from "./week";
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
import type { TopicCopied } from "./topic";
import type { CallContext, CallInput, CallRecord, CallScript, CallTone } from "./calls";
import type { CashBalanceInput, CostsOverview } from "./costs";
import type { AskAnswer, AskInput, AskPreview, AskScope, AskState, ConnectInput, ContextSize } from "./ask";
import type { AiLineResult, LineInput } from "./ailine";
import type { BriefState, Draft, NoticedDraft, SortDraft } from "./propose";
import type { Home, Sorted } from "./rules";
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
import type { Learned } from "./quickadd";
import type { AnswerInput, NameInput, NameKept, SeenInput, TuneState } from "./tune";
import type { Lesson, LessonInput } from "./lessons";
import type { NudgeSettings } from "./nudges";
import type { LooseEnds, Related, UnderstandState } from "./understand";
import type { Example } from "./opinion";
import type { Answer, LineContext, MoveInput, Question, TaskSnapshot } from "./lines";
import type { MailAccount, MailAccountInput } from "./mailaccounts";
import type { PageTasks } from "./steps";
import type { HandbookInput, HandbookOutcome, RoomChoices, RoomInput, RoomOutcome } from "./dataroom";
import type { MetricDetail, MetricInput, MetricsOverview, ValueInput } from "./metrics";
import type { LinkOutcome, MapGraph, MapPosition } from "./map";
import type { Memory } from "./memories";
import type { WidgetLevel } from "./widget";
import type { RememberInput, Remembered } from "./memories";
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
  Today,
  Board,
  GoalPeriod,
  CustomField,
  CustomFieldInput,
  DayPlan,
  WeekPlan,
  BlockInput,
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
import type { BackupFile, DriveBackup, DriveBackups, ExportEverything, SyncedFolder, UpdateState } from "./data";
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
  appTour: "app:tour",
  appStartup: "app:startup",
  appSetStartup: "app:set-startup",
  appStartupApps: "app:startup-apps",
  appTourDone: "app:tour-done",
  appProblemReport: "app:problem-report",
  appOpenIssue: "app:open-issue",
  appSupport: "app:support",
  appSupportAnswer: "app:support-answer",
  appLicences: "app:licences",
  updatesState: "updates:state",
  updatesCheck: "updates:check",
  updatesInstall: "updates:install",
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
  askSetScope: "ask:set-scope",
  askSetLine: "ask:set-line",
  askPreview: "ask:preview",
  askLine: "ask:line",
  askBrief: "ask:brief",
  askProposeBrief: "ask:propose-brief",
  askProposeTidy: "ask:propose-tidy",
  askProposeNoticed: "ask:propose-noticed",
  askProposeSort: "ask:propose-sort",
  brainRulesOn: "brain:rules-on",
  brainSortPlan: "brain:sort-plan",
  brainSortApply: "brain:sort-apply",
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
  importGoogle: "import:google",

  todayGet: "today:get",
  todayOverdue: "today:overdue",
  todayColdAfterDays: "today:cold-after-days",
  todaySetColdAfterDays: "today:set-cold-after-days",

  companiesSetCurrency: "companies:set-currency",
  companiesSetCountry: "companies:set-country",
  companiesSetTimezone: "companies:set-timezone",
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
  outreachProfile: "outreach:profile",
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
  brainTopic: "brain:topic",
  brainLinkTargets: "brain:link-targets",
  brainBacklinks: "brain:backlinks",
  brainMap: "brain:map",
  brainMemories: "brain:memories",
  brainEditMemory: "brain:edit-memory",
  brainForgetMemory: "brain:forget-memory",
  brainRemember: "brain:remember",
  brainLocalMap: "brain:local-map",
  brainKeepPositions: "brain:keep-positions",
  brainLetGo: "brain:let-go",
  brainConnect: "brain:connect",
  brainDisconnect: "brain:disconnect",
  brainTitles: "brain:titles",
  sheetState: "sheet:state",
  sheetLink: "sheet:link",
  sheetSync: "sheet:sync",
  sheetUnlink: "sheet:unlink",
  sheetOpen: "sheet:open",
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
  roomChoices: "room:choices",
  roomWrite: "room:write",
  roomHandbook: "room:handbook",
  roomReveal: "room:reveal",
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

  widgetGet: "widget:get",
  widgetShow: "widget:show",
  widgetLevel: "widget:level",
  widgetFit: "widget:fit",
  widgetDrag: "widget:drag",
  widgetOpenApp: "widget:open-app",


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

  tuneGet: "tune:get",
  tuneLearned: "tune:learned",
  tuneSeen: "tune:seen",
  tuneKeep: "tune:keep",
  tuneAnswer: "tune:answer",
  tuneForget: "tune:forget",
  tuneNames: "tune:names",
  weekReview: "week:review",
  weekThings: "week:things",
  weekThingsSet: "week:things-set",
  weekThingDone: "week:thing-done",
  factsList: "facts:list",
  factsAdd: "facts:add",
  factsRemove: "facts:remove",
  factsAway: "facts:away",
  moneyPaidFrom: "money:paid-from",
  tuneNameKeep: "tune:name-keep",
  tuneNameForget: "tune:name-forget",
  lessonsList: "lessons:list",
  nudgesGet: "nudges:get",
  nudgesSet: "nudges:set",
  nudgesTest: "nudges:test",
  understandState: "understand:state",
  understandSet: "understand:set",
  understandAgain: "understand:again",
  understandRead: "understand:read",
  understandNotTheSame: "understand:not-the-same",
  understandRelated: "understand:related",
  understandLoose: "understand:loose",
  understandGather: "understand:gather",
  understandLeave: "understand:leave",
  linesContext: "lines:context",
  linesMove: "lines:move",
  linesCancel: "lines:cancel",
  linesRestore: "lines:restore",
  linesRename: "lines:rename",
  linesAnswer: "lines:answer",
  lessonsAdd: "lessons:add",
  lessonsRemove: "lessons:remove",
  mailAccountsList: "mail-accounts:list",
  mailAccountsAdd: "mail-accounts:add",
  mailAccountsRemove: "mail-accounts:remove",
  mailAccountsDefault: "mail-accounts:default",
  mailAccountsReplies: "mail-accounts:replies",

  boardGet: "board:get",
  stagesCreate: "stages:create",
  stagesRename: "stages:rename",
  stagesSetKind: "stages:set-kind",
  stagesMove: "stages:move",
  stagesDelete: "stages:delete",

  templatesList: "templates:list",
  templatesStats: "templates:stats",
  templatesCreate: "templates:create",
  templatesUpdate: "templates:update",
  templatesDelete: "templates:delete",



  googleScript: "google:script",
  googleSaveContact: "google:save-contact",
  googleBackup: "google:backup",
  googleBackups: "google:backups",
  googleCopyScript: "google:copy-script",
  mailState: "mail:state",
  mailForLead: "mail:for-lead",
  mailSend: "mail:send",
  mailCancel: "mail:cancel",
  mailCheck: "mail:check",

  dataBackups: "data:backups",
  dataBackupNow: "data:backup-now",
  dataMirror: "data:mirror",
  dataChooseMirror: "data:choose-mirror",
  dataStopMirror: "data:stop-mirror",
  dataSynced: "data:synced",
  dataUseSynced: "data:use-synced",
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
  /** Whether the first-run tour is still to be shown. */
  tour: () => Promise<boolean>;
  /** Finished or skipped: not shown again unless asked for from `?`. */
  tourDone: () => Promise<void>;
  /** Whether Caulder opens when Windows starts. A Store copy is switched in Windows, so `store` says so. */
  startup: () => Promise<{ on: boolean; store: boolean }>;
  setStartup: (on: boolean) => Promise<{ on: boolean; store: boolean }>;
  /** Windows' Startup apps page. */
  startupApps: () => Promise<void>;
  /** A problem report to read before it goes anywhere: version, Windows, the end of the log with names taken out. */
  problemReport: () => Promise<string>;
  /** Opens a GitHub issue with the report filled in, for the person to send. */
  openIssue: (text: string) => Promise<void>;
  /** Whether Today asks for support now (part six). The first read only sets the day. */
  support: () => Promise<{ ask: boolean }>;
  /** *Not now* asks again in three months; *never* ends it. */
  answerSupport: (answer: SupportAnswer) => Promise<void>;
  /** Opens the licences of everything Caulder ships, written when it was built. */
  licences: () => Promise<void>;
  updates: () => Promise<UpdateState>;
  checkForUpdates: () => Promise<UpdateState>;
  /** Quits and puts the downloaded update in. */
  installUpdate: () => Promise<void>;
  /** Told whenever an update moves on: found, downloading, ready. Returns the way to stop listening. */
  onUpdates: (fn: (state: UpdateState) => void) => () => void;
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
  /** Where the calendar's own things are kept, whichever company is chosen. */
  homeCompanyId: string | null;
};

export type CompaniesApi = {
  /** Display only; nothing is converted. */
  setCurrency: (id: string, currency: string) => Promise<Workspace>;
  /** Where it is: its phone numbers and filing calendar follow. */
  setCountry: (id: string, country: string) => Promise<Workspace>;
  setTimezone: (id: string, timezone: string) => Promise<Workspace>;
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
  /** Whether your own pages may go with a question. Locked days never do. */
  refreshModels: () => Promise<AskState>;
  question: (companyId: string, input: AskInput) => Promise<AskAnswer>;
  /** What goes with a question: what it needs, or the whole company every time. */
  setScope: (scope: AskScope) => Promise<AskState>;
  /** The quick line in or out of AI mode. Refused, in a sentence, with no AI connected. */
  setLineMode: (on: boolean) => Promise<AskState>;
  /** What would go with a question, worked out on this machine: nothing is sent for it. */
  preview: (companyId: string, input: AskInput) => Promise<AskPreview>;
  /** One line read by the AI: what it is, or - for a question - its answer. Writes nothing. */
  line: (companyId: string, input: LineInput) => Promise<AiLineResult>;
  /** The company in brief, as it goes with every question. */
  brief: (companyId: string) => Promise<BriefState>;
  /** Drafts, to be read and kept by hand - never written by the AI (shared/propose.ts). */
  proposeBrief: (companyId: string) => Promise<Draft>;
  proposeTidy: (companyId: string, pageId: string) => Promise<Draft>;
  proposeNoticed: (companyId: string) => Promise<NoticedDraft>;
  /** A page sorted, with the AI asked about the lines the rules here could not place. Moves nothing. */
  proposeSort: (companyId: string, pageId: string) => Promise<SortDraft>;
};

/** The rules on a subject, as they are shown beside the thing they are about. */
export type RulesShown = {
  /** The page they are on, or null when nothing has been said on the subject yet. */
  pageId: string | null;
  title: string;
  rules: { says: string; fact: string | null; day: string }[];
  /** How many stand in all, when more than are shown. */
  total: number;
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
  /** Writes the preview. */
  commit: (jobId: string, resolutions: Record<number, Resolution>) => Promise<ImportSummary>;
  batches: (companyId: string) => Promise<ImportBatch[]>;
  undo: (batchId: string) => Promise<{ deleted: number; restored: number }>;
  /** Writes the template where the user chooses. Resolves to the path, or null if cancelled. */
  template: () => Promise<string | null>;
  /**
   * The Google address book, fetched once and handed to the same wizard.
   *
   * Only when asked for: there is no background read of your contacts. It
   * reports what it left out and whether it reached the end, because a
   * partial address book that says it is whole is how people go missing.
   */
  google: () => Promise<ContactsPull>;
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
  /**
   * Opens this contact's LinkedIn or Instagram, with the message on the
   * clipboard to paste there; with no message, only their profile.
   */
  profile: (leadId: string, kind: ProfileKind, message: string) => Promise<void>;
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
  /** "Got 2400 from harbour": their open invoice paid, or a payment against it (part twelve, phase 49). */
  paidFrom: (companyId: string, input: PaidFromInput) => Promise<{ say: string }>;
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
  /** How many tasks are overdue, for the sidebar's badge - without building the whole of Today. */
  overdue: (companyId: string) => Promise<number>;
  /** Days without contact before an open deal is listed under Going quiet. Never set means 14. */
  coldAfterDays: () => Promise<number>;
  /** A whole number from 3 to 90; anything else is refused with the sentence to show. */
  setColdAfterDays: (days: number) => Promise<number>;
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
  /**
   * Export for an AI. With `you`, *04 you* is written beside the company
   * (phase 22); with `purpose`, what it is for leads the read-me, and the
   * model on this machine says what to read first for it.
   */
  dossier: (companyId: string, secrets: boolean, options?: { you?: boolean; purpose?: string }) => Promise<BrainExport | null>;
  search: (companyId: string, text: string) => Promise<SearchHit[]>;
  /** Everything about one topic, onto the clipboard for another AI. The words stay in main. */
  topic: (companyId: string, text: string) => Promise<TopicCopied>;
  /** What `[[` offers for what has been typed after it. */
  linkTargets: (companyId: string, text: string) => Promise<LinkTarget[]>;
  /** The pages that link to a page or a contact. */
  backlinks: (kind: LinkKind, id: string) => Promise<BrainPageSummary[]>;
  map: (companyId: string, allContacts: boolean) => Promise<MapGraph>;
  /** Every page of a company's brain by its title, for the line to know what a sentence is about. */
  titles: (companyId: string) => Promise<{ id: string; title: string; section: string }[]>;
  /** What the line was told to remember about a company, read back off its pages. */
  memories: (companyId: string) => Promise<{ companyId: string; memories: Memory[]; trails: Record<string, string[]> }>;
  /** One memory said differently, on its page; the page's memories as they now are. */
  editMemory: (input: { pageId: string; raw: string; fact: string | null; says: string }) => Promise<Memory[]>;
  /** One memory taken off its page. */
  forgetMemory: (input: { pageId: string; raw: string }) => Promise<Memory[]>;
  /** One dated line on the page it is about, in the company's brain; the page is started when there is none. */
  remember: (input: RememberInput) => Promise<Remembered>;
  /** The rules that stand on a subject of How we work, to show beside what they are about (shared/rules.ts). */
  rulesOn: (companyId: string, subject: string) => Promise<RulesShown>;
  /** Where each remembered line on a page would be better kept, by what this machine can check. Moves nothing. */
  sortPlan: (companyId: string, pageId: string) => Promise<{ pageId: string; title: string; lines: Sorted[] }>;
  /** The moves that were said yes to, made in one go. */
  applySort: (companyId: string, input: { pageId: string; moves: { raw: string; to: Home }[] }) => Promise<{ moved: number }>;
  /** What is around one dot, one to three links out: two when not said. */
  localMap: (companyId: string, kind: LinkKind, id: string, depth?: number) => Promise<MapGraph>;
  /** Where the dots were left, and which are pinned. */
  keepPositions: (companyId: string, positions: MapPosition[]) => Promise<void>;
  /** Unpins every dot. */
  letGo: (companyId: string) => Promise<void>;
  /** Links two dots by their keys, written into the page at one end. */
  connect: (companyId: string, from: string, to: string) => Promise<LinkOutcome>;
  /** Takes the link between two dots out of the page it is written in. */
  disconnect: (companyId: string, one: string, other: string) => Promise<void>;
  /** A meeting's action items or a playbook's steps, and the tasks they have become. */
  steps: (pageId: string) => Promise<PageTasks>;
  /** A meeting: its open items not yet tasks. A playbook: every step, again, for a contact if one is named. */
  makeTasks: (pageId: string, leadId: string | null) => Promise<PageTasks>;
  /** Every decision, newest first. */
  decisions: (companyId: string) => Promise<DecisionEntry[]>;
};

/**
 * A company's contacts kept as a Google Sheet, in the person's own Drive
 * through their own script (shared/sheet.ts). Off until a company is linked.
 */
export type SheetApi = {
  state: (companyId: string) => Promise<SheetState>;
  /** Makes the spreadsheet and brings the two in step for the first time. */
  link: (companyId: string) => Promise<SheetState>;
  /** Reads the sheet, takes in what changed there, and writes the list back. */
  sync: (companyId: string) => Promise<SheetState>;
  /** Stops keeping it. The spreadsheet stays in Drive. */
  unlink: (companyId: string) => Promise<SheetState>;
  /** Opens the spreadsheet in the browser; main holds its address. */
  open: (companyId: string) => Promise<void>;
};

/** Who this Caulder is: the name Today greets, and an invoice is from. */
export type MeApi = {
  get: () => Promise<string | null>;
  set: (name: string) => Promise<string | null>;
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
  /**
   * One contact into Google Contacts, which a phone's address book syncs
   * with. Saving it again updates it. Rejects with what to do when the script
   * is not connected, or has no People service.
   */
  saveContact: (leadId: string) => Promise<{ made: boolean }>;
  /** A fresh backup, copied to the "Caulder backups" folder in the person's own Drive. */
  backupToDrive: () => Promise<DriveBackup>;
  driveBackups: () => Promise<DriveBackups>;
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

/**
 * The desk widget: the day, resting on the desktop.
 *
 * `set` answers with the state rather than void for the same reason
 * `capture.set` does - the desktop level is a Win32 call that some machines
 * refuse, and a level you believe you are at and are not is worse than being
 * told. `reason` is non-null exactly when the desktop was asked for and
 * Windows would not give it.
 */
export type WidgetApi = {
  get: () => Promise<WidgetState>;
  /** Opens or closes it, and remembers which for next launch. */
  show: (on: boolean) => Promise<WidgetState>;
  setLevel: (level: WidgetLevel) => Promise<WidgetState>;
  /** The page saying how tall it is, so the window is never taller than what is in it. */
  fit: (height: number) => Promise<void>;
  /** Told when the pill grows into the panel, and when it shrinks back. */
  onOpen: (fn: (open: boolean) => void) => () => void;
  /** A press being dragged: main follows the cursor. Answers whether it moved, so a click can be told apart. */
  drag: (phase: "start" | "move" | "end") => Promise<boolean>;
  /** Opens Caulder on Today. */
  openApp: () => Promise<void>;
};

export type WidgetState = { on: boolean; level: WidgetLevel; reason: string | null };

/** What a pull from Google Contacts came back with. See services/gcontacts.ts. */
export type ContactsPull = {
  file: ChosenFile;
  /** People with no name at all - Google keeps contacts that are only an email. */
  skipped: number;
  /** False when the address book was longer than the script would read in one go. */
  complete: boolean;
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
  ) => Promise<{ task: Task | null; blocked: boolean; repeats: number; followUp: Task | null }>;
  update: (id: string, input: TaskInput) => Promise<Task>;
  complete: (id: string) => Promise<Task>;
  reopen: (id: string) => Promise<Task>;
  reschedule: (id: string, dueOn: string) => Promise<Task>;
  remove: (id: string) => Promise<void>;
};

/** The week, read from what is kept, and its three things (part eight, phase 35). */
export type WeekApi = {
  /** The week a day is in: what happened, what slipped, and the three. */
  review: (companyId: string, day: string) => Promise<WeekReview>;
  /** This week's three, for the head of Today. */
  things: (companyId: string) => Promise<WeekThing[]>;
  setThings: (companyId: string, input: WeekThingsInput) => Promise<WeekThing[]>;
  markThing: (id: string, done: boolean) => Promise<void>;
};

/** What stays true about a contact, said to the line (part twelve, phase 49). */
export type FactsApi = {
  list: (leadId: string) => Promise<Fact[]>;
  /** Kept on the contact; a birthday makes a task that comes back every year with it. */
  add: (companyId: string, input: FactInput) => Promise<{ facts: Fact[]; task: Task | null }>;
  remove: (id: string) => Promise<void>;
  /** Facts that end and have not yet, for a task planned for them before then. */
  away: (companyId: string, today: string) => Promise<{ leadId: string; text: string; until: string }[]>;
};

/**
 * Tune: what the quick-add line guessed at, and the answers given about it
 * (shared/tune.ts). Global: a slip is a slip in every company.
 */
/**
 * What the line learnt from being moved (shared/lessons.ts). Global, like Tune.
 */
/**
 * The notifications Caulder sends by itself (shared/nudges.ts): the journal
 * and the morning brief, each at an hour or off, and a test to prove Windows
 * lets them through.
 */
/**
 * What the quick line needs to mean what is already there, and the edits and
 * answers it gives (services/lines.ts, shared/lines.ts).
 */
export type LinesApi = {
  context: (companyId: string, today: string) => Promise<LineContext>;
  /** A task to a new day, and its hour with it. */
  move: (taskId: string, to: MoveInput) => Promise<{ task: Task; time: string | null }>;
  /** A task and its hour gone; what they were, for Undo. */
  cancel: (taskId: string) => Promise<TaskSnapshot>;
  restore: (companyId: string, snapshot: TaskSnapshot) => Promise<Task>;
  rename: (taskId: string, title: string) => Promise<Task>;
  answer: (companyId: string, question: Question) => Promise<Answer>;
};

export type NudgesApi = {
  get: () => Promise<NudgeSettings>;
  set: (settings: NudgeSettings) => Promise<NudgeSettings>;
  /** False when this machine cannot show notifications at all. */
  test: () => Promise<boolean>;
  /** A notification clicked: where it was about. */
  onGo: (fn: (place: "today") => void) => () => void;
};

/** Understanding, on this machine (PLAN.md, part five): the switch, and how far reading has got. */
export type UnderstandApi = {
  state: () => Promise<UnderstandState>;
  set: (on: boolean) => Promise<UnderstandState>;
  /** Read everything again, from the start. */
  again: () => Promise<UnderstandState>;
  /**
   * What a line's neighbours in meaning were filed as, for the line's second
   * opinion (shared/opinion.ts). None when understanding is off or the model
   * is not here, and the line reads by its rules alone.
   */
  read: (companyId: string, text: string) => Promise<Example[]>;
  /** *Not the same*: a memory the model marked said again is current again. */
  notTheSame: (memory: { pageId: string; raw: string }) => Promise<void>;
  /** What is near a page in meaning and not linked to it yet (phase 21). */
  related: (pageId: string) => Promise<Related[]>;
  /** Loose memories that sound like one of your pages, offered as a move (phase 21). */
  loose: (companyId: string) => Promise<LooseEnds>;
  /** The move, said yes to. */
  gather: (move: { to: string; lines: { pageId: string; raw: string }[] }) => Promise<void>;
  /** *Not these*: never offered again. */
  leave: (lines: { pageId: string; raw: string }[]) => Promise<void>;
};

export type LessonsApi = {
  list: () => Promise<Lesson[]>;
  /** A line moved to another part of life, or another kind, before it was kept. */
  add: (input: LessonInput) => Promise<Lesson[]>;
  remove: (id: string) => Promise<Lesson[]>;
};

/**
 * Mail accounts that are not the Google script (shared/mailaccounts.ts). The
 * password goes in once, on add, and no call hands it back.
 */
export type MailAccountsApi = {
  list: () => Promise<MailAccount[]>;
  /** Tried against the server first; nothing is saved if it will not sign in. */
  add: (input: MailAccountInput) => Promise<MailAccount[]>;
  remove: (id: string) => Promise<MailAccount[]>;
  setDefault: (id: string) => Promise<MailAccount[]>;
  /** Whether this account's inbox is asked who replied. On, it is tried first, and refused in a sentence if it cannot be opened. */
  readReplies: (id: string, on: boolean) => Promise<MailAccount[]>;
};

export type TuneApi = {
  /** The questions worth asking, and the answers that can be taken back. */
  get: () => Promise<TuneState>;
  /** What the line reads without comment, and what it never touches. */
  learned: () => Promise<Learned>;
  /** What a line that was just added had in it. Counted, nothing more. */
  seen: (input: SeenInput) => Promise<void>;
  /** "Keep as typed", pressed under the line. */
  keep: (input: { typed: string; as: string }) => Promise<Learned>;
  answer: (input: AnswerInput) => Promise<TuneState>;
  forget: (id: string) => Promise<TuneState>;
  /** Who a word means in this company, kept from an answer the line was given (part twelve, phase 48). */
  names: (companyId: string) => Promise<NameKept[]>;
  keepName: (companyId: string, input: NameInput) => Promise<NameKept[]>;
  forgetName: (id: string) => Promise<void>;
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
  /** How each template has done: sent, and answered. */
  templateStats: (companyId: string) => Promise<TemplateStats[]>;
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
  /** `store`: a Microsoft Store copy, whose data Windows removes when it is uninstalled. */
  paths: () => Promise<{ database: string; backups: string; logs: string; store: boolean }>;
  /** The folder every backup is also copied to, or null. */
  mirror: () => Promise<string | null>;
  /** Asks for a folder, copies a backup there at once, and keeps copying. Null if cancelled. */
  chooseMirror: () => Promise<string | null>;
  stopMirror: () => Promise<null>;
  /** Folders OneDrive, Dropbox or Google Drive keep in step here, each with where the copies would go (phase 24). */
  synced: () => Promise<SyncedFolder[]>;
  /** Copies backups into that service's folder, named rather than given as a path; one is copied at once. */
  useSynced: (id: SyncedFolder["id"]) => Promise<string>;
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
  notes: NotesApi;
  brain: BrainApi;
  google: GoogleApi;
  mail: MailApi;
  capture: CaptureApi;
  widget: WidgetApi;
  documents: DocumentsApi;
  deadlines: DeadlinesApi;
  metrics: MetricsApi;
  me: MeApi;
  sheet: SheetApi;
  room: RoomApi;
  fields: FieldsApi;
  tasks: TasksApi;
  tune: TuneApi;
  facts: FactsApi;
  week: WeekApi;
  lessons: LessonsApi;
  nudges: NudgesApi;
  understand: UnderstandApi;
  lines: LinesApi;
  mailAccounts: MailAccountsApi;
  board: BoardApi;
  email: EmailApi;
  data: DataApi;
};
