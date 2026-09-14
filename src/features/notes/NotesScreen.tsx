import { useCallback, useEffect, useState } from "react";
import { CheckSquare, Pin, PinOff, Search, Trash2 } from "lucide-react";
import type { Note } from "@shared/domain";
import { useWorkspace } from "@/lib/workspace";
import { relativeDay } from "@/lib/format";
import { taskInput } from "@shared/domain";
import { today as todayIn } from "@shared/dates";
import { messageOf } from "@/lib/errors";

/**
 * Everything caught, in one place.
 *
 * The screen is the second half of the feature; the first half is the global
 * key that writes without opening anything. What matters here is that a note
 * can be found again - a capture box with no search is a drawer.
 */

export function NotesScreen() {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

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
          placeholder="Anything. It does not have to be about a lead."
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

      {notes.length === 0 ? (
        <div className="empty">
          <p className="empty__title">
            {search.length > 0 ? "Nothing matches that" : "Nothing caught yet"}
          </p>
          <p className="empty__body">
            {search.length > 0
              ? "Try a shorter word."
              : "Press the quick-add key from any app, or click the tray icon, to write one without opening Caulder."}
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
                  onClick={async () => {
                    // The one conversion worth having: a task is the thing
                    // that reaches Google Tasks, and therefore the phone. A
                    // note that can only ever be re-read is a diary.
                    await window.caulder.tasks.create(
                      companyId,
                      taskInput.parse({
                        title: note.body.slice(0, 200),
                        dueOn: todayIn(activeCompany?.timezone ?? "UTC"),
                        kind: "todo",
                      }),
                    );
                    await act(() => window.caulder.notes.remove(note.id, companyId));
                  }}
                >
                  <CheckSquare size={14} aria-hidden />
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
