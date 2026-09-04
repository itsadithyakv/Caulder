import { useCallback, useEffect, useState } from "react";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { CompanySwitcher } from "./CompanySwitcher";
import { routeById, type RouteId } from "./routes";
import {
  getTheme,
  nextTheme,
  onSystemThemeChange,
  setTheme,
  type ThemeChoice,
} from "@/lib/theme";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { ComingSoon } from "@/components/ComingSoon";
import { ShortcutHelp } from "@/components/ShortcutHelp";
import { useShortcuts } from "@/lib/shortcuts";
import { FirstRun } from "@/features/onboarding/FirstRun";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import { LeadsScreen } from "@/features/leads/LeadsScreen";
import { ImportScreen } from "@/features/import/ImportScreen";
import { TodayScreen } from "@/features/today/TodayScreen";
import { PipelineScreen } from "@/features/pipeline/PipelineScreen";
import { EmailScreen } from "@/features/email/EmailScreen";

export function App() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}

function Shell() {
  const { status, error, activeCompany, companies, retry } = useWorkspace();

  const [route, setRoute] = useState<RouteId>("today");
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [addingCompany, setAddingCompany] = useState(false);
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme);
  const [overdueCount, setOverdueCount] = useState(0);
  // Set by the Leads screen when Today sends the user to a specific lead.
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // Bumped to ask the Leads screen to focus its search box or open its form.
  const [searchNonce, setSearchNonce] = useState(0);
  const [newLeadNonce, setNewLeadNonce] = useState(0);

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
    onRoute: setRoute,
    onSearch: () => {
      setRoute("leads");
      setSearchNonce((n) => n + 1);
    },
    onNewLead: () => {
      setRoute("leads");
      setNewLeadNonce((n) => n + 1);
    },
    onSwitchCompany: () => setSwitcherOpen((open) => !open),
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
            onCreated={() => setAddingCompany(false)}
            {...(companies.length > 0
              ? { onCancel: () => setAddingCompany(false) }
              : {})}
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
            onNavigate={setRoute}
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
            <div className="page-head">
              <div>
                <h1 className="page-head__title">{meta.label}</h1>
                <p className="page-head__sub">{meta.subtitle}</p>
              </div>
            </div>

            {route === "today" ? (
              <TodayScreen
                key={activeCompany?.id}
                onOpenLead={(leadId) => {
                  setOpenLeadId(leadId);
                  setRoute("leads");
                }}
                onGoToEmail={() => setRoute("email")}
              />
            ) : route === "settings" ? (
              <SettingsScreen onAddCompany={() => setAddingCompany(true)} />
            ) : route === "leads" ? (
              // Keyed on the company so switching workspaces resets the
              // filters and the open lead rather than carrying them across.
              <LeadsScreen
                key={activeCompany?.id}
                openLeadId={openLeadId}
                onConsumeOpenLead={() => setOpenLeadId(null)}
                searchNonce={searchNonce}
                newLeadNonce={newLeadNonce}
                onGoToImport={() => setRoute("import")}
              />
            ) : route === "pipeline" ? (
              <PipelineScreen
                key={activeCompany?.id}
                onOpenLead={(leadId) => {
                  setOpenLeadId(leadId);
                  setRoute("leads");
                }}
                onGoToSettings={() => setRoute("settings")}
              />
            ) : route === "email" ? (
              <EmailScreen key={activeCompany?.id} />
            ) : route === "import" ? (
              <ImportScreen
                key={activeCompany?.id}
                onGoToLeads={() => setRoute("leads")}
              />
            ) : (
              <ComingSoon route={route} />
            )}
          </div>
        </main>
      </div>

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
