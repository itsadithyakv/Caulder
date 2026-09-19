import { useCallback, useEffect, useState } from "react";
import { messageOf } from "./errors";

/**
 * One screen's data: fetched on mount, refetched after every change.
 *
 * Every screen wrote this by hand - a `useState(null)` for the data, another
 * for the error, a `load` in `useCallback`, an `act` that runs a change and
 * reloads - and each copy differed slightly, which is how three screens ended
 * up returning `null` while loading and never showing the error they had
 * stored. This is the one copy.
 *
 * `fetch` must be stable (wrap it in `useCallback`), because the hook reloads
 * whenever it changes. Pass `null` when there is nothing to fetch yet.
 *
 * Screens are rebuilt rather than patched after a change: completing an
 * overdue call empties one list and can add its lead to another, and
 * recomputing is both simpler and always right.
 */
export function useResource<T>(fetch: (() => Promise<T>) | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    if (!fetch) return;
    fetch()
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, [fetch]);

  useEffect(reload, [reload]);

  /** Runs a change, then reloads. A failure is shown rather than thrown. */
  const act = useCallback(
    async (run: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await run();
        reload();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  return { data, error, busy, reload, act, setError };
}
