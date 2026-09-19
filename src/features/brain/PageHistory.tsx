import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { templateOf, type BrainPage, type BrainRevision } from "@shared/brain";
import { diffLines, type DiffLine } from "@shared/diff";
import { Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { formatDateTime } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * Every saved version of a page, and any two side by side.
 *
 * Saves a few minutes apart are one version (main folds them), so the list is
 * sittings rather than keystrokes. Putting an old version back makes it the
 * newest one, so nothing is ever lost by doing it.
 */
export function PageHistory({
  page,
  onRestored,
}: {
  page: BrainPage;
  onRestored: (page: BrainPage) => void;
}) {
  const [revisions, setRevisions] = useState<BrainRevision[] | null>(null);
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.brain
      .revisions(page.id)
      .then((list) => {
        if (!live) return;
        setRevisions(list);
        setAfter(String(list[0]?.revision ?? ""));
        setBefore(String(list[1]?.revision ?? list[0]?.revision ?? ""));
      })
      .catch((cause: unknown) => setError(messageOf(cause)));
    return () => {
      live = false;
    };
  }, [page.id, page.revision]);

  const older = revisions?.find((revision) => String(revision.revision) === before) ?? null;
  const newer = revisions?.find((revision) => String(revision.revision) === after) ?? null;
  const latest = revisions?.[0]?.revision;

  const rows = useMemo(() => (older && newer ? sideBySide(diffLines(older.body, newer.body)) : []), [older, newer]);

  if (!revisions) return <ErrorLine>{error}</ErrorLine>;

  const options = revisions.map((revision) => ({
    value: String(revision.revision),
    label: `${formatDateTime(revision.editedAt)}${revision.editedBy ? `, ${revision.editedBy}` : ""}${
      revision.concurrent ? ", at the same time" : ""
    }${revision.revision === latest ? " (now)" : ""}`,
  }));

  async function restore(revision: BrainRevision) {
    setBusy(true);
    setError(null);
    try {
      onRestored(await window.caulder.brain.restore(page.id, revision.revision));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card revisions" aria-label="Page history">
      <div className="section-head">
        <h2 className="card__title">History</h2>
        <span className="card__hint">
          {revisions.length === 1 ? "One version so far." : `${revisions.length} versions.`}
        </span>
      </div>

      <ErrorLine>{error}</ErrorLine>

      {revisions.length > 1 && (
        <>
          <div className="revisions__pick">
            <div className="field">
              <label className="field__label" htmlFor="revision-before">
                Compare
              </label>
              <Select id="revision-before" value={before} onChange={setBefore} options={options} disabled={busy} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="revision-after">
                With
              </label>
              <Select id="revision-after" value={after} onChange={setAfter} options={options} disabled={busy} />
            </div>
            {older && older.revision !== latest && (
              <button type="button" className="btn btn--sm" onClick={() => void restore(older)} disabled={busy}>
                <RotateCcw size={14} aria-hidden />
                Put the first one back
              </button>
            )}
          </div>

          {older && newer && <FieldChanges page={page} before={older} after={newer} />}

          {rows.length > 0 && older && newer && (
            <div className="diff" role="table" aria-label="What changed in the text">
              <div className="diff__row diff__row--head" role="row">
                <span role="columnheader">
                  {formatDateTime(older.editedAt)}
                  {older.editedBy ? `, ${older.editedBy}` : ""}
                </span>
                <span role="columnheader">
                  {formatDateTime(newer.editedAt)}
                  {newer.editedBy ? `, ${newer.editedBy}` : ""}
                </span>
              </div>
              {rows.map((row, index) => (
                <div key={index} className="diff__row" role="row">
                  <span role="cell" className={`diff__cell${row.left?.kind === "removed" ? " diff__cell--removed" : ""}`}>
                    {row.left?.kind === "removed" && <span className="visually-hidden">Removed: </span>}
                    {row.left?.text ?? ""}
                  </span>
                  <span role="cell" className={`diff__cell${row.right?.kind === "added" ? " diff__cell--added" : ""}`}>
                    {row.right?.kind === "added" && <span className="visually-hidden">Added: </span>}
                    {row.right?.text ?? ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** What changed above the text: the title and the fields, in words. */
function FieldChanges({ page, before, after }: { page: BrainPage; before: BrainRevision; after: BrainRevision }) {
  const template = templateOf(page.template);
  const changes: string[] = [];
  if (before.title !== after.title) changes.push(`Title: ${before.title} → ${after.title}`);
  for (const field of template.fields) {
    if (field.kind === "secret") {
      if (before.secrets[field.key] !== after.secrets[field.key]) {
        changes.push(`${field.label}: ${before.secrets[field.key] ?? "none"} → ${after.secrets[field.key] ?? "none"}`);
      }
      continue;
    }
    const was = before.fields[field.key] ?? null;
    const now = after.fields[field.key] ?? null;
    if (was !== now) changes.push(`${field.label}: ${describe(was)} → ${describe(now)}`);
  }
  if (changes.length === 0) return null;
  return (
    <ul className="revisions__changes">
      {changes.map((change) => (
        <li key={change}>{change}</li>
      ))}
    </ul>
  );
}

function describe(value: unknown): string {
  if (value === null || value === undefined || value === "") return "none";
  if (value === true) return "yes";
  return String(value);
}

type Row = { left: DiffLine | null; right: DiffLine | null };

/** A unified diff laid out in two columns, removed lines paired with the lines that replaced them. */
function sideBySide(lines: DiffLine[]): Row[] {
  const rows: Row[] = [];
  let removed: DiffLine[] = [];
  let added: DiffLine[] = [];

  const flush = () => {
    const count = Math.max(removed.length, added.length);
    for (let i = 0; i < count; i += 1) rows.push({ left: removed[i] ?? null, right: added[i] ?? null });
    removed = [];
    added = [];
  };

  for (const line of lines) {
    if (line.kind === "removed") removed.push(line);
    else if (line.kind === "added") added.push(line);
    else {
      flush();
      rows.push({ left: line, right: line });
    }
  }
  flush();
  return rows;
}
