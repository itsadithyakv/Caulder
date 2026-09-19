import { useEffect, useState } from "react";
import { FilePlus2, Pin } from "lucide-react";
import { MenuButton } from "@/components/MenuButton";
import { sectionOf, templateOf, type BrainPageSummary, type BrainSectionId } from "@shared/brain";
import { EmptyState } from "@/components/EmptyState";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { relativeDay } from "@/lib/format";
import { SECTION_ICON } from "./sections";
import { DeadlinesPanel } from "@/features/deadlines/DeadlinesPanel";
import { DocumentsPanel } from "@/features/deadlines/DocumentsPanel";
import { PeoplePanel } from "@/features/people/PeoplePanel";
import { MetricsPanel } from "@/features/metrics/MetricsPanel";
import { DecisionLog } from "./DecisionLog";
import { StudiesPanel } from "@/features/life/StudiesPanel";
import { HobbiesPanel } from "@/features/life/HobbiesPanel";
import { GoalsPanel } from "@/features/life/GoalsPanel";

/**
 * The pages a section's panel already lists, left out of the list under it:
 * a course is in Studies' course list, a hobby in its bars, an entry in the
 * journal's month.
 */
const LISTED_BY_PANEL: Partial<Record<BrainSectionId, readonly string[]>> = {
  studies: ["course", "exam"],
  hobbies: ["hobby"],
  goals: ["life-goal"],
};

/**
 * One section: what belongs in it, the kinds of page it offers, and the pages
 * it has. A filter over the brain rather than a level of it - opening a page
 * from here is still one step from Brain.
 */
