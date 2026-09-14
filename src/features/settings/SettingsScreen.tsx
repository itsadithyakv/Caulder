import { useEffect, useState, type ReactNode } from "react";
import { Archive, Check, Pencil, Trash2, X } from "lucide-react";
import { AccentPicker } from "@/components/AccentPicker";
import { Card } from "@/components/Card";
import { Explain } from "@/components/Explain";
import { ErrorLine } from "@/components/ErrorLine";
import { useWorkspace } from "@/lib/workspace";
import { StageEditor } from "./StageEditor";
import { DataSafety } from "./DataSafety";
import { FieldsCard, RemindersCard } from "./Workbench";
import { GoogleCard } from "./GoogleCard";
import { WordsCard } from "./WordsCard";
import { TemplatesCard } from "./TemplatesCard";
import { getTheme, setTheme, type ThemeChoice } from "@/lib/theme";
import { CURRENCIES, DEFAULT_CAPTURE_SHORTCUT, type AccentId, type Company } from "@shared/domain";
import { Select } from "@/components/Select";
import { messageOf } from "@/lib/errors";

const THEME_OPTIONS: { id: ThemeChoice; label: string }[] = [
  { id: "system", label: "Match system" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/**
 * Settings, in four groups: this company, how the planner reads you, what
 * sits on the desk, and the app itself. The rail on the left is the table of
 * contents.
 */
const GROUPS = [
  { id: "workspace", label: "Workspace" },
  { id: "planning", label: "Planning" },
  { id: "desk", label: "Desk" },
  { id: "app", label: "The app" },
] as const;

type GroupId = (typeof GROUPS)[number]["id"];

export function SettingsScreen({ onAddCompany }: { onAddCompany: () => void }) {
  const { companies, activeCompany } = useWorkspace();

  function jump(id: GroupId) {
    document.getElementById(`settings-${id}`)?.scrollIntoView({ block: "start" });
  }

  return (
    <div className="settings">
      <nav className="settings__rail" aria-label="Settings sections">
        {GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            className="settings__jump"
            onClick={() => jump(group.id)}
          >
            {group.label}
          </button>
        ))}
      </nav>

      <div className="settings__groups">
        <Group id="workspace" label="Workspace">
          <Card
            title="Companies"
            actions={
              <button type="button" className="btn btn--sm" onClick={onAddCompany}>
                Add a company
              </button>
            }
          >
            <div className="companies">
              {companies.map((company) => (
                <CompanyRow
                  key={company.id}
                  company={company}
                  canArchive={companies.length > 1}
                />
              ))}
            </div>
          </Card>

          {/* The board reads straight from this list. */}
          {activeCompany && (
            <>
              <StageEditor key={activeCompany.id} companyId={activeCompany.id} />
              <FieldsCard />
              <TemplatesCard key={`templates-${activeCompany.id}`} />
            </>
          )}
        </Group>

        <Group id="planning" label="Planning">
          <WordsCard />
          <RemindersCard />
        </Group>

        <Group id="desk" label="Desk">
          <CaptureCard />
          <GoogleCard />
        </Group>

        <Group id="app" label="The app">
          <AppearanceCard />
          {activeCompany && (
            <DataSafety
              key={activeCompany.id}
              companyId={activeCompany.id}
              companyName={activeCompany.name}
            />
          )}
        </Group>
      </div>
    </div>
  );
}

function Group({ id, label, children }: { id: GroupId; label: string; children: ReactNode }) {
  return (
    <section className="settings__group" id={`settings-${id}`} aria-labelledby={`settings-${id}-title`}>
      <h2 className="settings__groupTitle" id={`settings-${id}-title`}>
        {label}
      </h2>
      <div className="settings__cards">{children}</div>
    </section>
  );
}

function AppearanceCard() {
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme);

  function chooseTheme(next: ThemeChoice) {
    setTheme(next);
    setThemeState(next);
  }

  return (
    <Card title="Appearance" hint="Match system follows Windows. The other two override it.">
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
    </Card>
  );
}

