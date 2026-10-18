import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, FolderInput, History, Pencil, Pin, PinOff, Sparkles, Trash2 } from "lucide-react";
import { memoriesOf } from "@shared/memories";
import { serviceOf, type AskState } from "@shared/ask";
import { tidiedBy, type Draft } from "@shared/propose";
import { sectionOf, templateOf, type BrainPage, type PageSaveInput } from "@shared/brain";
import { toggleTick } from "@shared/markdown";
import { refreshLabels, type LinkRef } from "@shared/links";
import { ErrorLine } from "@/components/ErrorLine";
import { MenuButton } from "@/components/MenuButton";
import { useOpenRef } from "@/lib/navigate";
import { messageOf } from "@/lib/errors";
import { inSentence, relativeDay } from "@/lib/format";
import { Markdown } from "./Markdown";
import { FieldEditor, FieldFacts, draftFrom, type FieldDraft, type SecretDraft } from "./PageFields";
import { PageHistory } from "./PageHistory";
import { SECTION_ICON } from "./sections";
// The editor is CodeMirror, the largest thing in the app, and only a page
// being written needs it: loaded then, not with every screen at start-up.
const LinkedEditor = lazy(() => import("./LinkedEditor").then((loaded) => ({ default: loaded.LinkedEditor })));
import { BrainLinks } from "./BrainLinks";
import { PageTasks } from "./PageTasks";
import { Tidied } from "./Proposals";
import { Sorting } from "./Sorting";

/** Sections whose `- [ ]` steps become tasks. */
const STEPPED = new Set(["meetings", "playbooks"]);

/**
 * One page of the brain: its fields, its text, what links here (phase 7) and
 * its history.
 *
 * Read by default, edited on purpose. Every save is a version, so the edit
 * form is a deliberate act with Save and Cancel rather than a field that
 * saves on every keystroke. Tick boxes are the exception: a playbook is
 * ticked while it is being followed, and each tick saves at once.
 */
