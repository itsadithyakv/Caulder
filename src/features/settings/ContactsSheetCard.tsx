import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Sheet } from "lucide-react";
import type { SheetState } from "@shared/sheet";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { useWorkspace } from "@/lib/workspace";
import { messageOf } from "@/lib/errors";
import { formatDateTime, numberText } from "@/lib/format";

/**
 * A company's contacts kept as a Google Sheet (shared/sheet.ts).
 *
 * The one way Caulder's contacts reach a phone: a spreadsheet in the person's
 * own Drive, a row a contact, that they can read and edit there. Caulder
 * takes in what was changed in the sheet and writes the list back, every few
 * minutes and when asked.
 *
 * Off until switched on, a company at a time, and it says what goes before
 * anything does: the contacts' names, how to reach them, where they came from
 * and notes - not their history, the money or the brain.
 */
export function ContactsSheetCard() {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;
  const [state, setState] = useState<SheetState | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  const look = useCallback(() => {
    if (!companyId) return;
    window.caulder.sheet.state(companyId).then(setState, () => setState(null));
  }, [companyId]);

  useEffect(look, [look]);
  // Connecting or updating the script happens on the card above this one.
  useEffect(() => {
    window.addEventListener("focus", look);
    return () => window.removeEventListener("focus", look);
  }, [look]);

  async function act(work: () => Promise<SheetState>) {
    setBusy(true);
    setProblem(null);
    try {
      setState(await work());
    } catch (cause) {
      setProblem(messageOf(cause));
      look();
    } finally {
      setBusy(false);
    }
  }

  if (!companyId || !state) return null;
  const name = activeCompany?.name ?? "this company";

  return (
    <Card
      title="Contacts in a Google Sheet"
      hint={`${name}'s contacts as a sheet in your own Drive.`}
    >
      <ErrorLine>{problem}</ErrorLine>

      {!state.linked ? (
        <>
          
          {state.blocked ? (
            <p className="card__hint" role="status">
              {state.blocked}
            </p>
          ) : (
            <div className="actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void act(() => window.caulder.sheet.link(companyId))}
              >
                <Sheet size={15} aria-hidden />
                {busy ? "Making the sheet" : "Keep them in a Google Sheet"}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="card__hint" role="status">
            {state.syncedAt
              ? `${numberText(state.count)} ${state.count === 1 ? "contact" : "contacts"} in the sheet, in step as of ${formatDateTime(state.syncedAt)}.`
              : "Not in step yet."}
            {state.changed + state.made > 0 &&
              ` Last time the sheet changed ${numberText(state.changed)} and added ${numberText(state.made)}.`}{" "}
            
          </p>

          {state.error && (
            <p className="field__error" role="alert">
              The last try did not go: {state.error}
            </p>
          )}
          {state.blocked && (
            <p className="card__hint" role="status">
              {state.blocked}
            </p>
          )}
          {state.problems.length > 0 && (
            <details className="explain">
              <summary className="explain__summary">
                {state.problems.length === 1 ? "One thing in the sheet was not taken in" : `${state.problems.length} things in the sheet were not taken in`}
              </summary>
              <ul className="explain__body">
                {state.problems.map((each) => (
                  <li key={each}>{each}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="actions">
            <button type="button" className="btn btn--primary" disabled={busy || state.blocked !== null} onClick={() => void act(() => window.caulder.sheet.sync(companyId))}>
              <RefreshCw size={15} aria-hidden />
              {busy ? "Bringing them in step" : "Sync now"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || state.syncedAt === null}
              onClick={() => void window.caulder.sheet.open(companyId).catch((cause: unknown) => setProblem(messageOf(cause)))}
            >
              <ExternalLink size={15} aria-hidden />
              Open the sheet
            </button>
            {stopping ? (
              <>
                <span className="card__hint">The sheet stays in your Drive as it is; Caulder stops reading and writing it.</span>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={busy}
                  onClick={() => {
                    setStopping(false);
                    void act(() => window.caulder.sheet.unlink(companyId));
                  }}
                >
                  Stop
                </button>
                <button type="button" className="btn" onClick={() => setStopping(false)}>
                  Keep it
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setStopping(true)}>
                Stop keeping it
              </button>
            )}
          </div>

          <p className="card__hint">
            The sheet wins a cell changed in both. Delete contacts in Caulder.
          </p>
        </>
      )}
    </Card>
  );
}
