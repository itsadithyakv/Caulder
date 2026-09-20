import { useCallback, useEffect, useState } from "react";
import { CheckSquare, FolderInput, Pin, PinOff, Search, Trash2 } from "lucide-react";
import { BRAIN_SECTION_LIST, sectionOf, type BrainPage, type BrainSectionId } from "@shared/brain";
import { Select } from "@/components/Select";
import type { Note } from "@shared/domain";
import { useWorkspace } from "@/lib/workspace";
import { relativeDay } from "@/lib/format";
import { taskInput } from "@shared/domain";
import { today as todayIn } from "@shared/dates";
import { messageOf } from "@/lib/errors";
import { notesLines } from "./lines";

/**
 * Everything caught, in one place.
 *
 * The screen is the second half of the feature; the first half is the global
 * key that writes without opening anything. What matters here is that a note
 * can be found again - a capture box with no search is a drawer.
 */

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
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** What it says this time: a different line each time Notes is opened. */
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

  async function write() {
    const text = draft.trim();
    if (text.length === 0) return;
    setDraft("");
    await act(() => window.caulder.notes.create(companyId!, text));
  }

  return (
    <div className="notes">
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <textarea
          className="input notes__write"
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={lines.write}
          aria-label="Write a note"
          onKeyDown={(event) => {
            // Ctrl+Enter saves, the same as the capture window, so the habit
            // learned in one works in the other.
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              void write();
            }
          }}
        />
        <div className="notes__writeFoot">
          <span className="card__hint">Ctrl + Enter saves it.</span>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={() => void write()}
            disabled={draft.trim().length === 0}
          >
            Keep it
          </button>
        </div>
      </section>

      <div className="notes__search">
        <Search size={16} className="notes__searchIcon" aria-hidden />
        <input
          className="input notes__searchInput"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search everything you have written"
          aria-label="Search notes"
        />
      </div>

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
        <div className="empty">
          <p className="empty__title">
            {search.length > 0 ? lines.noMatch : lines.empty}
          </p>
          <p className="empty__body">
            {search.length > 0
              ? "Try a shorter word."
              : "Ideas turn up at bad times. The quick-add key catches one from any app, and so does the tray icon."}
          </p>
        </div>
      ) : (
        <ul className="notelist">
          {notes.map((note) => (
            <li key={note.id} className={`note${note.isPinned ? " note--pinned" : ""}`}>
              {editing === note.id ? (
                <textarea
                  className="input"
                  rows={4}
                  value={body}
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
  );
}
