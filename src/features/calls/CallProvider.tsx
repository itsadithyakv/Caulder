import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CallPrompter } from "./CallPrompter";

type CallOptions = {
  /** The task the call is being made for; hanging up ticks it off. */
  taskId?: string;
  /** Called once the call is written down, so the screen underneath can re-read. */
  onLogged?: () => void;
};

type StartCall = (leadId: string, options?: CallOptions) => void;

const StartCallContext = createContext<StartCall | null>(null);

/**
 * Lets any screen open the call prompter over the whole window.
 *
 * One prompter for the app rather than one per screen, so a call started from
 * Today and one started from a contact are the same thing, and a screen that
 * wants a Call button needs only the hook below.
 */
export function CallProvider({
  children,
  onOpenPage,
}: {
  children: ReactNode;
  /** "Edit the script" leaves the call for the script's page. */
  onOpenPage: (pageId: string) => void;
}) {
  const [call, setCall] = useState<{ leadId: string; options: CallOptions; key: number } | null>(null);
  const start = useCallback<StartCall>((leadId, options = {}) => {
    setCall({ leadId, options, key: Date.now() });
  }, []);

  return (
    <StartCallContext.Provider value={start}>
      {children}
      {call && (
        <CallPrompter
          key={call.key}
          leadId={call.leadId}
          taskId={call.options.taskId ?? null}
          onClose={() => setCall(null)}
          onLogged={() => {
            call.options.onLogged?.();
            setCall(null);
          }}
          onOpenPage={(pageId) => {
            setCall(null);
            onOpenPage(pageId);
          }}
        />
      )}
    </StartCallContext.Provider>
  );
}

/** Opens the prompter for a contact. Null outside the app's shell, where there is nothing to call from. */
export function useStartCall(): StartCall | null {
  return useContext(StartCallContext);
}
