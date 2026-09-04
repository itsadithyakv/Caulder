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
  activeCompany: Company | null;
  /**
   * Returns the company that was created, which the caller needs in order to
   * do anything else to it - seeding the sample, for one - without a second
   * round trip to work out which of the list is new.
   */
  create: (input: CompanyInput) => Promise<Company | null>;
  rename: (id: string, name: string) => Promise<void>;
  setAccent: (id: string, accent: AccentId) => Promise<void>;
  archive: (id: string) => Promise<void>;
  /** Ends a workspace and everything in it. Archiving only hides one. */
  remove: (id: string) => Promise<void>;
  setActive: (id: string) => Promise<void>;
  retry: () => void;
  /** Re-reads the data without showing the loading screen. */
  refresh: () => void;
};

const Ctx = createContext<WorkspaceContext | null>(null);

/** IPC rejections arrive wrapped; this digs out the message worth showing. */
function messageOf(error: unknown): string {
  if (error instanceof Error) {
    // Electron prefixes the renderer-side error with the handler location.
    const match = /Error: (.*)$/m.exec(error.message);
    return (match?.[1] ?? error.message).trim();
  }
  return String(error);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Workspace>({
    companies: [],
    activeCompanyId: null,
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

  // The whole app re-tints from the active company's accent. Removing the
  // attribute when there is no company falls back to the default in tokens.css
  // rather than leaving the last company's colour on the first-run screen.
  useEffect(() => {
    const root = document.documentElement;
    if (activeCompany) root.setAttribute("data-accent", activeCompany.accent);
    else root.removeAttribute("data-accent");
  }, [activeCompany]);

  const value = useMemo<WorkspaceContext>(
    () => ({
      status,
      error,
      companies: state.companies,
      activeCompany,
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
    [status, error, state.companies, activeCompany, apply, load, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceContext {
  const context = useContext(Ctx);
  if (!context) throw new Error("useWorkspace used outside WorkspaceProvider");
  return context;
}
