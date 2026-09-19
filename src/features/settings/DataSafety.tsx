import { useCallback, useEffect, useState } from "react";
import { Bug, CloudUpload, Download, FolderOpen, RotateCcw, Save } from "lucide-react";
import type { BackupFile } from "@shared/data";
import { formatDateTime } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * Backup, restore and getting everything out.
 *
 * Caulder holds the user's only copy of their business data, on one machine,
 * with no cloud behind it. That is stated plainly here rather than left to be
 * discovered, and every answer to "what if this goes wrong" is a button rather
 * than a support article.
 */
export function DataSafety({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  /** The folder every backup is also copied to - one that syncs somewhere else - or null. */
  const [mirror, setMirror] = useState<string | null>(null);
  const [paths, setPaths] = useState<{ database: string; backups: string; logs: string } | null>(
    null,
  );
  const [confirming, setConfirming] = useState<string | null>(null);
  /** A problem report being read before it goes anywhere. */
  const [report, setReport] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([window.caulder.data.backups(), window.caulder.data.paths(), window.caulder.data.mirror()])
      .then(([list, where, folder]) => {
        setBackups(list);
        setPaths(where);
        setMirror(folder);
      })
      .catch((cause: unknown) =>
        setError(messageOf(cause)),
      );
  }, []);

  useEffect(load, [load]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">Your data</h2>
      <p className="card__hint">
        Everything lives in one file on this machine. Nothing is sent anywhere,
        which also means nothing is kept anywhere else &mdash; so a copy off this
        computer is worth having.
      </p>

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      <div className="import__start">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const outcome = await window.caulder.data.exportAll(companyId);
              if (outcome) {
                setMessage(
                  `${outcome.rows} rows and a copy of the database written to ${outcome.folder}`,
                );
                load();
              }
            })
          }
        >
          <Download size={15} aria-hidden />
          Export everything
        </button>

        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const taken = await window.caulder.data.backupNow();
              setMessage(
                taken.mirrored?.error
                  ? `Copied to ${taken.name} here, but not to ${taken.mirrored.folder}: ${taken.mirrored.error}`
                  : taken.mirrored
                    ? `Copied to ${taken.name}, here and in ${taken.mirrored.folder}`
                    : `Copied to ${taken.name}`,
              );
              load();
            })
          }
        >
          <Save size={15} aria-hidden />
          Back up now
        </button>

        {paths && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void window.caulder.data.revealFolder("backups")}
          >
            <FolderOpen size={15} aria-hidden />
            Open the backups folder
          </button>
        )}
      </div>

      {message && <p className="card__hint">{message}</p>}

      <h3 className="today__groupTitle datasafety__heading">Another copy, somewhere else</h3>
      <p className={`card__hint${mirror ? "" : " card__hint--warn"}`}>
        {mirror
          ? `Every backup is also copied to ${mirror}, and the ten newest are kept there too.`
          : "A backup on this computer does not survive this computer. Choose a folder that syncs - OneDrive, Google Drive, Dropbox - and every backup is copied there too."}
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const folder = await window.caulder.data.chooseMirror();
              if (folder) {
                setMirror(folder);
                setMessage(`A backup is in ${folder} now, and every one after it will be.`);
                load();
              }
            })
          }
        >
          <CloudUpload size={15} aria-hidden />
          {mirror ? "Choose another folder" : "Choose a folder"}
        </button>
        {mirror && (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setMirror(await window.caulder.data.stopMirror());
                setMessage("Backups stay on this computer only. What is already in the folder is left there.");
              })
            }
          >
            Stop copying there
          </button>
        )}
      </div>

      <h3 className="today__groupTitle datasafety__heading">
        Backups <span className="today__count">{backups.length}</span>
      </h3>
      <p className="card__hint">
        One is taken every time Caulder starts, and the ten most recent are kept.
        Restoring replaces everything with that copy &mdash; but the current
        state is saved aside first, so restoring the wrong one is itself
        undoable.
      </p>

      {backups.length === 0 ? (
        <p className="card__hint">No copies yet. One is taken on the next launch.</p>
      ) : (
        <ul className="batches">
          {backups.map((backup) => (
            <li key={backup.path} className="batch">
              <div className="batch__what">
                <span className="batch__name">{formatDateTime(backup.takenAt)}</span>
                <span className="batch__meta">
                  {backup.name} &middot; {formatSize(backup.size)}
                </span>
              </div>

              {confirming === backup.path ? (
                <span className="detail__confirm">
                  <span className="card__hint">Caulder will reload.</span>
                  <button
                    type="button"
                    className="btn btn--sm btn--danger"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setConfirming(null);
                        await window.caulder.data.restore(backup.name);
                      })
                    }
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => setConfirming(null)}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={busy}
                  onClick={() => setConfirming(backup.path)}
                >
                  <RotateCcw size={13} aria-hidden />
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {paths && (
        <p className="card__hint datasafety__where">
          The database is at <code>{paths.database}</code>. Copy that file
          somewhere else now and again, with Caulder closed.
        </p>
      )}

      <div className="actions">
        <span className="card__hint">
          When something goes wrong, Caulder writes it to a log.
        </span>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() =>
            void run(() => window.caulder.data.revealFolder("logs"))
          }
          disabled={busy}
        >
          <FolderOpen size={14} aria-hidden />
          Open the log folder
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          disabled={busy}
          onClick={() => void run(async () => setReport(await window.caulder.app.problemReport()))}
        >
          <Bug size={14} aria-hidden />
          Report a problem
        </button>
      </div>

      {report !== null && (
        <div className="problemreport">
          <p className="card__hint">
            This is everything in the report - nothing goes anywhere until you send it. Emails, phone numbers and your
            Windows name are taken out. Add what happened, then copy it or open it as an issue.
          </p>
          <textarea
            className="textarea problemreport__text"
            aria-label="The problem report"
            value={report}
            onChange={(event) => setReport(event.target.value)}
            rows={10}
          />
          <div className="actions">
            <button type="button" className="btn btn--sm" onClick={() => void navigator.clipboard.writeText(report).then(() => setMessage("The report is copied."))}>
              Copy it
            </button>
            <button type="button" className="btn btn--sm btn--primary" onClick={() => void window.caulder.app.openIssue(report)}>
              Open it as an issue on GitHub
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setReport(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      <p className="card__hint">Exports are per company. This one is {companyName}.</p>
    </section>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
