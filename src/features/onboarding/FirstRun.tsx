import { useState, type FormEvent } from "react";
import { ImagePlus } from "lucide-react";
import { AccentPicker } from "@/components/AccentPicker";
import { useWorkspace } from "@/lib/workspace";
import {
  COMPANY_MODES,
  COMPANY_MODE_HINT,
  COMPANY_MODE_LABEL,
  COMPANY_MODE_STAGES,
  DEFAULT_ACCENT,
  companyInput,
  systemTimezone,
  type AccentId,
  type CompanyMode,
} from "@shared/domain";
import { messageOf } from "@/lib/errors";

/** The square the sidebar falls back to when there is no logo. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0] ?? "").slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

/** What the look-around company is called. Named for what it is. */
const SAMPLE_NAME = "Sample company";

/** How big the stored logo is, on its longest side. */
const LOGO_PX = 128;

/**
 * Reads a chosen image into a small square PNG data URL.
 *
 * Downscaled here rather than stored as chosen: a phone photograph is four
 * megabytes, and a four-megabyte string in a row that is read on every launch
 * is a slow app forever afterwards. A canvas does this with no dependency.
 */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("That does not look like an image."));
      image.onload = () => {
        const scale = Math.min(LOGO_PX / image.width, LOGO_PX / image.height, 1);
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("That image could not be resized."));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * First run. One name and one button; the funnel shape, the logo, the accent
 * and the timezone are folded away, because the timezone is already known
 * and the rest is changed in Settings whenever wanted.
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
  onCreated?: (sample: boolean) => void;
}) {
  const { companies, create, remove, refresh } = useWorkspace();

  const [name, setName] = useState("");
  const [accent, setAccent] = useState<AccentId>(DEFAULT_ACCENT);
  const [timezone] = useState(systemTimezone);
  const [mode, setMode] = useState<CompanyMode>("sales");
  const [logo, setLogo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickLogo(file: File | null) {
    if (!file) return;
    try {
      setLogo(await shrink(file));
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await createCompany(false);
  }

  /**
   * The real thing, or a look round.
   *
   * The sample exists so that somebody can see what the app is for before
   * they have built anything - six empty screens say nothing. It is its own
   * company, named for what it is, and it goes away on its own the moment a
   * real company is created, so nobody has to find and delete it. A real
   * company is never seeded.
   */
  async function createCompany(sample: boolean) {
    setError(null);

    const parsed = companyInput.safeParse({
      name: sample ? SAMPLE_NAME : name,
      accent,
      timezone,
      kind: "solo",
      mode,
      logo: sample ? null : logo,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details above.");
      return;
    }

    setBusy(true);
    try {
      const company = await create(parsed.data);
      if (sample && company) {
        await window.caulder.companies.seedDemo(company.id);
        // The workspace was read before the sample existed, so the sidebar
        // would otherwise open on "0 contacts" over a screen full of them.
        refresh();
      }
      if (!sample) {
        // The look-around company has done its job.
        for (const other of companies) {
          if (await window.caulder.companies.demoBatch(other.id)) await remove(other.id);
        }
      }
      onCreated?.(sample);
    } catch (cause) {
      setError(messageOf(cause));
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
          {onCancel ? "Add a company" : "Set up your company"}
        </h1>
        <p className="firstrun__body">
          Its contacts, deals, calendar and tasks all live here. A second company
          gets its own, and the sidebar switches between them.
        </p>

        <div className="field firstrun__wide">
          <label className="field__label" htmlFor="company-name">
            Company name
          </label>
          <input
            id="company-name"
            className={`input${error ? " input--invalid" : ""}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Northwind Studio"
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

        <details className="explain firstrun__more">
          <summary className="explain__summary">Funnel, logo, colour and timezone</summary>
          <div className="explain__body firstrun__moreBody">
        <div className="field firstrun__wide">
          <span className="field__label">What kind of work is this?</span>
          <div className="modes" role="radiogroup" aria-label="What kind of work is this">
            {COMPANY_MODES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                className="mode"
                onClick={() => setMode(option)}
                disabled={busy}
              >
                <span className="mode__name">{COMPANY_MODE_LABEL[option]}</span>
                <span className="mode__hint">{COMPANY_MODE_HINT[option]}</span>
                <span className="mode__stages">
                  {COMPANY_MODE_STAGES[option].map((stage) => stage.name).join(" → ")}
                </span>
              </button>
            ))}
          </div>
          <p className="card__hint">Only the funnel you start with. Change it in Settings any time.</p>
        </div>

        <div className="field">
          <span className="field__label">Logo</span>
          <div className="logopick">
            <span className="logopick__preview" aria-hidden>
              {logo ? (
                <img src={logo} alt="" className="logopick__img" />
              ) : (
                <span className="logopick__initials">{initials(name)}</span>
              )}
            </span>

            <div className="logopick__actions">
              <label className="btn btn--sm logopick__choose">
                <ImagePlus size={14} aria-hidden />
                {logo ? "Change" : "Choose an image"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="visually-hidden"
                  disabled={busy}
                  onChange={(event) => void pickLogo(event.target.files?.[0] ?? null)}
                />
              </label>
              {logo && (
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => setLogo(null)}
                  disabled={busy}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <p className="card__hint">Optional. Shown in the sidebar instead of the initials.</p>
        </div>

        <div className="field">
          <span className="field__label">Accent</span>
          <AccentPicker value={accent} onChange={setAccent} disabled={busy} />
        </div>

        <div className="field">
          <span className="field__label">Timezone</span>
          <p className="firstrun__tz">{timezone}</p>
          <p className="card__hint">From this computer. Due dates and quiet hours use it.</p>
        </div>
          </div>
        </details>

        <div className="firstrun__actions">
          {onCancel && (
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Creating" : "Create company"}
          </button>
          {!onCancel && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => void createCompany(true)}
            >
              Look around with sample data
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
