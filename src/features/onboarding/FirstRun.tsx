import { useState, type FormEvent } from "react";
import { AccentPicker } from "@/components/AccentPicker";
import { useWorkspace } from "@/lib/workspace";
import {
  DEFAULT_ACCENT,
  companyInput,
  systemTimezone,
  type AccentId,
} from "@shared/domain";

/**
 * First run. Three fields on one screen, and the timezone is already filled in
 * from the system, so the shortest path to a usable app is typing a name and
 * pressing one button.
 *
 * Also reached from the switcher when adding a second company.
 */
export function FirstRun({
  onCancel,
  onCreated,
}: {
  onCancel?: () => void;
  /**
   * Fired only after the company is actually stored. The caller uses it to
   * leave this screen; without it, adding a second company succeeds but the
   * form stays up, which reads as the button having done nothing.
   */
  onCreated?: () => void;
}) {
  const { create, refresh } = useWorkspace();

  const [name, setName] = useState("");
  const [accent, setAccent] = useState<AccentId>(DEFAULT_ACCENT);
  const [timezone] = useState(systemTimezone);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // On by default. Six empty screens is the worst possible first impression of
  // an app whose every screen is about a list you have not built yet, and the
  // sample is one click to remove from Settings afterwards.
  const [withSample, setWithSample] = useState(true);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = companyInput.safeParse({ name, accent, timezone });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details above.");
      return;
    }

    setBusy(true);
    try {
      const company = await create(parsed.data);
      // Only on a genuine first run. Somebody adding a second workspace has
      // already seen what the app looks like full.
      if (withSample && !onCancel && company) {
        await window.caulder.companies.seedDemo(company.id);
        // The workspace was read before the sample existed, so the sidebar
        // would otherwise open on "0 leads" over a screen full of them.
        refresh();
      }
      onCreated?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="firstrun">
      {/* Carries the accent being chosen, so the button and the focus ring
          preview the new company rather than showing the colour of whichever
          company happens to be open behind this screen. */}
      <form
        className="firstrun__card card anim-modal"
        data-accent={accent}
        onSubmit={submit}
        noValidate
      >
        {!onCancel && <span className="brandmark firstrun__mark anim-mark" aria-hidden />}
        <h1 className="firstrun__title">
          {onCancel ? "Add a company" : "Set up your first company"}
        </h1>
        <p className="firstrun__body">
          A company is a workspace. It keeps its own leads, pipeline stages and
          email settings, and you switch between them from the sidebar.
        </p>

        <div className="field">
          <label className="field__label" htmlFor="company-name">
            Company name
          </label>
          <input
            id="company-name"
            className={`input${error ? " input--invalid" : ""}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Unifloe"
            autoFocus
            autoComplete="off"
            maxLength={80}
            disabled={busy}
            aria-describedby={error ? "company-name-error" : undefined}
          />
          {error && (
            <p className="field__error" id="company-name-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="field">
          <span className="field__label">Accent</span>
          <AccentPicker value={accent} onChange={setAccent} disabled={busy} />
          <p className="card__hint">
            Tells your companies apart at a glance. Status colours stay the same
            everywhere.
          </p>
        </div>

        {!onCancel && (
          <label className="field checkline">
            <input
              type="checkbox"
              className="tickbox"
              checked={withSample}
              onChange={(event) => setWithSample(event.target.checked)}
              disabled={busy}
              // Explicit, because the wrapping label also carries a paragraph
              // of explanation and the accessible name would swallow it.
              aria-label="Start with sample data"
            />
            <span className="checkline__text">
              <span className="checkline__title">Start with sample data</span>
              <span className="card__hint">
                Eight schools part-way through a funnel, with a call already
                overdue and one lead going quiet, so every screen has something
                on it. Remove it from Settings whenever you like.
              </span>
            </span>
          </label>
        )}

        <div className="field">
          <span className="field__label">Timezone</span>
          <p className="firstrun__tz">{timezone}</p>
          <p className="card__hint">
            Taken from this computer. Follow-up dates and quiet hours use it.
          </p>
        </div>

        <div className="firstrun__actions">
          {onCancel && (
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Creating" : "Create company"}
          </button>
        </div>
      </form>
    </div>
  );
}
