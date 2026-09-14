import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Copy } from "lucide-react";
import {
  RESOLUTION_LABEL,
  type ImportPreview,
  type ImportRowResult,
  type Resolution,
} from "@shared/import";

const RESOLUTIONS: Resolution[] = ["skip", "fill", "overwrite", "create"];

/**
 * What Caulder made of the file, before anything is written.
 *
 * Three groups, in the order they need attention: duplicates first because
 * they are the only rows needing a decision, then errors, then the rows that
 * will simply be added.
 */
export function PreviewStep({
  preview,
  busy,
  onBack,
  onCommit,
}: {
  preview: ImportPreview;
  busy: boolean;
  onBack: () => void;
  onCommit: (resolutions: Record<number, Resolution>, campaignId: string | null) => void;
}) {
  // Skip is the default: doing nothing to an existing lead is the safe choice.
  const [resolutions, setResolutions] = useState<Record<number, Resolution>>({});
  // One answer for the whole file. Two hundred scraped schools are one push,
  // and a per-row picker is a question that never gets answered.

  const groups = useMemo(
    () => ({
      duplicates: preview.rows.filter((row) => row.status === "duplicate"),
      errors: preview.rows.filter((row) => row.status === "error"),
      valid: preview.rows.filter((row) => row.status === "valid"),
    }),
    [preview.rows],
  );

  const willMerge = groups.duplicates.filter(
    (row) => (resolutions[row.rowNumber] ?? "skip") === "fill" ||
      (resolutions[row.rowNumber] ?? "skip") === "overwrite",
  ).length;
  const willAdd =
    groups.valid.length +
    groups.duplicates.filter((row) => resolutions[row.rowNumber] === "create").length;

  function setAll(resolution: Resolution) {
    const next: Record<number, Resolution> = {};
    for (const row of groups.duplicates) next[row.rowNumber] = resolution;
    setResolutions(next);
  }

  return (
    <div className="import__preview">
      <section className="card">
        <h2 className="card__title">What this will do</h2>
        <p className="card__hint">
          {preview.filename} &middot; {preview.counts.total} rows read. Nothing
          is saved until you commit.
        </p>

        <div className="tally">
          <Tally label="To add" value={willAdd} tone="ok" />
          <Tally label="To merge" value={willMerge} tone="info" />
          <Tally
            label="Already here"
            value={groups.duplicates.length - willMerge - (willAdd - groups.valid.length)}
            tone="neutral"
          />
          <Tally label="Cannot read" value={groups.errors.length} tone="danger" />
        </div>
      </section>

      {groups.duplicates.length > 0 && (
        <section className="card">
          <div className="detail__bar">
            <h2 className="card__title">
              <Copy size={15} aria-hidden /> {groups.duplicates.length} already look
              familiar
            </h2>
            <div className="detail__barActions">
              <span className="card__hint">Apply to all:</span>
              {RESOLUTIONS.map((resolution) => (
                <button
                  key={resolution}
                  type="button"
                  className="btn btn--sm"
                  onClick={() => setAll(resolution)}
                  disabled={busy}
                >
                  {RESOLUTION_LABEL[resolution]}
                </button>
              ))}
            </div>
          </div>

          <ul className="dupes">
            {groups.duplicates.map((row) => (
              <DuplicateRow
                key={row.rowNumber}
                row={row}
                resolution={resolutions[row.rowNumber] ?? "skip"}
                busy={busy}
                onChange={(resolution) =>
                  setResolutions((current) => ({ ...current, [row.rowNumber]: resolution }))
                }
              />
            ))}
          </ul>
        </section>
      )}

      {groups.errors.length > 0 && (
        <section className="card">
          <h2 className="card__title">
            <AlertTriangle size={15} aria-hidden /> {groups.errors.length} cannot be read
          </h2>
          <p className="card__hint">
            These rows are left out. Fix them in the spreadsheet and import again
            if you need them.
          </p>
          <ul className="dupes">
            {groups.errors.map((row) => (
              <li key={row.rowNumber} className="dupe">
                <span className="dupe__row">Row {row.rowNumber}</span>
                <span className="leadrow__missing">{row.errors.join(" ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.valid.length > 0 && (
        <section className="card">
          <h2 className="card__title">
            <Check size={15} aria-hidden /> {groups.valid.length} new leads
          </h2>
          <div className="nm-well leadtable__well">
            <table className="leadtable mapping">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Contact</th>
                  <th scope="col">City</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {groups.valid.slice(0, 50).map((row) => (
                  <tr key={row.rowNumber} className="leadrow">
                    <td>
                      <span className="leadrow__name">{row.values?.name}</span>
                    </td>
                    <td>
                      {/* The chip is inline-flex, so it goes on a span rather
                          than on the cell itself, which must stay a table
                          cell to lay out. */}
                      <span className="leadrow__chip">
                        {row.values?.email ?? row.values?.phone ?? (
                          <span className="leadrow__missing">None</span>
                        )}
                      </span>
                    </td>
                    <td>{row.values?.city ?? <span className="leadrow__missing">&mdash;</span>}</td>
                    <td>
                      {row.values?.source ?? <span className="leadrow__missing">&mdash;</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {groups.valid.length > 50 && (
            <p className="card__hint">Showing the first 50 of {groups.valid.length}.</p>
          )}
        </section>
      )}

      <div className="leadform__actions">
        <button type="button" className="btn" onClick={onBack} disabled={busy}>
          <ArrowLeft size={15} aria-hidden />
          Back to columns
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onCommit(resolutions, null)}
          disabled={busy || (willAdd === 0 && willMerge === 0)}
        >
          Import {willAdd} {willAdd === 1 ? "lead" : "leads"}
          {willMerge > 0 ? `, merge ${willMerge}` : ""}
        </button>
      </div>
    </div>
  );
}

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "info" | "neutral" | "danger";
}) {
  return (
    <div className="tally__item">
      <span className={`tally__value tally__value--${tone}`}>{value}</span>
      <span className="tally__label">{label}</span>
    </div>
  );
}

function DuplicateRow({
  row,
  resolution,
  busy,
  onChange,
}: {
  row: ImportRowResult;
  resolution: Resolution;
  busy: boolean;
  onChange: (resolution: Resolution) => void;
}) {
  const match = row.match;
  if (!match) return null;

  const why =
    match.on === "email+name"
      ? "same email and a matching name"
      : match.on === "phone"
        ? "same phone and a matching name"
        : "same name and city";

  return (
    <li className="dupe">
      <div className="dupe__head">
        <span className="dupe__row">Row {row.rowNumber}</span>
        <span className="dupe__name">{row.values?.name}</span>
        <span className="dupe__why">
          matches {match.leadId ? match.leadName : `row ${match.rowNumber}`} &mdash; {why}
        </span>
      </div>

      {match.conflicts.length > 0 && (
        <dl className="conflicts">
          {match.conflicts.map((conflict) => (
            <div key={conflict.field} className="conflicts__row">
              <dt className="facts__label">{conflict.label}</dt>
              <dd className="conflicts__pair">
                <span className="conflicts__existing">{conflict.existing}</span>
                <span className="conflicts__arrow" aria-hidden>
                  →
                </span>
                <span className="conflicts__incoming">{conflict.incoming}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="tabs dupe__choice" role="radiogroup" aria-label={`Row ${row.rowNumber}`}>
        {RESOLUTIONS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            className="tab"
            aria-checked={resolution === option}
            aria-selected={resolution === option}
            disabled={busy}
            onClick={() => onChange(option)}
          >
            {RESOLUTION_LABEL[option]}
          </button>
        ))}
      </div>
    </li>
  );
}
