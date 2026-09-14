import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  TASK_AREAS,
  TASK_AREA_LABEL,
  areaWordInput,
  type AreaWord,
  type TaskArea,
} from "@shared/domain";
import { Chips } from "@/components/Select";
import { messageOf } from "@/lib/errors";
import { Card } from "@/components/Card";
import { Explain } from "@/components/Explain";

const AREA_OPTIONS = TASK_AREAS.map((value) => ({ value, label: TASK_AREA_LABEL[value] }));

/**
 * Your words: what the quick-add line should know about this one life.
 *
 * The built-in list knows "assignment" is college and "gym" is health. It
 * cannot know that Datascience is a course, CS301 is its code, or that
 * Oakridge is the school the company is chasing - and those are exactly the
 * words a person types. One list for the whole app, because a course name
 * does not stop being a course name in the other workspace.
 */
export function WordsCard() {
  const [words, setWords] = useState<AreaWord[]>([]);
  const [word, setWord] = useState("");
  const [area, setArea] = useState<TaskArea>("college");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.caulder.words.list().then(setWords);
  }, []);

  async function add() {
    setError(null);
    // Checked here first so the sentence shown is the schema's, before it
    // ever crosses the bridge. Main checks it again regardless.
    const parsed = areaWordInput.safeParse({ word, area });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "That word will not do.");
      return;
    }
    setBusy(true);
    try {
      setWords(await window.caulder.words.add(parsed.data));
      setWord("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      setWords(await window.caulder.words.remove(id));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  return (
    <Card
      title="Your words"
      hint="Course names, codes, clients: words that tell the quick-add line which area a task belongs to."
    >

      {words.length > 0 ? (
        <ul className="rules" aria-label="Your words">
          {words.map((entry) => (
            <li key={entry.id} className="rule">
              <span className="rule__text">
                <strong>{entry.word}</strong>
              </span>
              <span className={`area area--${entry.area}`}>
                {TASK_AREA_LABEL[entry.area as TaskArea] ?? entry.area}
              </span>
              <button
                type="button"
                className="btn btn--sm btn--ghost btn--danger"
                onClick={() => void remove(entry.id)}
                aria-label={`Forget "${entry.word}"`}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card__hint">No words yet. A course name or two is the place to start.</p>
      )}

      {/* Both full width: four chips beside an input wrap onto two lines in a
          settings column, and the two labels then sit at different heights. */}
      <div className="rulebuild">
        <div className="field rulebuild__wide">
          <label className="field__label" htmlFor="word-text">
            Word or phrase
          </label>
          <input
            id="word-text"
            className={`input${error ? " input--invalid" : ""}`}
            value={word}
            onChange={(event) => {
              setWord(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void add();
              }
            }}
            placeholder="Datascience"
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </div>

        <div className="field rulebuild__wide">
          <span className="field__label" aria-hidden>
            Means
          </span>
          <Chips
            value={area}
            onChange={setArea}
            aria-label="Which area it means"
            disabled={busy}
            options={AREA_OPTIONS}
          />
        </div>

        <div className="firstrun__actions rulebuild__wide">
          <button
            type="button"
            className="btn btn--sm btn--primary"
            disabled={busy || word.trim().length === 0}
            onClick={() => void add()}
          >
            <Plus size={14} aria-hidden />
            Teach it
          </button>
        </div>
      </div>

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    <Explain>
        <p>
          Teach it that Datascience is College, and &ldquo;Datascience reading
          tomorrow&rdquo; lands in College without a <code>#college</code>. A word
          only picks the area; it stays in the title. One list for the whole app,
          because a course does not stop being a course in the other workspace.
        </p>
      </Explain>
    </Card>
  );
}
