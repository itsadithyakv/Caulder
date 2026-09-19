import { useCallback, useEffect, useState } from "react";
import { GraduationCap, Mountain, Palette } from "lucide-react";
import type { BrainSectionId } from "@shared/brain";
import { useWorkspace } from "@/lib/workspace";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { SectionView } from "@/features/brain/SectionView";
import { PageView } from "@/features/brain/PageView";
import { StudiesPanel } from "./StudiesPanel";
import { HobbiesPanel } from "./HobbiesPanel";
import { GoalsPanel } from "./GoalsPanel";
import { HabitsPanel } from "./HabitsPanel";
import { VisionBoard } from "./VisionBoard";
import { ProgressCards } from "./ProgressCards";

/**
 * Life (PLAN.md, part four): the founder's own, a key away. Habits, studies,
 * hobbies and goals, each a tab, and an overview - the vision board, your
 * level and the week across the four areas, achievements, then the exams
 * coming, how far along each goal is, and what the hobbies actually got.
 * Habits are ticked on Today; this is where they are made and looked back on.
 *
 * The pages are brain pages underneath - they link, they are searched, they
 * have a history - but they are opened here, with the way back to here,
 * because they are the person's and not the company's.
 */

type Tab = "overview" | "habits" | "studies" | "hobbies" | "goals";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "habits", label: "Habits" },
  { id: "studies", label: "Studies" },
  { id: "hobbies", label: "Hobbies" },
  { id: "goals", label: "Goals" },
];

const isTab = (value: string): value is Exclude<Tab, "overview"> =>
  value === "studies" || value === "hobbies" || value === "goals";

type View = { kind: "tab" } | { kind: "page"; id: string; editing: boolean };

