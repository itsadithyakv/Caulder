import { MOODS, type Mood } from "@shared/brain";
import { MOOD_ICON } from "./moods";

/**
 * How the day felt, in five: a face and a word each, pressed once. Pressing
 * the one already chosen takes it back.
 */
export function MoodPicker({
  value,
  busy,
  onPick,
  label = "How the day felt",
}: {
  value: Mood | null;
  busy: boolean;
  onPick: (mood: Mood | null) => void;
  label?: string;
}) {
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
