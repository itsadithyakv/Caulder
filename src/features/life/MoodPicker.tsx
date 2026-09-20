import { MOODS, type Mood } from "@shared/brain";
import { MOOD_ICON } from "./moods";

/**
 * How the day felt, in five: a face and a word each, pressed once. Pressing
 * the one already chosen takes it back.
 *
 * `compact` is one quiet row - the question, then five faces, the chosen one
 * with its word - for the journal, where the writing is the point and five
 * tiles across the top were the loudest thing on the page.
 */
export function MoodPicker({
  value,
  busy,
  onPick,
  label = "How the day felt",
  compact = false,
}: {
  value: Mood | null;
  busy: boolean;
  onPick: (mood: Mood | null) => void;
  label?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="moods moods--compact" role="group" aria-label={label}>
        <span className="moods__ask" aria-hidden>
          How was it?
        </span>
        {MOODS.map((option) => {
          const mood = option.value as Mood;
          const Icon = MOOD_ICON[mood];
          const on = value === mood;
          return (
            <button
              key={mood}
              type="button"
              className={`mood mood--${mood}${on ? " mood--on" : ""}`}
              aria-pressed={on}
              aria-label={option.label}
              title={option.label}
              disabled={busy}
              onClick={() => onPick(on ? null : mood)}
            >
              <Icon size={18} aria-hidden />
              {on && <span className="mood__word">{option.label}</span>}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="moods" role="group" aria-label={label}>
      {MOODS.map((option) => {
        const mood = option.value as Mood;
        const Icon = MOOD_ICON[mood];
        const on = value === mood;
        return (
          <button
            key={mood}
            type="button"
            className={`mood mood--${mood}${on ? " mood--on" : ""}`}
            aria-pressed={on}
            disabled={busy}
            onClick={() => onPick(on ? null : mood)}
          >
            <Icon size={20} aria-hidden />
            <span className="mood__word">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A mood as it is read back: its face and its word. */
export function MoodTag({ mood }: { mood: Mood }) {
  const Icon = MOOD_ICON[mood];
  const word = MOODS.find((option) => option.value === mood)?.label ?? mood;
  return (
    <span className={`moodtag mood--${mood}`}>
      <Icon size={14} aria-hidden />
      {word}
    </span>
  );
}