export function PageView({
  pageId,
  startEditing,
  version,
  backLabel,
  onBack,
  onChanged,
  onDeleted,
  onOpenPage,
  onOpenContact,
}: {
  /** The page says which workspace it is in, so nothing here is told: a memory opened from a company's brain is still yours. */
  pageId: string;
  startEditing: boolean;
  /** Bumped when anything in the brain changes, so Linked here is read again. */
  version: number;
  onOpenPage: (pageId: string) => void;
  onOpenContact: (leadId: string) => void;
  backLabel: string;
  onBack: () => void;
  /** Something about the page changed: counts and lists elsewhere may be stale. */
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [page, setPage] = useState<BrainPage | null>(null);
  const [editing, setEditing] = useState(startEditing);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [fields, setFields] = useState<FieldDraft>({});
  const [secrets, setSecrets] = useState<SecretDraft>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "delete" | "leave">(null);
  const [history, setHistory] = useState(false);
  /** The AI that is connected, when one is: it can be asked to tidy this page. */
  const [ai, setAi] = useState<AskState | null>(null);
  /** The page tidied, as a draft beside the page: kept whole or thrown away (shared/propose.ts). */
  const [tidied, setTidied] = useState<Draft | null>(null);
  const [tidying, setTidying] = useState(false);
  /** The page's remembered lines being offered better homes (Sorting.tsx). */
  const [sorting, setSorting] = useState(false);
  const openRef = useOpenRef();

  useEffect(() => {
    window.caulder.ask.state().then(setAi, () => undefined);
  }, []);
  // A draft belongs to the page it was made from.
  useEffect(() => {
    setTidied(null);
    setSorting(false);
  }, [pageId]);

  const fill = useCallback((next: BrainPage) => {
    setPage(next);
    setTitle(next.title);
    // Links in the editor say what they point at now, not what they said when written.
    setBody(refreshLabels(next.body, Object.fromEntries(Object.entries(next.links).map(([key, value]) => [key, value.name]))));
    setFields(draftFrom(templateOf(next.template), next));
    setSecrets({});
  }, []);

  useEffect(() => {
    let live = true;
    window.caulder.brain
      .page(pageId)
      .then((next) => {
        if (live) fill(next);
      })
      .catch((cause: unknown) => setError(messageOf(cause)));
    return () => {
      live = false;
    };
  }, [pageId, fill]);

  if (!page) {
    return (
      <section className="card">
        <div className="empty">
          <p className="empty__title">{error ? "That page could not be opened" : "Loading"}</p>
          {error && <p className="empty__body">{error}</p>}
          <button type="button" className="btn" onClick={onBack}>
            {backLabel}
          </button>
        </div>
      </section>
    );
  }

  const template = templateOf(page.template);
  const section = sectionOf(page.section);
  const Icon = SECTION_ICON[page.section];

  const shownBody = refreshLabels(
    page.body,
    Object.fromEntries(Object.entries(page.links).map(([key, value]) => [key, value.name])),
  );

  const dirty =
    editing &&
    (title !== page.title ||
      body !== shownBody ||
      Object.values(secrets).some((value) => value !== "") ||
      JSON.stringify(fields) !== JSON.stringify(draftFrom(template, page)));

  async function run(work: () => Promise<BrainPage>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      fill(await work());
      after?.();
      onChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  function input(current: BrainPage, next: { title: string; body: string }): PageSaveInput {
    // An empty secret box is "not changed", never "cleared": only Remove clears.
    const touched = Object.fromEntries(Object.entries(secrets).filter(([, value]) => value !== ""));
    return { ...next, fields, secrets: touched, baseRevision: current.revision };
  }

  const save = (then?: () => void) =>
    run(
      () => window.caulder.brain.save(page.id, input(page, { title, body })),
      () => {
        setEditing(false);
        then?.();
      },
    );

  /**
   * A tick shows at once and is put back if the save fails. Ticks wait for
   * each other - the boxes are disabled while one saves - so the second never
   * starts from the revision the first is replacing.
   */
  async function tick(line: number) {
    const current = page!;
    const body = toggleTick(current.body, line);
    setPage({ ...current, body });
    setBusy(true);
    setError(null);
    try {
      fill(
        await window.caulder.brain.save(current.id, {
          title: current.title,
          body,
          fields: current.fields,
          secrets: {},
          baseRevision: current.revision,
        }),
      );
      onChanged();
    } catch (cause) {
      setPage(current);
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }


  /** Only this page goes, and nothing changes until the tidied one is kept. */
  async function tidy() {
    setTidying(true);
    setError(null);
    try {
      setTidied(await window.caulder.ask.proposeTidy(page!.companyId, page!.id));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setTidying(false);
    }
  }

  /** Kept whole, as a version like any other - so the page as it was is in History - and marked as tidied. */
  function keepTidied(draft: Draft) {
    const body = `${draft.text.trimEnd()}\n\n${tidiedBy(draft.sent.service, new Date().toLocaleDateString("en-CA"))}\n`;
    void run(
      () => window.caulder.brain.save(page!.id, { title: page!.title, body, fields: page!.fields, secrets: {}, baseRevision: page!.revision }),
      () => setTidied(null),
    );
  }

  function openLink(ref: LinkRef) {
    if (ref.kind === "page") onOpenPage(ref.id);
    else if (ref.kind === "contact") onOpenContact(ref.id);
    else openRef(ref);
  }

  function cancel() {
    fill(page!);
    setEditing(false);
    setConfirm(null);
  }

  function back() {
    if (dirty) setConfirm("leave");
    else onBack();
  }

  async function remove() {
    setBusy(true);
    try {
      await window.caulder.brain.remove(page!.id);
      onChanged();
      onDeleted();
    } catch (cause) {
      setError(messageOf(cause));
      setBusy(false);
    }
  }

  return (
    <div className="bpage">
      <div className="detail__bar">
        <button type="button" className="btn btn--sm" onClick={back}>
          <ArrowLeft size={15} aria-hidden />
          {backLabel}
        </button>

        {!editing && (
          <div className="detail__barActions">
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              aria-pressed={history}
              onClick={() => setHistory((open) => !open)}
            >
              <History size={14} aria-hidden />
              History
            </button>
            {confirm === "delete" ? (
              <span className="detail__confirm">
                <span className="card__hint">Deletes the page and every version of it.</span>
                <button type="button" className="btn btn--sm btn--danger" onClick={() => void remove()} disabled={busy}>
                  Delete
                </button>
                <button type="button" className="btn btn--sm" onClick={() => setConfirm(null)}>
                  Keep
                </button>
              </span>
            ) : (
              // What is done to a page now and then - pin it, put it away, delete it - is one click further in.
              <MenuButton
                label="More"
                className="btn btn--sm btn--ghost"
                align="right"
                disabled={busy}
                items={[
                  // Only where there is something to sort: three remembered lines or more.
                  ...(!page.isArchived && memoriesOf({ id: page.id, title: page.title, section: page.section, body: page.body }).length >= 3
                    ? [
                        {
                          label: "Sort this page",
                          hint: "Moves each line to where it belongs.",
                          icon: <FolderInput size={14} aria-hidden />,
                          onSelect: () => setSorting(true),
                        },
                      ]
                    : []),
                  ...(ai?.connected && !page.isArchived
                    ? [
                        {
                          label: tidying ? "Tidying…" : "Tidy with the AI",
                          hint: `Sends this page, and only this page, to ${serviceOf(ai.service)?.label ?? "the AI"}. Nothing changes until you keep it.`,
                          icon: <Sparkles size={14} aria-hidden />,
                          onSelect: () => void tidy(),
                        },
                      ]
                    : []),
                  ...(page.isArchived
                    ? []
                    : [
                        {
                          label: page.isPinned ? "Unpin" : "Pin",
                          hint: page.isPinned ? "Off the brain's home page." : "Kept at the top of the brain's home page.",
                          icon: page.isPinned ? <PinOff size={14} aria-hidden /> : <Pin size={14} aria-hidden />,
                          onSelect: () => void run(() => window.caulder.brain.pin(page.id, !page.isPinned)),
                        },
                      ]),
                  {
                    label: page.isArchived ? "Bring back" : "Archive",
                    hint: page.isArchived ? "Back in its section and in search." : "Out of the way and out of search, not deleted.",
                    icon: page.isArchived ? <ArchiveRestore size={14} aria-hidden /> : <Archive size={14} aria-hidden />,
                    onSelect: () => void run(() => window.caulder.brain.archive(page.id, !page.isArchived)),
                  },
                  {
                    label: "Delete",
                    hint: "The page and every version of it.",
                    icon: <Trash2 size={14} aria-hidden />,
                    danger: true,
                    onSelect: () => setConfirm("delete"),
                  },
                ]}
              />
            )}
            <button type="button" className="btn btn--sm btn--primary" onClick={() => setEditing(true)}>
              <Pencil size={14} aria-hidden />
              Edit
            </button>
          </div>
        )}
      </div>

      {confirm === "leave" && (
        <div className="hintbar" role="alert">
          <p className="hintbar__text">This page has changes that are not saved.</p>
          <button type="button" className="btn btn--sm btn--primary" onClick={() => void save(onBack)} disabled={busy}>
            Save them
          </button>
          <button type="button" className="btn btn--sm" onClick={onBack}>
            Discard
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setConfirm(null)}>
            Keep editing
          </button>
        </div>
      )}

      <ErrorLine>{error}</ErrorLine>

      {tidying && (
        <p className="card__hint" role="status">
          {serviceOf(ai?.service)?.label ?? "The AI"} is tidying this page…
        </p>
      )}
      {sorting && !editing && (
        <Sorting
          companyId={page.companyId}
          pageId={page.id}
          ai={ai}
          onClose={() => setSorting(false)}
          onMoved={() => {
            setSorting(false);
            void run(() => window.caulder.brain.page(page.id));
          }}
        />
      )}
      {tidied && !editing && <Tidied page={page} draft={tidied} busy={busy} onKeep={() => keepTidied(tidied)} onDiscard={() => setTidied(null)} />}

      <section className="card bpage__card">
        <div className="bpage__meta">
          <Icon size={14} aria-hidden />
          <span>
            {section.label} · {template.name}
          </span>
          {page.isArchived && <span className="badge badge--neutral">Archived</span>}
          {page.isPinned && <span className="badge badge--accent">Pinned</span>}
          <span className="bpage__updated">
            Updated {inSentence(relativeDay(page.updatedAt))}
            {page.updatedBy ? ` by ${page.updatedBy}` : ""}
          </span>
        </div>

        {editing ? (
          <form
            className="bpage__form anim-spring"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                void save();
              }
            }}
          >
            <div className="field">
              <label className="field__label" htmlFor="brain-title">
                Title
              </label>
              <input
                id="brain-title"
                className="input bpage__titleInput"
                value={title}
                maxLength={160}
                autoFocus={startEditing}
                disabled={busy}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <FieldEditor
              template={template}
              page={page}
              draft={fields}
              secrets={secrets}
              busy={busy}
              onField={(key, value) => setFields((current) => ({ ...current, [key]: value }))}
              onSecret={(key, value) =>
                setSecrets((current) => {
                  const next = { ...current };
                  if (value === undefined) delete next[key];
                  else next[key] = value;
                  return next;
                })
              }
            />

            <div className="field">
              <span className="field__label" aria-hidden>
                Page
              </span>
              <Suspense fallback={null}>
              <LinkedEditor
                label="Page"
                companyId={page.companyId}
                exclude={page.id}
                className="bpage__body"
                value={body}
                disabled={busy}
                onChange={setBody}
                names={page.links}
                onOpenLink={openLink}
                hint={
                  <>
                    <kbd>@</kbd> links a page or contact · <kbd>/</kbd> for headings, lists and steps · select words to
                    format them · <kbd>Ctrl</kbd> + <kbd>S</kbd> saves
                  </>
                }
              />
              </Suspense>
            </div>

            <div className="leadform__actions">
              <button type="button" className="btn" onClick={cancel} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={busy || title.trim().length === 0}>
                {busy ? "Saving" : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <h2 className="bpage__title anim-spring">{page.title}</h2>
            <FieldFacts template={template} page={page} />
            {page.body.trim().length > 0 ? (
              <Markdown
                source={page.body}
                links={page.links}
                onOpenLink={openLink}
                onTick={busy ? undefined : (line) => void tick(line)}
              />
            ) : (
              <p className="card__hint">Nothing written here yet.</p>
            )}
          </>
        )}
      </section>

      {/* A meeting's action items, a playbook's steps, and the steps on your own pages, as tasks. */}
      {!editing && STEPPED.has(page.section) && (
        <PageTasks pageId={page.id} revision={page.revision} section={page.section} onChanged={onChanged} />
      )}

      {!editing && (
        <BrainLinks
          companyId={page.companyId}
          kind="page"
          id={page.id}
          version={version}
          onOpenPage={onOpenPage}
          onOpenContact={onOpenContact}
        />
      )}

      {history && !editing && (
        <PageHistory
          page={page}
          onRestored={(restored) => {
            fill(restored);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
