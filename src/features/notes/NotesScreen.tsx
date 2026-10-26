import { useCallback, useEffect, useState } from "react";
import { CheckSquare, FolderInput, Pin, PinOff, Search, Trash2 } from "lucide-react";
import { BRAIN_SECTION_LIST, sectionOf, type BrainPage, type BrainSectionId } from "@shared/brain";
import { Select } from "@/components/Select";
import { Card } from "@/components/Card";
import type { Note } from "@shared/domain";
import { useWorkspace } from "@/lib/workspace";
import { relativeDay } from "@/lib/format";
import { taskInput } from "@shared/domain";
import { today as todayIn } from "@shared/dates";
import { messageOf } from "@/lib/errors";
import { notesLines } from "./lines";

/**
 * The notes at the foot of Today: what was caught and not yet filed.
 *
 * There is no box to write in here. The quick line on Today already keeps a
 * note - "note:" says so outright, and a line it cannot place becomes one -
 * and the capture key does it from any app. A second box a screen below the
 * first was two ways to do one thing, and the lower one was the one nobody
 * needed. What is left is the other half: finding a note again and moving it
 * on, to a task or into the brain.
 *
 * With nothing caught it draws nothing at all. An empty card with a joke in
 * it is still a card the eye has to step over on the way to the work.
 */

/** Past this many, a search box earns its place; below it, the list is the search. */
const SEARCH_FROM = 6;