function CompanyRow({ company, canArchive }: { company: Company; canArchive: boolean }) {
  const { rename, setAccent, setCurrency, archive, remove } = useWorkspace();

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
      setError(messageOf(cause));
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

      {/* Display only. Nothing is ever converted, so a total is a total of one
          thing; this is which thing. */}
      <Select
        compact
        aria-label={`Currency for ${company.name}`}
        value={company.currency}
        onChange={(code) => void run(() => setCurrency(company.id, code))}
        options={CURRENCIES.map((code) => ({ value: code as string, label: code as string }))}
      />

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

      {!editing && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}

/**
 * Quick add from anywhere: the tray icon, and the key.
 *
 * On from the start, because a key you have to find and switch on is a key
 * nobody uses - and the default is one that was checked free rather than
 * guessed. What is shown is what is actually held: another app may have got
 * to the combination first, and believing in a key you do not have is worse
 * than having none.
 */
function CaptureCard() {
  const [state, setState] = useState<{ accelerator: string; held: boolean; reason: string | null } | null>(null);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [keep, setKeep] = useState(true);

  async function load() {
    const now = await window.caulder.capture.get();
    setState(now);
    setDraft(now.accelerator);
  }

  useEffect(() => {
    void load();
    void window.caulder.capture.keepInTray().then(setKeep);
  }, []);

  async function apply(next: string) {
    setProblem(null);
    const outcome = await window.caulder.capture.set(next);
    if (!outcome.ok) setProblem(outcome.reason ?? "That combination could not be claimed.");
    await load();
  }

  async function chooseKeep(on: boolean) {
    setKeep(on);
    await window.caulder.capture.setKeepInTray(on);
  }

  const held = state?.held ? state.accelerator : "";

  return (
    <Card
      title="Quick add from anywhere"
      hint="A key that opens a small task window over whatever you are doing. The tray icon opens the same window."
    >
      <ErrorLine>{problem}</ErrorLine>

      <div className="actions">
        <input
          className="input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={DEFAULT_CAPTURE_SHORTCUT}
          aria-label="The quick-add key"
        />
        <button
          type="button"
          className="btn btn--sm btn--primary"
          disabled={draft.trim() === held}
          onClick={() => void apply(draft.trim())}
        >
          Claim it
        </button>
        {held !== DEFAULT_CAPTURE_SHORTCUT && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => {
              setDraft(DEFAULT_CAPTURE_SHORTCUT);
              void apply(DEFAULT_CAPTURE_SHORTCUT);
            }}
          >
            Use {DEFAULT_CAPTURE_SHORTCUT}
          </button>
        )}
        {held.length > 0 && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => {
              setDraft("");
              void apply("");
            }}
          >
            Turn it off
          </button>
        )}
      </div>

      <p className="card__hint">
        {state?.held
          ? `${state.accelerator} is held. Press it anywhere to add a task.`
          : state?.reason && !problem
            ? state.reason
            : "No key is set, so nothing is being taken from anything else. The tray icon still works."}
      </p>

      {/* `field` carries the display; `checkline` only sets its direction. */}
      <label className="field checkline">
        <input
          type="checkbox"
          className="tickbox"
          checked={keep}
          onChange={(event) => void chooseKeep(event.target.checked)}
          aria-label="Keep Caulder in the tray when its window is closed"
        />
        <span className="checkline__text">
          <span className="checkline__title">Keep Caulder in the tray when its window is closed</span>
          <span className="card__hint">
            So the key and the reminders keep working. Quit from the icon&rsquo;s menu.
          </span>
        </span>
      </label>

      <Explain label="What the window does">
        <p>
          Click the tray icon, or press the key, and a small window opens ready for a
          task &mdash; the same line as Today&rsquo;s, reading the same way. <kbd>Ctrl</kbd>+
          <kbd>N</kbd> switches it to a note. It closes as soon as the task is in, or
          when you click away.
        </p>
        <p>
          The key is on from the start because a key you have to find and switch on
          is a key nobody uses. If another app already holds it, this card says so
          rather than pretending it works.
        </p>
      </Explain>
    </Card>
  );
}
