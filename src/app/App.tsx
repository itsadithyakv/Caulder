import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { CompanySwitcher } from "./CompanySwitcher";
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
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import { LeadsScreen } from "@/features/leads/LeadsScreen";
import { ImportScreen } from "@/features/import/ImportScreen";
import { TodayScreen } from "@/features/today/TodayScreen";
import { PipelineScreen } from "@/features/pipeline/PipelineScreen";
import { DayScreen } from "@/features/day/DayScreen";
import { MoneyScreen } from "@/features/money/MoneyScreen";

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
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [addingCompany, setAddingCompany] = useState(false);
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme);
  const [overdueCount, setOverdueCount] = useState(0);
  // Set by the Leads screen when Today sends the user to a specific lead.
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // Whether what is on screen is the look-around sample rather than anything
  // real. Asked of the database, because the sample is an import batch and
  // not a kind of company.
  const [sample, setSample] = useState(false);
  // Bumped to ask the Leads screen to focus its search box or open its form.
  const [searchNonce, setSearchNonce] = useState(0);
  const [newLeadNonce, setNewLeadNonce] = useState(0);
  /** Bumped when Contacts is chosen while already on it, so the list comes back. */
  const [listNonce, setListNonce] = useState(0);
  /** Bumped by the A key: Today's quick-add line takes the cursor when it changes. */
  const [quickNonce, setQuickNonce] = useState(0);

  /** Every deliberate move, from the sidebar, a shortcut or another screen. */
  const go = useCallback(
    (id: RouteId) => {
      if (id === "leads" && route === "leads") setListNonce((n) => n + 1);
      setRoute(id);
    },
    [route],
  );

  useEffect(() => {
    if (!activeCompany) return;
    window.caulder.companies
      .demoBatch(activeCompany.id)
      .then((batch) => setSample(batch !== null))
      .catch(() => setSample(false));
  }, [activeCompany]);

  // The sidebar badge is the one number visible from every screen, so it is
  // read whenever the route changes rather than only on Today.
  useEffect(() => {
    if (!activeCompany) return;
    window.caulder.today
      .get(activeCompany.id)
      .then((day) => setOverdueCount(day.overdue.length))
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
    onSwitchCompany: () => setSwitcherOpen((open) => !open),
    onQuickAdd: () => {
      go("today");
      setQuickNonce((n) => n + 1);
    },
    onHelp: () => setHelpOpen((open) => !open),
    onEscape: () => {
      setHelpOpen(false);
      setSwitcherOpen(false);
    },
  });

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
            onCreated={() => {
              setAddingCompany(false);
              go(DEFAULT_ROUTE);
            }}
            {...(companies.length > 0 ? { onCancel: () => setAddingCompany(false) } : {})}
          />
        </div>
      </div>
    );
  }

  const meta = routeById(route);

  return (
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
            overdueCount={overdueCount}
          />
          {switcherOpen && (
            <CompanySwitcher
              onClose={() => setSwitcherOpen(false)}
              onAddCompany={() => setAddingCompany(true)}
            />
          )}
        </div>

        <main className="main">
          <div className="main__inner anim-page" key={route}>
            {sample && (
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
            <div className="page-head">
              <h1 className="page-head__title">{meta.label}</h1>
              {route === "import" && (
                <button type="button" className="btn btn--sm" onClick={() => go("leads")}>
                  <ArrowLeft size={15} aria-hidden />
                  All contacts
                </button>
              )}
            </div>

            {route === "today" ? (
              <TodayScreen
                key={activeCompany?.id}
                onOpenLead={(leadId) => {
                  setOpenLeadId(leadId);
                  go("leads");
                }}
                onGoToDay={() => go("day")}
                onGoToMoney={() => go("money")}
                quickNonce={quickNonce}
              />
            ) : route === "settings" ? (
              <SettingsScreen onAddCompany={() => setAddingCompany(true)} />
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
              />
            ) : route === "pipeline" ? (
              <PipelineScreen
                key={activeCompany?.id}
                onOpenLead={(leadId) => {
                  setOpenLeadId(leadId);
                  go("leads");
                }}
                onGoToSettings={() => go("settings")}
              />
            ) : route === "money" ? (
              <MoneyScreen key={activeCompany?.id} />
            ) : route === "day" ? (
              <DayScreen key={activeCompany?.id} />
            ) : (
              <ImportScreen key={activeCompany?.id} onGoToLeads={() => go("leads")} />
            )}
          </div>
        </main>
      </div>

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