export function NotesScreen({
  onTasksChanged,
  onOpenPage,
}: {
  onTasksChanged?: () => void;
  /** Opens a brain page, after a note has been filed as one. */
  onOpenPage?: (pageId: string) => void;
}) {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** What it says when a search finds nothing: a different line each time Notes is opened. */
  const [lines] = useState(notesLines);
  /** The last note made into a task, for as long as Undo is offered. */
  const [madeTask, setMadeTask] = useState<{ taskId: string; body: string; pinned: boolean } | null>(
    null,
  );

  /** The note being filed, and where to. */
  const [filing, setFiling] = useState<string | null>(null);
  const [fileTo, setFileTo] = useState<BrainSectionId>("ideas");
  /** The last note filed as a page, for as long as Undo is offered. */
  const [filed, setFiled] = useState<{ page: BrainPage; body: string; pinned: boolean } | null>(null);

  useEffect(() => {
    if (!madeTask) return;
    const timer = setTimeout(() => setMadeTask(null), 10_000);
    return () => clearTimeout(timer);
  }, [madeTask]);

  useEffect(() => {
    if (!filed) return;
    const timer = setTimeout(() => setFiled(null), 10_000);
    return () => clearTimeout(timer);
  }, [filed]);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      setNotes(await window.caulder.notes.list(companyId, search));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, [companyId, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(async (work: () => Promise<Note[]>) => {
    setError(null);
    try {
      setNotes(await work());
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  if (!companyId) return null;

  /**
   * The note goes only once the task exists, so a failed create loses
   * nothing, and Undo puts both back the way they were.
   */
  async function makeTask(note: Note) {
    setError(null);
    try {
      const task = await window.caulder.tasks.create(
        companyId!,
        taskInput.parse({
          title: note.body.slice(0, 200),
          dueOn: todayIn(activeCompany?.timezone ?? "UTC"),
          kind: "todo",
        }),
      );
      setNotes(await window.caulder.notes.remove(note.id, companyId!));
      setMadeTask({ taskId: task.id, body: note.body, pinned: note.isPinned });
      onTasksChanged?.();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  /**
   * A thought worth keeping becomes a page in the brain. Main writes the page
   * before letting the note go, and Undo puts the note back as it was.
   */
  async function fileNote(note: Note) {
    setError(null);
    try {
      const page = await window.caulder.brain.fileNote(note.id, fileTo);
      setFiling(null);
      setFiled({ page, body: note.body, pinned: note.isPinned });
      setNotes(await window.caulder.notes.list(companyId!, search));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function undoFile() {
    if (!filed) return;
    const { page, body: text, pinned } = filed;
    setFiled(null);
    await act(async () => {
      await window.caulder.brain.remove(page.id);
      let restored = await window.caulder.notes.create(companyId!, text);
      const again = restored.find((candidate) => candidate.body === text);
      if (pinned && again) restored = await window.caulder.notes.pin(again.id, true, companyId!);
      return restored;
    });
  }

  async function undoTask() {
    if (!madeTask) return;
    const { taskId, body: text, pinned } = madeTask;
    setMadeTask(null);
    await act(async () => {
      await window.caulder.tasks.remove(taskId);
      let restored = await window.caulder.notes.create(companyId!, text);
      const again = restored.find((candidate) => candidate.body === text);
      if (pinned && again) restored = await window.caulder.notes.pin(again.id, true, companyId!);
      return restored;
    });
    onTasksChanged?.();
  }

  // Nothing caught and nothing being looked for: no card. An Undo still on
  // offer keeps it, so the last note moved on can be put back.
  const searching = search.length > 0;
  if (notes.length === 0 && !searching && !madeTask && !filed && !error) return null;

  return (
    <Card title="Notes" hint={<>Kept to file later. To add one, start a line above with <kbd>note:</kbd></>}>
      <div className="notes">
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}

        {/* Once the search is in use it stays, whatever it narrows the list to. */}
        {(searching || notes.length >= SEARCH_FROM) && (
          <div className="notes__search">
            <Search size={16} className="notes__searchIcon" aria-hidden />
            <input
              className="input notes__searchInput"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search your notes"
              aria-label="Search notes"
            />
          </div>
        )}

        {madeTask && (
          <div className="hintbar" role="status">
            <p className="hintbar__text">Made it a task for today.</p>
            <button type="button" className="btn btn--sm" onClick={() => void undoTask()}>
              Undo
            </button>
          </div>
        )}

        {filed && (
          <div className="hintbar" role="status">
            <p className="hintbar__text">
              Filed in {sectionOf(filed.page.section).label} as &ldquo;{filed.page.title}&rdquo;.
            </p>
            {onOpenPage && (
              <button type="button" className="btn btn--sm" onClick={() => onOpenPage(filed.page.id)}>
                Open it
              </button>
            )}
            <button type="button" className="btn btn--sm" onClick={() => void undoFile()}>
              Undo
            </button>
          </div>
        )}

        {notes.length === 0 ? (
          searching && (
            <p className="card__hint">
              {lines.noMatch} Try a shorter word.
            </p>
          )
        ) : (
          <ul className="notelist">
            {notes.map((note) => (
              <li key={note.id} className={`note${note.isPinned ? " note--pinned" : ""}`}>
                {editing === note.id ? (
                  <textarea
                    className="input"
                    rows={4}
                    value={body}
                    aria-label="Edit this note"
                    autoFocus
                    onChange={(event) => setBody(event.target.value)}
                    onBlur={() => {
                      setEditing(null);
                      if (body.trim().length > 0 && body !== note.body) {
                        void act(() => window.caulder.notes.update(note.id, body, companyId));
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="note__body"
                    onClick={() => {
                      setEditing(note.id);
                      setBody(note.body);
                    }}
                  >
                    {note.body}
                  </button>
                )}

                <div className="note__foot">
                  <span className="note__when">{relativeDay(note.createdAt)}</span>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    aria-label={`Make a task of "${note.body.slice(0, 40)}"`}
                    title="Make it a task"
                    // The one conversion worth having: a task is the thing that
                    // reaches Google Tasks, and therefore the phone. A note that
                    // can only ever be re-read is a diary.
                    onClick={() => void makeTask(note)}
                  >
                    <CheckSquare size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    aria-label={`File "${note.body.slice(0, 40)}" in the brain`}
                    title="File it in the brain"
                    aria-expanded={filing === note.id}
                    onClick={() => setFiling((current) => (current === note.id ? null : note.id))}
                  >
                    <FolderInput size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    aria-label={note.isPinned ? "Unpin this note" : "Pin this note"}
                    onClick={() =>
                      void act(() =>
                        window.caulder.notes.pin(note.id, !note.isPinned, companyId),
                      )
                    }
                  >
                    {note.isPinned ? <PinOff size={14} aria-hidden /> : <Pin size={14} aria-hidden />}
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost btn--danger"
                    aria-label="Delete this note"
                    onClick={() => void act(() => window.caulder.notes.remove(note.id, companyId))}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>

                {filing === note.id && (
                  <div className="note__file">
                    <Select
                      aria-label="File it in"
                      value={fileTo}
                      onChange={setFileTo}
                      compact
                      options={BRAIN_SECTION_LIST.map((section) => ({ value: section.id, label: section.label }))}
                    />
                    <button type="button" className="btn btn--sm btn--primary" onClick={() => void fileNote(note)}>
                      File it
                    </button>
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => setFiling(null)}>
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