export function LifeScreen({
  openPageId,
  onConsumeOpenPage,
  openTab,
  onConsumeOpenTab,
  homeNonce,
  onOpenPage,
  onOpenContact,
}: {
  /** One of your own pages, asked for from somewhere else: search, a link, the Calendar. */
  openPageId: string | null;
  onConsumeOpenPage: () => void;
  /** A tab another screen asked for: Habits, from Today. */
  openTab: "habits" | null;
  onConsumeOpenTab: () => void;
  /** Bumped when the Life row is pressed while already here: back to the tab. */
  homeNonce: number;
  /** A link on a page goes wherever what it points at lives. */
  onOpenPage: (pageId: string) => void;
  onOpenContact: (leadId: string) => void;
}) {
  // Yours, not the chosen company's: Life stays put when the company changes.
  const { home } = useWorkspace();
  const companyId = home?.id ?? null;
  const [tab, setTab] = useState<Tab>("overview");
  const [view, setView] = useState<View>({ kind: "tab" });
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const changed = useCallback(() => setVersion((n) => n + 1), []);

  useEffect(() => {
    if (!openPageId) return;
    const id = openPageId;
    onConsumeOpenPage();
    window.caulder.brain.page(id).then(
      (page) => {
        if (isTab(page.section)) setTab(page.section);
        setView({ kind: "page", id, editing: page.revision === 1 });
      },
      (cause: unknown) => setError(messageOf(cause)),
    );
  }, [openPageId, onConsumeOpenPage]);

  useEffect(() => {
    if (homeNonce > 0) setView({ kind: "tab" });
  }, [homeNonce]);

  useEffect(() => {
    if (!openTab) return;
    setTab(openTab);
    setView({ kind: "tab" });
    onConsumeOpenTab();
  }, [openTab, onConsumeOpenTab]);

  if (!companyId) return null;

  async function create(section: BrainSectionId, template: string) {
    setError(null);
    try {
      const page = await window.caulder.brain.create(companyId as string, section, template);
      setView({ kind: "page", id: page.id, editing: page.revision === 1 });
      changed();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  const openHere = (id: string, editing = false) => setView({ kind: "page", id, editing });
  const back = TABS.find((entry) => entry.id === tab)?.label ?? "Life";

  return (
    <div className="life">
      {view.kind === "tab" && (
        <div className="tabs tabs--line" role="tablist" aria-label="Life">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}

      <ErrorLine>{error}</ErrorLine>

      <div className="life__main anim-spring" key={view.kind === "page" ? view.id : tab}>
        {view.kind === "page" ? (
          <PageView
            key={view.id}
            companyId={companyId}
            pageId={view.id}
            startEditing={view.editing}
            version={version}
            backLabel={back}
            onBack={() => setView({ kind: "tab" })}
            onChanged={changed}
            onDeleted={() => setView({ kind: "tab" })}
            onOpenPage={onOpenPage}
            onOpenContact={onOpenContact}
          />
        ) : tab === "habits" ? (
          <HabitsPanel companyId={companyId} />
        ) : tab === "overview" ? (
          <Overview companyId={companyId} version={version} onOpen={openHere} onCreate={(section, template) => void create(section, template)} />
        ) : (
          <SectionView
            key={tab}
            companyId={companyId}
            section={tab}
            focus={null}
            version={version}
            onOpen={openHere}
            onCreate={(template) => void create(tab, template)}
            onOpenSection={(section) => (isTab(section) ? setTab(section) : undefined)}
            onOpenContact={onOpenContact}
            onChanged={changed}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Everything at once (phase 17): what the year is for, how it is going, and
 * then the exams coming, how far along each goal is, and the time the
 * hobbies got - or, with none of those yet, where to start.
 */
function Overview({
  companyId,
  version,
  onOpen,
  onCreate,
}: {
  companyId: string;
  version: number;
  onOpen: (pageId: string) => void;
  onCreate: (section: BrainSectionId, template: string) => void;
}) {
  const [empty, setEmpty] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      window.caulder.life.studies(companyId),
      window.caulder.life.hobbies(companyId),
      window.caulder.life.goals(companyId),
    ]).then(
      ([studies, hobbies, goals]) => live && setEmpty(studies.courses.length + studies.exams.length + hobbies.length + goals.length === 0),
      () => live && setEmpty(false),
    );
    return () => {
      live = false;
    };
  }, [companyId, version]);

  if (empty === null) return null;

  return (
    <div className="life__overview">
      <VisionBoard companyId={companyId} version={version} onOpenGoal={onOpen} />
      <ProgressCards companyId={companyId} version={version} />
      {empty ? (
        <Start onCreate={onCreate} />
      ) : (
        <>
          <StudiesPanel companyId={companyId} version={version} onOpen={onOpen} only="exams" />
          <GoalsPanel companyId={companyId} version={version} onOpen={onOpen} title="Goals" />
          <HobbiesPanel companyId={companyId} version={version} onOpen={onOpen} />
        </>
      )}
    </div>
  );
}

/** With no courses, hobbies or goals yet: the three ways in. */
function Start({ onCreate }: { onCreate: (section: BrainSectionId, template: string) => void }) {
  return (
    <section className="card life__start">
      <h2 className="card__title">Your own, beside the company</h2>
      <p className="card__hint">
        The courses you are taking and their exams, what you do for its own sake, and what you want from the year. Exams reach
        Today; hobbies get time on the Calendar; goals show how far along they are.
      </p>
      <div className="actions">
        <button type="button" className="btn btn--sm" onClick={() => onCreate("studies", "course")}>
          <GraduationCap size={14} aria-hidden />
          Add a course
        </button>
        <button type="button" className="btn btn--sm" onClick={() => onCreate("hobbies", "hobby")}>
          <Palette size={14} aria-hidden />
          Add a hobby
        </button>
        <button type="button" className="btn btn--sm" onClick={() => onCreate("goals", "life-goal")}>
          <Mountain size={14} aria-hidden />
          Add a goal
        </button>
      </div>
    </section>
  );
}
