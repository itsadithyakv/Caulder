import { useCallback, useEffect, useId, useState } from "react";
import { Copy, FileDown, FileUp, RefreshCw, Users } from "lucide-react";
import type { ImportOutcome, InvitationPreview, ShareState } from "@shared/share";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { relativeDay } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * Two founders, one brain: on Brain home, because it is the brain that is
 * shared. Through the Google script - the founder whose script it is shares
 * and sends an invitation, the other joins with it - or by passing a file.
 */
export function SharingCard({
  companyId,
  onGoToSettings,
  onChanged,
}: {
  companyId: string;
  onGoToSettings: () => void;
  /** Pages may have arrived: whatever shows them reads them again. */
  onChanged: () => void;
}) {
  const id = useId();
  const [state, setState] = useState<ShareState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [invitation, setInvitation] = useState("");
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [stopping, setStopping] = useState(false);

  const load = useCallback(() => {
    window.caulder.share.state(companyId).then(setState, (cause: unknown) => setError(messageOf(cause)));
  }, [companyId]);
  useEffect(load, [load]);

  async function run<T>(work: () => Promise<T>, after?: (result: T) => void) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      after?.(await work());
    } catch (cause) {
      setError(messageOf(cause));
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <ErrorLine>{error}</ErrorLine>;
  const shared = state.shared;

  const describeImport = (outcome: ImportOutcome) =>
    [
      outcome.added && `${outcome.added} added`,
      outcome.updated && `${outcome.updated} brought up to date`,
      outcome.kept && `${outcome.kept} kept as yours, being newer`,
      outcome.same && `${outcome.same} already the same`,
    ]
      .filter(Boolean)
      .join(", ") || "Nothing in it.";

  return (
    <Card icon={<Users size={15} aria-hidden />} title="Two founders">
      {shared ? (
        <>
          <p className="sharing__status">
            Shared as <strong>{shared.name}</strong>
            {shared.role === "owner" ? ", in your Google script." : ", in your co-founder's Google script."}{" "}
            {shared.lastSyncedAt ? `In step ${relativeDay(shared.lastSyncedAt).toLowerCase()}.` : "Not in step yet."}
            {shared.waiting > 0 && ` ${shared.waiting} ${shared.waiting === 1 ? "change" : "changes"} to send.`}
          </p>
          {shared.error && <ErrorLine>{shared.error}</ErrorLine>}
          <div className="actions">
            <button
              type="button"
              className="btn btn--sm"
              disabled={busy}
              onClick={() =>
                void run(
                  () => window.caulder.share.sync(companyId),
                  (next) => {
                    setState(next);
                    onChanged();
                  },
                )
              }
            >
              <RefreshCw size={14} aria-hidden />
              Bring in step now
            </button>
            {shared.role === "owner" && (
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => window.caulder.share.copyInvitation(companyId),
                    () => setNote("Copied. Send it to your co-founder: it opens this brain, and nothing else in your Google account."),
                  )
                }
              >
                <Copy size={14} aria-hidden />
                Copy the invitation
              </button>
            )}
            {stopping ? (
              <span className="detail__confirm">
                <span className="card__hint">
                  {shared.role === "owner" ? "Your co-founder's invitation stops working." : "Your pages stay here."}
                </span>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => window.caulder.share.stop(companyId),
                      (next) => {
                        setState(next);
                        setStopping(false);
                      },
                    )
                  }
                >
                  Stop sharing
                </button>
                <button type="button" className="btn btn--sm" onClick={() => setStopping(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setStopping(true)}>
                Stop sharing
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="card__hint">
            Share this brain with a co-founder: each of you works in your own Caulder, and changes cross every few
            minutes. A page you both change at once keeps both versions.
          </p>
          {!state.me ? (
            <div className="actions">
              <span className="card__hint">First, say who you are - every change carries your name.</span>
              <button type="button" className="btn btn--sm" onClick={onGoToSettings}>
                This is me, in Settings
              </button>
            </div>
          ) : joining ? (
            <form
              className="sharing__join"
              onSubmit={(event) => {
                event.preventDefault();
                if (preview) {
                  void run(
                    () => window.caulder.share.join(companyId, invitation),
                    (next) => {
                      setState(next);
                      setJoining(false);
                      onChanged();
                    },
                  );
                } else {
                  void run(() => window.caulder.share.preview(invitation), setPreview);
                }
              }}
            >
              <label className="field__label" htmlFor={`${id}-invite`}>
                The invitation your co-founder sent
              </label>
              <input
                id={`${id}-invite`}
                className="input"
                value={invitation}
                disabled={busy}
                placeholder="https://script.google.com/…#…"
                onChange={(event) => {
                  setInvitation(event.target.value);
                  setPreview(null);
                }}
              />
              {preview && (
                <p className="sharing__preview">
                  <strong>{preview.name}</strong>, shared by {preview.createdBy || "your co-founder"}, with {preview.pages}{" "}
                  {preview.pages === 1 ? "page" : "pages"}. Your own pages here join it.
                </p>
              )}
              <div className="actions">
                <button type="button" className="btn btn--sm" onClick={() => setJoining(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--sm btn--primary" disabled={busy || invitation.trim() === ""}>
                  {preview ? "Join it" : "Check the invitation"}
                </button>
              </div>
            </form>
          ) : (
            <div className="actions">
              <button
                type="button"
                className="btn btn--sm btn--primary"
                disabled={busy || !state.googleConnected}
                title={state.googleConnected ? undefined : "Connect Google first, in Settings: the brain lives in your script."}
                onClick={() =>
                  void run(
                    () => window.caulder.share.start(companyId),
                    (next) => {
                      setState(next);
                      onChanged();
                    },
                  )
                }
              >
                Share it
              </button>
              <button type="button" className="btn btn--sm" disabled={busy} onClick={() => setJoining(true)}>
                Join with an invitation
              </button>
            </div>
          )}
          {state.me && !state.googleConnected && !joining && (
            <p className="card__hint">Sharing lives in your Google script, so connect Google in Settings first. Joining needs only the invitation.</p>
          )}
        </>
      )}

      <div className="sharing__file">
        <span className="card__hint">Or pass the brain as a file: newer pages win, older ones are left alone.</span>
        <div className="actions">
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={busy}
            onClick={() =>
              void run(
                () => window.caulder.share.exportFile(companyId),
                (done) => done && setNote(`Saved: ${done.pages} ${done.pages === 1 ? "page" : "pages"}.`),
              )
            }
          >
            <FileDown size={14} aria-hidden />
            Save as a file
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={busy}
            onClick={() =>
              void run(
                () => window.caulder.share.importFile(companyId),
                (outcome) => {
                  if (!outcome) return;
                  setNote(describeImport(outcome));
                  onChanged();
                  load();
                },
              )
            }
          >
            <FileUp size={14} aria-hidden />
            Bring in a file
          </button>
        </div>
      </div>

      {note && (
        <p className="sharing__note" role="status">
          {note}
        </p>
      )}
      <ErrorLine>{error}</ErrorLine>
    </Card>
  );
}
