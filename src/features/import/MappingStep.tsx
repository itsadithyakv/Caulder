import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  REQUIRED_COLUMNS,
  TEMPLATE_COLUMNS,
  type ChosenFile,
  type ColumnMapping,
  type TemplateColumn,
} from "@shared/import";

/**
 * Says which spreadsheet column means what.
 *
 * Caulder guesses first, and on the file this app was built for it guesses
 * every column right, so this screen is usually a glance and Continue. It
 * exists because the real file's headers ("School name", "Phone number") match
 * none of Caulder's own, and any other sheet will differ again.
 */
export function MappingStep({
  file,
  mapping,
  busy,
  onChange,
  onBack,
  onNext,
}: {
  file: ChosenFile;
  mapping: ColumnMapping;
  busy: boolean;
  onChange: (mapping: ColumnMapping) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const used = new Set(Object.values(mapping).filter(Boolean) as TemplateColumn[]);
  const missing = REQUIRED_COLUMNS.filter((column) => !used.has(column));

  return (
    <section className="card">
      <h2 className="card__title">Match the columns</h2>
      <p className="card__hint">
        {file.filename} &middot; {file.rowCount}{" "}
        {file.rowCount === 1 ? "row" : "rows"}. Anything set to Ignore is left
        out.
      </p>

      <div className="nm-well mapping__well">
        <table className="mapping">
          <thead>
            <tr>
              <th scope="col">Column in your file</th>
              <th scope="col">What it holds</th>
              <th scope="col">Import as</th>
            </tr>
          </thead>
          <tbody>
            {file.headers.map((header, index) => {
              const current = mapping[index] ?? null;
              return (
                <tr key={index}>
                  <td className="mapping__header">{header || <em>Column {index + 1}</em>}</td>
                  <td className="mapping__sample">
                    {/* What the first few rows actually contain, so the choice
                        is made against the data rather than the header. */}
                    {file.sample
                      .map((row) => row[index])
                      .filter((value) => value && value.length > 0)
                      .slice(0, 2)
                      .join(" · ") || <span className="leadrow__missing">Empty</span>}
                  </td>
                  <td>
                    <select
                      className="select"
                      aria-label={`Import ${header || `column ${index + 1}`} as`}
                      value={current ?? ""}
                      disabled={busy}
                      onChange={(event) => {
                        const next = event.target.value as TemplateColumn | "";
                        const updated: ColumnMapping = { ...mapping };
                        // A field can only come from one column, so choosing it
                        // here takes it from wherever it was.
                        if (next !== "") {
                          for (const key of Object.keys(updated)) {
                            if (updated[Number(key)] === next) updated[Number(key)] = null;
                          }
                        }
                        updated[index] = next === "" ? null : next;
                        onChange(updated);
                      }}
                    >
                      <option value="">Ignore this column</option>
                      {TEMPLATE_COLUMNS.map((column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {missing.length > 0 && (
        <p className="field__error" role="alert">
          Point a column at {missing.join(", ")} to continue. Everything else is
          optional.
        </p>
      )}

      <div className="leadform__actions">
        <button type="button" className="btn" onClick={onBack} disabled={busy}>
          <ArrowLeft size={15} aria-hidden />
          {/* Not "another file": this step is also reached by pasting, and
              the step it goes back to offers both. */}
          Start again
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={onNext}
          disabled={busy || missing.length > 0}
        >
          Preview {file.rowCount} {file.rowCount === 1 ? "row" : "rows"}
          <ArrowRight size={15} aria-hidden />
        </button>
      </div>
    </section>
  );
}
