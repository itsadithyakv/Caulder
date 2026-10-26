import { useUpdates } from "@/features/settings/UpdatesCard";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Sparkles, Rocket } from "lucide-react";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { CompanySwitcher } from "./CompanySwitcher";
import { Tour } from "@/components/Tour";
import { DEFAULT_ROUTE, routeById, type RouteId } from "./routes";
import {
  getTheme,
  nextTheme,
  onSystemThemeChange,
  setTheme,
  type ThemeChoice,
} from "@/lib/theme";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { ShortcutHelp } from "@/components/ShortcutHelp";
import { useShortcuts } from "@/lib/shortcuts";
import { FirstRun } from "@/features/onboarding/FirstRun";
import { TodayScreen } from "@/features/today/TodayScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SearchPalette } from "@/features/search/SearchPalette";
import { SetupScreen } from "@/features/onboarding/SetupScreen";
import { CallProvider } from "@/features/calls/CallProvider";
import type { SearchHit } from "@shared/search";
import type { BrainSectionId } from "@shared/brain";
import { OpenRefProvider } from "@/lib/navigate";
import type { LinkRef } from "@shared/links";

/**
 * Every screen but Today is read when it is first wanted, so a launch parses
 * Today and the shell and no more - and all of them are then read in the
 * background once Today has drawn (`warmScreens`), so the first visit to one
 * is as quick as the tenth.
 */
const loadMapOf = () => import("@/features/brain/MapOf").then((loaded) => ({ default: loaded.MapOf }));
const loadMemoriesScreen = () => import("@/features/brain/Memories").then((loaded) => ({ default: loaded.MemoriesScreen }));
const loadSettingsScreen = () => import("@/features/settings/SettingsScreen").then((loaded) => ({ default: loaded.SettingsScreen }));
const loadLeadsScreen = () => import("@/features/leads/LeadsScreen").then((loaded) => ({ default: loaded.LeadsScreen }));
const loadImportScreen = () => import("@/features/import/ImportScreen").then((loaded) => ({ default: loaded.ImportScreen }));
const loadPipelineScreen = () => import("@/features/pipeline/PipelineScreen").then((loaded) => ({ default: loaded.PipelineScreen }));
const loadDayScreen = () => import("@/features/day/DayScreen").then((loaded) => ({ default: loaded.DayScreen }));
const loadMoneyScreen = () => import("@/features/money/MoneyScreen").then((loaded) => ({ default: loaded.MoneyScreen }));
const loadBrainScreen = () => import("@/features/brain/BrainScreen").then((loaded) => ({ default: loaded.BrainScreen }));
const MapOf = lazy(loadMapOf);
const MemoriesScreen = lazy(loadMemoriesScreen);
const SettingsScreen = lazy(loadSettingsScreen);
const LeadsScreen = lazy(loadLeadsScreen);
const ImportScreen = lazy(loadImportScreen);
const PipelineScreen = lazy(loadPipelineScreen);
const DayScreen = lazy(loadDayScreen);
const MoneyScreen = lazy(loadMoneyScreen);
const BrainScreen = lazy(loadBrainScreen);
const ALL_SCREENS = [loadMapOf, loadMemoriesScreen, loadSettingsScreen, loadLeadsScreen, loadImportScreen, loadPipelineScreen, loadDayScreen, loadMoneyScreen, loadBrainScreen];

function warmScreens(): void {
  const idle = (window as { requestIdleCallback?: (run: () => void) => void }).requestIdleCallback ?? ((run: () => void) => setTimeout(run, 400));
  idle(() => {
    for (const load of ALL_SCREENS) void load();
  });
}

export function App() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}