export function SectionView({
  companyId,
  section,
  focus,
  version,
  onOpen,
  onCreate,
  onOpenSection,
  onOpenContact,
  onChanged,
}: {
  companyId: string;
  section: BrainSectionId;
  /** Somebody to open straight away, in People. */
  focus: string | null;
  /** Bumped when pages change elsewhere, so the list is read again. */
  version: number;
  /** `editing` opens a page just made, ready to write. */
  onOpen: (pageId: string, editing?: boolean) => void;
  onOpenSection: (section: BrainSectionId, focus?: string) => void;
  onOpenContact: (leadId: string) => void;
  /** The filing calendar, the documents or the people changed, which the rail counts. */
  onChanged: () => void;
  /** `preset` is one of the template's starting points, when it has them. */
  onCreate: (template: string, preset?: string) => void;
}) {
  const [pages, setPages] = useState<BrainPageSummary[] | null>(null);
  const [archived, setArchived] = useState<BrainPageSummary[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  /** The rest of the section's prompt, past its first sentence. */
  const [more, setMore] = useState(false);
  /** A template whose starting points are on show. */
  const [choosing, setChoosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    Promise.all([
      window.caulder.brain.section(companyId, section, false),
      window.caulder.brain.section(companyId, section, true),
    ])
      .then(([current, old]) => {
        if (!live) return;
        setPages(current);
        setArchived(old);
      })
      .catch((cause: unknown) => setError(messageOf(cause)));
    return () => {
      live = false;
    };
  }, [companyId, section, version]);

  const info = sectionOf(section);
  const Icon = SECTION_ICON[section];
  // Some sections hold more than pages: the filing calendar, the documents, the people, the metrics,
  // and the founder's own four, which read their pages as a whole.
  const hasPanel =
    section === "tax" ||
    section === "documents" ||
    section === "people" ||
    section === "metrics" ||
    section in LISTED_BY_PANEL;
  const listed = LISTED_BY_PANEL[section] ?? [];
  const shownPages = (pages ?? []).filter((page) => !listed.includes(page.template));

  // One sentence says what the section is for; the rest - how its lines
  // become tasks, what reaches Today - is there when asked for.
  const split = /^(.*?[.!?])\s+(.*)$/s.exec(info.prompt);
  const lead = split?.[1] ?? info.prompt;
  const rest = split?.[2] ?? "";

  /** A kind of page, or its starting points when it has them. */
  const start = (id: string) => (templateOf(id).presets ? setChoosing((open) => (open === id ? null : id)) : onCreate(id));

  return (
    <div className="sectionview">
      <section className="card">
        <div className="sectionhead">
          <Icon size={20} className="sectionhead__icon" aria-hidden />
          <div className="sectionhead__text">
            <h2 className="sectionhead__title">{info.label}</h2>
            <p className="sectionhead__prompt">
              {lead}
              {rest && !more && (
                <>
                  {" "}
                  <button type="button" className="linkbtn" onClick={() => setMore(true)}>
                    More
                  </button>
                </>
              )}
              {more && ` ${rest}`}
            </p>
          </div>
          {/* One way to make a page: the kind a section has, or a menu of its kinds. */}
          <div className="sectionhead__new">
            {info.templates.length > 1 ? (
              <MenuButton
                label="New page"
                icon={<FilePlus2 size={14} aria-hidden />}
                className="btn btn--sm btn--primary"
                align="right"
                items={[
                  ...info.templates.map((id) => ({ label: templateOf(id).name, onSelect: () => start(id) })),
                  { label: "Blank page", hint: "A title and text, nothing else.", onSelect: () => onCreate("page") },
                ]}
              />
            ) : (
              <>
                {info.templates[0] && (
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    onClick={() => start(info.templates[0] as string)}
                  >
                    <FilePlus2 size={14} aria-hidden />
                    {templateOf(info.templates[0]).adds}
                  </button>
                )}
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => onCreate("page")}>
                  Blank page
                </button>
              </>
            )}
          </div>
        </div>
        {choosing && (
          <div className="tones anim-spring">
            <p className="tones__lead">Start from a tone. Every word of it is yours to change.</p>
            <div className="tones__grid">
              {(templateOf(choosing).presets ?? []).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="tone"
                  onClick={() => {
                    setChoosing(null);
                    onCreate(choosing, preset.id);
                  }}
                >
                  <span className="tone__name">{preset.label}</span>
                  <span className="tone__hint">{preset.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <ErrorLine>{error}</ErrorLine>

      {section === "tax" && (
        <DeadlinesPanel
          companyId={companyId}
          onOpenPage={onOpen}
          onOpenSection={onOpenSection}
          onChanged={onChanged}
        />
      )}
      {section === "people" && (
        <PeoplePanel companyId={companyId} focus={focus} onOpenContact={onOpenContact} onChanged={onChanged} />
      )}
      {section === "metrics" && <MetricsPanel companyId={companyId} onChanged={onChanged} />}
      {section === "documents" && (
        <DocumentsPanel companyId={companyId} onOpenContact={onOpenContact} onChanged={onChanged} />
      )}
      {section === "studies" && <StudiesPanel companyId={companyId} version={version} onOpen={onOpen} />}
      {section === "hobbies" && <HobbiesPanel companyId={companyId} version={version} onOpen={onOpen} />}
      {section === "goals" && <GoalsPanel companyId={companyId} version={version} onOpen={onOpen} />}

      {pages && pages.length === 0 ? (
        !hasPanel && (
          <EmptyState
            title={`Nothing in ${info.label} yet`}
            body="Pick a kind of page above. Each starts with the questions worth answering."
          />
        )
      ) : (
        <>
          {hasPanel && shownPages.length > 0 && (
            <h3 className="sectionview__pagesTitle">{section === "studies" ? "Notes and other pages" : "Pages"}</h3>
          )}
          {/* Decisions read as a log, newest first by the day decided. */}
          {section === "decisions" ? (
            <DecisionLog companyId={companyId} version={version} onOpen={onOpen} />
          ) : (
            <PageList pages={shownPages} onOpen={onOpen} label={`Pages in ${info.label}`} />
          )}
        </>
      )}

      {archived.length > 0 && (
        <div className="sectionview__archived">
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((open) => !open)}
          >
            {showArchived ? "Hide archived" : `Archived (${archived.length})`}
          </button>
          {showArchived && <PageList pages={archived} onOpen={onOpen} label={`Archived in ${info.label}`} />}
        </div>
      )}
    </div>
  );
}

export function PageList({
  pages,
  onOpen,
  label,
  showSection,
}: {
  pages: BrainPageSummary[];
  onOpen: (pageId: string) => void;
  label: string;
  showSection?: boolean;
}) {
  if (pages.length === 0) return null;
  return (
    <ul className="pagelist" aria-label={label}>
      {pages.map((page) => {
        const Icon = SECTION_ICON[page.section];
        return (
          <li key={page.id}>
            <button type="button" className="pagerow" onClick={() => onOpen(page.id)}>
              <span className="pagerow__main">
                <span className="pagerow__title">
                  {page.isPinned && <Pin size={12} className="pagerow__pin" aria-label="Pinned" />}
                  {page.title}
                </span>
                {page.excerpt && <span className="pagerow__excerpt">{page.excerpt}</span>}
              </span>
              <span className="pagerow__meta">
                {showSection && (
                  <span className="pagerow__section">
                    <Icon size={12} aria-hidden />
                    {sectionOf(page.section).label}
                  </span>
                )}
                <span>{relativeDay(page.updatedAt)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
