import { useState } from "react";
import { Archive, Check, Pencil, Trash2, X } from "lucide-react";
import { AccentPicker } from "@/components/AccentPicker";
import { useWorkspace } from "@/lib/workspace";
import { StageEditor } from "./StageEditor";
import { DataSafety } from "./DataSafety";
import { getTheme, setTheme, type ThemeChoice } from "@/lib/theme";
import type { AccentId, Company } from "@shared/domain";

const THEME_OPTIONS: { id: ThemeChoice; label: string }[] = [
  { id: "system", label: "Match system" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function SettingsScreen({ onAddCompany }: { onAddCompany: () => void }) {
  const { companies, activeCompany } = useWorkspace();
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme);

  function chooseTheme(next: ThemeChoice) {
    setTheme(next);
    setThemeState(next);
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="section-head">
          <h2 className="card__title">Companies</h2>
          <button type="button" className="btn btn--sm" onClick={onAddCompany}>
            Add a company
          </button>
        </div>

        <div className="companies">
          {companies.map((company) => (
            <CompanyRow key={company.id} company={company} canArchive={companies.length > 1} />
          ))}
        </div>
      </section>

      {/* Per company, and only where there is one to edit. The board reads
          straight from this list. */}
      {activeCompany && <StageEditor key={activeCompany.id} companyId={activeCompany.id} />}

      {activeCompany && (
        <DataSafety
          key={activeCompany.id}
          companyId={activeCompany.id}
          companyName={activeCompany.name}
        />
      )}

      <section className="card">
        <h2 className="card__title">Appearance</h2>
        <p className="card__hint">
          Match system follows Windows. The other two override it.
        </p>

        <div className="tabs settings__themes" role="tablist" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={theme === option.id}
              onClick={() => chooseTheme(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function CompanyRow({ company, canArchive }: { company: Company; canArchive: boolean }) {
  const { rename, setAccent, archive, remove } = useWorkspace();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(company.name);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Deleting is confirmed by typing the name, not by a second button. There is
  // no undo for it and no backup taken at the moment you press it, so the
  // gesture has to be one nobody performs by accident.
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  }

  async function saveName() {
    if (await run(() => rename(company.id, draft.trim()))) setEditing(false);
  }

  async function changeAccent(accent: AccentId) {
    await run(() => setAccent(company.id, accent));
  }

  return (
    <div className="company-row">
      <div className="company-row__main">
        {editing ? (
          <div className="company-row__edit">
            <input
              className={`input${error ? " input--invalid" : ""}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveName();
                if (event.key === "Escape") {
                  setDraft(company.name);
                  setError(null);
                  setEditing(false);
                }
              }}
              maxLength={80}
              autoFocus
              aria-label="Company name"
            />
            <button
              type="button"
              className="btn btn--sm btn--icon"
              onClick={() => void saveName()}
              aria-label="Save name"
            >
              <Check size={15} aria-hidden />
            </button>
            <button
              type="button"
              className="btn btn--sm btn--icon"
              onClick={() => {
                setDraft(company.name);
                setError(null);
                setEditing(false);
              }}
              aria-label="Cancel rename"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        ) : (
          <>
            <span className="company-row__name">{company.name}</span>
            <span className="company-row__meta">{company.timezone}</span>
            <button
              type="button"
              className="btn btn--sm btn--ghost btn--icon"
              onClick={() => setEditing(true)}
              aria-label={`Rename ${company.name}`}
            >
              <Pencil size={14} aria-hidden />
            </button>
          </>
        )}
      </div>

      <AccentPicker value={company.accent} onChange={(a) => void changeAccent(a)} />

      {/* Archiving the last company would leave the app with no workspace and
          bounce the user back to first-run, so it is withheld. */}
      {canArchive && !confirming && !deleting && (
        <>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setConfirming(true)}
          >
            <Archive size={14} aria-hidden />
            Archive
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost btn--danger"
            onClick={() => {
              setDeleting(true);
              setTyped("");
            }}
          >
            <Trash2 size={14} aria-hidden />
            Delete
          </button>
        </>
      )}

      {confirming && (
        <div className="company-row__confirm">
          <span className="company-row__meta">
            Hides it and frees the name. Leads are kept.
          </span>
          <button
            type="button"
            className="btn btn--sm btn--danger"
            onClick={() => void run(() => archive(company.id))}
          >
            Archive
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setConfirming(false)}
          >
            Keep
          </button>
        </div>
      )}

      {deleting && (
        <div className="company-row__confirm company-row__confirm--wide">
          <span className="company-row__meta">
            This deletes <strong>{company.name}</strong> and everything in it: every
            lead, every note and call you have logged, the tasks, the funnel, the
            templates and the email queue. It cannot be undone from inside Caulder
            &mdash; only by restoring a backup. Type the name to confirm.
          </span>
          <input
            className="input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={company.name}
            aria-label={`Type ${company.name} to confirm deleting it`}
            autoFocus
            autoComplete="off"
          />
          <div className="company-row__confirmActions">
            <button
              type="button"
              className="btn btn--sm btn--danger"
              disabled={typed.trim() !== company.name}
              onClick={() => void run(() => remove(company.id))}
            >
              Delete this company
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                setDeleting(false);
                setTyped("");
              }}
            >
              Keep it
            </button>
          </div>
        </div>
      )}

      {error && !editing && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