function Shell() {
  const { status, error, activeCompany, companies, retry } = useWorkspace();

  const [route, setRoute] = useState<RouteId>(DEFAULT_ROUTE);
  // The other screens, read in the background once the first has drawn.
  useEffect(() => warmScreens(), []);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [addingCompany, setAddingCompany] = useState(false);
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme);
  const [overdueCount, setOverdueCount] = useState(0);
  // Set by the Leads screen when Today sends the user to a specific lead.
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  /** The name of the contact that is open, which titles the page instead of "Contacts". */
  const [contactTitle, setContactTitle] = useState<string | null>(null);
  // Set by search when it sends the user to a brain page.
  const [openPageId, setOpenPageId] = useState<string | null>(null);
  /** The brain section Today or search asked for - with a person to open, for People - kept until the brain has opened it. */
  const [openSectionId, setOpenSectionId] = useState<{ section: BrainSectionId } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const updates = useUpdates();
  /** The first-run tour: asked of the main process, which knows whether it has been. */
  const [touring, setTouring] = useState(false);
  useEffect(() => {
    window.caulder.app.tour().then(setTouring, () => setTouring(false));
  }, []);
  const endTour = useCallback(() => {
    setTouring(false);
    void window.caulder.app.tourDone();
  }, []);
  // Whether what is on screen is the look-around sample rather than anything
  // real. Asked of the database, because the sample is an import batch and
  // not a kind of company.
  const [sample, setSample] = useState(false);
  // Bumped to ask the Leads screen to focus its search box or open its form.
  const [searchNonce, setSearchNonce] = useState(0);
  const [newLeadNonce, setNewLeadNonce] = useState(0);
  /** Bumped when Contacts is chosen while already on it, so the list comes back. */
  const [listNonce, setListNonce] = useState(0);
  /** Bumped when Brain is chosen while already on it, so Brain home comes back. */
  const [brainHomeNonce, setBrainHomeNonce] = useState(0);
  /** A page of what was remembered, asked for from somewhere else: it opens on Memories. */
  const [memoriesPageId, setMemoriesPageId] = useState<string | null>(null);
  /** Bumped when Memories is chosen while already on it, so the list comes back. */
  const [memoriesNonce, setMemoriesNonce] = useState(0);
  /** A product Money should open, asked for by a link or a dot on the Map. */
  const [moneyProduct, setMoneyProduct] = useState<string | null>(null);
  /** A tab Money should open on, asked for from another screen. */
  const [moneyTab, setMoneyTab] = useState<string | null>(null);
  /** Bumped by the A key: Today's quick-add line takes the cursor when it changes. */
  const [quickNonce, setQuickNonce] = useState(0);

  /**
   * Every deliberate move, from the sidebar, a shortcut or another screen.
   *
   * Moving to another screen zeroes the counters. A screen is mounted afresh
   * on every visit and acts on any counter above zero, so a counter left at 1
   * would replay the old request on every later visit: pressing N once made
   * every trip to Contacts open the new-contact form, even one that Today sent
   * to a particular contact. The shortcuts bump their counter after calling
   * this, so theirs still arrives as 1.
   */
  const go = useCallback(
    (id: RouteId) => {
      if (id === route) {
        if (id === "leads") setListNonce((n) => n + 1);
        if (id === "brain") setBrainHomeNonce((n) => n + 1);
        if (id === "memories") setMemoriesNonce((n) => n + 1);
      } else {
        setSearchNonce(0);
        setNewLeadNonce(0);
        setListNonce(0);
        setBrainHomeNonce(0);
        setMemoriesNonce(0);
        setQuickNonce(0);
      }
      setRoute(id);
    },
    [route],
  );

  /**
   * A move to something in particular: a page, a contact, a person, a day.
   * The screen learns what to open from its own request, so arriving at the
   * screen already on show must not also send it home - that reset would land
   * after the request and undo it, leaving Brain home where Asha should be.
   */
  const arrive = useCallback(
    (id: RouteId) => {
      if (id !== route) go(id);
    },
    [route, go],
  );

  useEffect(() => {
    if (!activeCompany) return;
    window.caulder.companies
      .demoBatch(activeCompany.id)
      .then((batch) => setSample(batch !== null))
      .catch(() => setSample(false));
  }, [activeCompany]);

  // The sidebar badge is the one number visible from every screen, so it is
  // read whenever the route changes rather than only on Today - as a count,
  // not the whole of Today.
  useEffect(() => {
    if (!activeCompany) return;
    window.caulder.today
      .overdue(activeCompany.id)
      .then(setOverdueCount)
      .catch(() => setOverdueCount(0));
  }, [activeCompany, route]);

  // Only matters while the choice is "system": React needs to re-render so the
  // title bar icon follows the OS. The tokens themselves switch in CSS.
  useEffect(() => {
    if (theme !== "system") return;
    return onSystemThemeChange(() => setThemeState("system"));
  }, [theme]);

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = nextTheme(current);
      setTheme(next);
      return next;
    });
  }, []);

  useShortcuts({
    onRoute: go,
    onSearch: () => {
      go("leads");
      setSearchNonce((n) => n + 1);
    },
    onNewLead: () => {
      go("leads");
      setNewLeadNonce((n) => n + 1);
    },
    onSearchAll: () => {
      setSwitcherOpen(false);
      setSearchOpen((open) => !open);
    },
    onQuickAdd: () => {
      go("today");
      setQuickNonce((n) => n + 1);
    },
    onHelp: () => setHelpOpen((open) => !open),
    onEscape: () => {
      setHelpOpen(false);
      setSwitcherOpen(false);
      setSearchOpen(false);
    },
  });

  /**
   * A page, from anywhere: where it lives decides where it opens. What the
   * line was told to remember opens on Memories, among the rest of it;
   * every other page opens in the brain.
   */
  const openPage = useCallback(
    (pageId: string) => {
      window.caulder.brain.page(pageId).then(
        (page) => {
          if (page.section === "remembered") {
            setMemoriesPageId(pageId);
            arrive("memories");
          } else {
            setOpenPageId(pageId);
            arrive("brain");
          }
        },
        () => {
          setOpenPageId(pageId);
          arrive("brain");
        },
      );
    },
    [arrive],
  );

  // A notification clicked: whatever it was about is on Today.
  useEffect(() => window.caulder.nudges.onGo(() => arrive("today")), [arrive]);

  /** Where a search result lives: a page where its kind of page lives, everything else on a contact or Today. */
  const openHit = useCallback(
    (hit: SearchHit) => {
      setSearchOpen(false);
      if (hit.kind === "page") {
        openPage(hit.id);
      } else if (hit.leadId) {
        setOpenLeadId(hit.leadId);
        arrive("leads");
      } else {
        // A note: they live at the foot of Today.
        go("today");
      }
    },
    [arrive, openPage, go],
  );

  const consumeOpenPage = useCallback(() => setOpenPageId(null), []);
  const consumeMemoriesPage = useCallback(() => setMemoriesPageId(null), []);
  const consumeOpenSection = useCallback(() => setOpenSectionId(null), []);
  const consumeMoneyTab = useCallback(() => setMoneyTab(null), []);
  const consumeMoneyProduct = useCallback(() => setMoneyProduct(null), []);

  /** A section of the brain, from Today or search: the filing calendar, the documents, or somebody in People. */
  const openSection = useCallback(
    (section: BrainSectionId) => {
      setOpenSectionId({ section });
      arrive("brain");
    },
    [arrive],
  );

  /**
   * Whatever a link points at, opened where it lives: a page where its kind
   * of page lives, a contact on Contacts, a product on Money, a person or a
   * document in their brain section.
   */
  const openRef = useCallback(
    (ref: LinkRef) => {
      if (ref.kind === "page") openPage(ref.id);
      else if (ref.kind === "contact") {
        setOpenLeadId(ref.id);
        arrive("leads");
      } else if (ref.kind === "product") {
        setMoneyTab("products");
        setMoneyProduct(ref.id);
        arrive("money");
      } else openSection("documents");
    },
    [openPage, openSection, arrive],
  );

  const titleBar = <TitleBar theme={theme} onCycleTheme={cycleTheme} />;

  if (status === "loading") {
    return (
      <div className="shell">
        {titleBar}
        <div className="shell__solo">
          <p className="loading">
            <span className="brandmark loading__mark" aria-hidden />
            <span className="visually-hidden">Opening Caulder</span>
          </p>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="shell">
        {titleBar}
        <div className="shell__solo">
          <div className="empty">
            <p className="empty__title">Caulder could not read its database</p>
            <p className="empty__body">{error}</p>
            <button type="button" className="btn btn--primary" onClick={retry}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No company yet, or the user asked to add one. Both use the same form; the
  // difference is whether there is anything to go back to.
  if (companies.length === 0 || addingCompany) {
    return (
      <div className="shell">
        {titleBar}
        <div className="shell__solo">
          <FirstRun
            onCreated={(sample) => {
              setAddingCompany(false);
              // A look round goes straight to Today; a real company gets the
              // guide, because connecting Google and an AI is the one part of
              // this app that happens in somebody else's console.
              go(sample ? DEFAULT_ROUTE : "setup");
            }}
            {...(companies.length > 0 ? { onCancel: () => setAddingCompany(false) } : {})}
          />
        </div>
      </div>
    );
  }

  const meta = routeById(route);

  return (
    <OpenRefProvider open={openRef}>
    <CallProvider onOpenPage={openPage}>
    <div className="shell">
      {titleBar}

      <div className="shell__body">
        <div className="sidebar-wrap">
          <Sidebar
            current={route}
            onNavigate={go}
            company={activeCompany}
            switcherOpen={switcherOpen}
            onToggleSwitcher={() => setSwitcherOpen((open) => !open)}
            switcher={
              switcherOpen && (
                <CompanySwitcher onClose={() => setSwitcherOpen(false)} onAddCompany={() => setAddingCompany(true)} />
              )
            }
            overdueCount={overdueCount}
          />
        </div>

        <main className="main">
          <div className="main__inner anim-page" key={route}>
            {/* Only once a newer version is downloaded and waiting: before that there is nothing to do. */}
            {updates?.status === "ready" && (
              <div className="hintbar hintbar--sample" role="status">
                <Rocket size={16} className="hintbar__icon" aria-hidden />
                <p className="hintbar__text">Caulder {updates.version} is ready. It goes in when you next quit.</p>
                <button type="button" className="btn btn--sm btn--primary" onClick={() => void window.caulder.app.installUpdate()}>
                  Restart to update
                </button>
              </div>
            )}
            {/* On Today only: it is said once where the app opens, and not
                again above every screen somebody goes on to look round. */}
            {sample && route === "today" && (
              <div className="hintbar hintbar--sample">
                <Sparkles size={16} className="hintbar__icon" aria-hidden />
                <p className="hintbar__text">
                  This is sample data, here to show how the app works. It goes away on
                  its own when you set up your company.
                </p>
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  onClick={() => setAddingCompany(true)}
                >
                  Set up your company
                </button>
              </div>
            )}
            {/* On Today the hello is the title: two heavy lines, one saying "Today"
                and one saying hello, read as a stutter. The heading is still there
                for a screen reader - it is only not drawn. */}
            <div className={route === "today" ? "visually-hidden" : "page-head"}>
              <h1 className="page-head__title">{route === "leads" && contactTitle ? contactTitle : meta.label}</h1>
              {route === "import" && (
                <button type="button" className="btn btn--sm" onClick={() => go("leads")}>
                  <ArrowLeft size={15} aria-hidden />
                  All contacts
                </button>
              )}
              {/* Neither has a row of its own, so each keeps the way back to the brain it is part of. */}
              {(route === "map" || route === "memories") && (
                <button type="button" className="btn btn--sm" onClick={() => go("brain")}>
                  <ArrowLeft size={15} aria-hidden />
                  Brain
                </button>
              )}
            </div>

            <ErrorBoundary onHome={() => go("today")}>
            <Suspense fallback={null}>
            {route === "today" ? (
              <TodayScreen
                key={activeCompany?.id}
                onOpenLead={(leadId) => {
                  setOpenLeadId(leadId);
                  arrive("leads");
                }}
                onGoToDay={() => go("day")}
                onGoToMoney={() => go("money")}
                onGoTo={go}
                onOpenPage={openPage}
                onOpenSection={openSection}
                quickNonce={quickNonce}
              />
            ) : route === "settings" ? (
              <SettingsScreen onAddCompany={() => setAddingCompany(true)} onOpenSetup={() => go("setup")} />
            ) : route === "setup" ? (
              <SetupScreen
                key={activeCompany?.id}
                companyName={activeCompany?.name ?? "Caulder"}
                onGoTo={go}
                onDone={() => go(DEFAULT_ROUTE)}
              />
            ) : route === "leads" ? (
              // Keyed on the company so switching resets the filters and the
              // open lead rather than carrying them across.
              <LeadsScreen
                key={activeCompany?.id}
                openLeadId={openLeadId}
                onConsumeOpenLead={() => setOpenLeadId(null)}
                searchNonce={searchNonce}
                newLeadNonce={newLeadNonce}
                listNonce={listNonce}
                onGoToImport={() => go("import")}
                onGoToMoney={() => go("money")}
                onOpenPage={openPage}
                onTitle={setContactTitle}
              />
            ) : route === "pipeline" ? (
              <PipelineScreen
                key={activeCompany?.id}
                onOpenLead={(leadId) => {
                  setOpenLeadId(leadId);
                  arrive("leads");
                }}
                onGoToSettings={() => go("settings")}
              />
            ) : route === "money" ? (
              <MoneyScreen
                key={activeCompany?.id}
                onOpenPage={openPage}
                onOpenContact={(leadId) => {
                  setOpenLeadId(leadId);
                  arrive("leads");
                }}
                openTab={moneyTab}
                onConsumeTab={consumeMoneyTab}
                openProductId={moneyProduct}
                onConsumeProduct={consumeMoneyProduct}
              />
            ) : route === "day" ? (
              <DayScreen key={activeCompany?.id} onOpenPage={openPage} />
            ) : route === "memories" && activeCompany ? (
              <MemoriesScreen
                key={`memories-${activeCompany.id}`}
                companyId={activeCompany.id}
                openPageId={memoriesPageId}
                onConsumeOpenPage={consumeMemoriesPage}
                homeNonce={memoriesNonce}
                onOpenMap={() => go("map")}
                onOpenContact={(leadId) => {
                  setOpenLeadId(leadId);
                  arrive("leads");
                }}
              />
            ) : route === "map" && activeCompany ? (
              <MapOf
                key={`map-${activeCompany.id}`}
                companyId={activeCompany.id}
                onOpenPage={openPage}
                onOpenContact={(leadId) => {
                  setOpenLeadId(leadId);
                  arrive("leads");
                }}
              />
            ) : route === "brain" ? (
              <BrainScreen
                key={activeCompany?.id}
                openPageId={openPageId}
                onConsumeOpenPage={consumeOpenPage}
                openSection={openSectionId}
                onConsumeOpenSection={consumeOpenSection}
                homeNonce={brainHomeNonce}
                onOpenMemories={() => go("memories")}
                onGoToProducts={() => {
                  setMoneyTab("products");
                  go("money");
                }}
                onOpenContact={(leadId) => {
                  setOpenLeadId(leadId);
                  arrive("leads");
                }}
              />
            ) : (
              <ImportScreen key={activeCompany?.id} onGoToLeads={() => go("leads")} />
            )}
            </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {helpOpen && (
        <ShortcutHelp
          onClose={() => setHelpOpen(false)}
          onTour={() => {
            setHelpOpen(false);
            go("today");
            setTouring(true);
          }}
        />
      )}
      {/* After the first run and its setup guide, on Today, where the line is. */}
      {touring && route === "today" && <Tour onDone={endTour} />}
      {searchOpen && activeCompany && (
        <SearchPalette
          companyId={activeCompany.id}
          onOpen={openHit}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
    </CallProvider>
    </OpenRefProvider>
  );
}
