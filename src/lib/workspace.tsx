import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Workspace } from "@shared/ipc";
import type { AccentId, Company, CompanyInput } from "@shared/domain";
import { messageOf } from "./errors";

/**
 * Holds the companies and which one is open.
 *
 * Every mutating IPC call returns the whole Workspace, so this replaces its
 * state outright rather than patching a list in place. That removes the class
 * of bug where the sidebar, the switcher and the active id disagree after an
 * edit, at the cost of one extra query per action, which is free against a
 * local file.
 */

type Status = "loading" | "ready" | "failed";

type WorkspaceContext = {
  status: Status;
  error: string | null;
  companies: Company[];
  /** The company chosen in the sidebar: what Contacts, Deals, Money and Brain show. */
  activeCompany: Company | null;
  /**
   * Where your own things live - the journal, Life, habits, the vision board,
   * your level - whichever company is chosen. For most people, their one
   * company; for someone with a workspace of their own, that one.
   */
  home: Company | null;
  /**
   * Returns the company that was created, which the caller needs in order to
   * do anything else to it - seeding the sample, for one - without a second
   * round trip to work out which of the list is new.
   */
  create: (input: CompanyInput) => Promise<Company | null>;
  rename: (id: string, name: string) => Promise<void>;
  setAccent: (id: string, accent: AccentId) => Promise<void>;
  setCurrency: (id: string, currency: string) => Promise<void>;
  setCountry: (id: string, country: string) => Promise<void>;
  setTimezone: (id: string, timezone: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  /** Ends a workspace and everything in it. Archiving only hides one. */
  remove: (id: string) => Promise<void>;
  setActive: (id: string) => Promise<void>;
  retry: () => void;
  /** Re-reads the data without showing the loading screen. */
  refresh: () => void;
};

const Ctx = createContext<WorkspaceContext | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Workspace>({
    companies: [],
    activeCompanyId: null,
    homeCompanyId: null,
  });
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  /**
   * Re-reads the workspace.
   *
   * `loud` drives the first load and the retry button: it shows the loading
   * screen, which unmounts whatever is on top of it. A background refresh must
   * not do that - an import that finishes by refreshing the sidebar's lead
   * count would otherwise unmount its own results page mid-flow - so it leaves
   * the status alone and just swaps the data in.
   */
  const read = useCallback((loud: boolean) => {
    if (loud) {
      setStatus("loading");
      setError(null);
    }
    window.caulder.companies
      .list()
      .then((next) => {
        setState(next);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (!loud) return;
        setError(messageOf(cause));
        setStatus("failed");
      });
  }, []);

  const load = useCallback(() => read(true), [read]);
  const refresh = useCallback(() => read(false), [read]);

  useEffect(load, [load]);

  /**
   * Wraps a mutation so a rejection surfaces as a thrown error the calling
   * form can show inline, while the shared state only moves on success.
   */
  const apply = useCallback(async (run: () => Promise<Workspace>) => {
    try {
      const next = await run();
      setState(next);
      setError(null);
      return next;
    } catch (cause) {
      throw new Error(messageOf(cause));
    }
  }, []);

  const activeCompany = useMemo(
    () => state.companies.find((c) => c.id === state.activeCompanyId) ?? null,
    [state],
  );

  const home = useMemo(
    () => state.companies.find((c) => c.id === state.homeCompanyId) ?? activeCompany,
    [state, activeCompany],
  );

  // The app wears one face whichever company is chosen: coffee, set on the
  // page itself (index.html) so it is there before the first paint. A
  // company's own colour is its mark in the sidebar, not the whole window -
  // choosing a company is choosing what the company screens show, not
  // repainting your day.

  const value = useMemo<WorkspaceContext>(
    () => ({
      status,
      error,
      companies: state.companies,
      activeCompany,
      home,
      create: async (input) => {
        const next = await apply(() => window.caulder.companies.create(input));
        return next.companies.find((c) => c.id === next.activeCompanyId) ?? null;
      },
      rename: async (id, name) => {
        await apply(() => window.caulder.companies.rename(id, name));
      },
      setAccent: async (id, accent) => {
        await apply(() => window.caulder.companies.setAccent(id, accent));
      },
      setCurrency: async (id, currency) => {
        await apply(() => window.caulder.companies.setCurrency(id, currency));
      },
      setCountry: async (id, country) => {
        await apply(() => window.caulder.companies.setCountry(id, country));
      },
      setTimezone: async (id, timezone) => {
        await apply(() => window.caulder.companies.setTimezone(id, timezone));
      },
      archive: async (id) => {
        await apply(() => window.caulder.companies.archive(id));
      },
      remove: async (id) => {
        await apply(() => window.caulder.companies.remove(id));
      },
      setActive: async (id) => {
        await apply(() => window.caulder.companies.setActive(id));
      },
      retry: load,
      refresh,
    }),
    [status, error, state.companies, activeCompany, home, apply, load, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceContext {
  const context = useContext(Ctx);
  if (!context) throw new Error("useWorkspace used outside WorkspaceProvider");
  return context;
}
