import { useEffect, useState } from "react";
import { Check, FolderOpen, HardDrive } from "lucide-react";
import type { SyncedFolder } from "@shared/data";
import { Card } from "@/components/Card";
import { messageOf } from "@/lib/errors";

/**
 * A copy somewhere else, asked for on the first run (phase 24).
 *
 * Everything is one file on this computer, and a computer can be lost, and a
 * Store copy's folder goes when it is uninstalled. Caulder backs itself up on
 * every launch; pointing those backups at a folder OneDrive, Dropbox or
 * Google Drive keeps in step puts them somewhere else too, free, with no
 * account of Caulder's. Settings > Your data has the same, always.
 */
export function SafeCopy() {
  const [mirror, setMirror] = useState<string | null | undefined>(undefined);
  const [synced, setSynced] = useState<SyncedFolder[]>([]);
  const [store, setStore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([window.caulder.data.mirror(), window.caulder.data.synced(), window.caulder.data.paths()]).then(
      ([folder, found, paths]) => {
        if (!live) return;
        setMirror(folder);
        setSynced(found);
        setStore(paths.store);
      },
      () => live && setMirror(null),
    );
    return () => {
      live = false;
    };
  }, []);

  async function run(choose: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    try {
      const folder = await choose();
      if (folder) setMirror(folder);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  if (mirror === undefined) return null;

  return (
    <Card icon={<HardDrive size={15} aria-hidden />} title="Keep a copy off this computer" className="safecopy">
      <p className="card__hint">
        Everything is one file here, and Caulder backs it up every time it starts. Put those backups in a folder
        OneDrive, Dropbox or Google Drive keeps in step, and they live somewhere else too - free, and with no account of
        Caulder&rsquo;s.
        {store && " This copy came from the Microsoft Store, and Windows removes its own folder when it is uninstalled; a copy elsewhere is the way round that."}
      </p>

      {mirror ? (
        <p className="safecopy__done" role="status">
          <Check size={14} aria-hidden /> Backups are also copied to <strong>{mirror}</strong>.
        </p>
      ) : null}

      <div className="actions">
        {!mirror &&
          synced.map((each) => (
            <button
              key={each.id}
              type="button"
              className="btn btn--sm btn--primary"
              disabled={busy}
              title={each.folder}
              onClick={() => void run(() => window.caulder.data.useSynced(each.id))}
            >
              Keep a copy in {each.name}
            </button>
          ))}
        <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void run(() => window.caulder.data.chooseMirror())}>
          <FolderOpen size={14} aria-hidden />
          {mirror ? "Choose another folder" : synced.length > 0 ? "Choose a folder" : "Choose a folder to copy to"}
        </button>
      </div>
      {error && <p className="field__error">{error}</p>}
    </Card>
  );
}
