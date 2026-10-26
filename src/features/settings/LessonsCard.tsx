import { useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import type { Lesson, LessonKind } from "@shared/lessons";
import { Card } from "@/components/Card";
import { Explain } from "@/components/Explain";

const KIND_LABEL: Record<LessonKind, string> = {
  task: "a task",
  idea: "an idea",
  note: "a note",
  memory: "a memory",
};

/**
 * What the line learnt from being moved (shared/lessons.ts).
 *
 * Each lesson is the line it was learnt from and where it was moved to, and
 * each can be taken back with one press - a lesson you cannot see is one you
 * cannot correct, and this is the whole of what the line remembers about how
 * you correct it.
 */
export function LessonsCard() {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);

  useEffect(() => {
    void window.caulder.lessons.list().then(setLessons, () => setLessons([]));
  }, []);

  if (!lessons) return null;

  return (
    <Card title="What the line has learnt" hint="Move a line somewhere else before you keep it, and the next one like it goes there too.">
      {lessons.length === 0 ? (
        <p className="card__hint">
          Nothing yet.
        </p>
      ) : (
        <ul className="rules" aria-label="What the line has learnt">
          {lessons.map((lesson) => (
            <li key={lesson.id} className="rule">
              <span className="rule__text">
                <strong>&ldquo;{lesson.sample}&rdquo;</strong>{" "}
                is {KIND_LABEL[lesson.kind]}
                {lesson.times > 1 ? <span className="card__hint"> · {lesson.times} times</span> : null}
              </span>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => void window.caulder.lessons.remove(lesson.id).then(setLessons, () => undefined)}
                aria-label={`Forget what was learnt from "${lesson.sample}"`}
                title="Forget this"
              >
                <Undo2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Explain>
        <p>
          It learns the words, not the sentence: move &ldquo;look into a referral scheme&rdquo; to Idea and &ldquo;look into a
          loyalty card&rdquo; goes there too. A word you have moved two different ways counts for neither. Nothing leaves this
          computer, and there is no model: this list is all of it.
        </p>
      </Explain>
    </Card>
  );
}
