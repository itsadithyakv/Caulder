import { useEffect } from "react";
import { ClipboardCopy, Sparkles } from "lucide-react";
import { modeInfo, type EmberMood, type LineMode } from "@shared/ember";
import { Door } from "@/features/ember/Door";
import { onAsk, setLine } from "@/features/ember/stage";
import { useEmberPref } from "@/lib/emberPrefs";

/**
 * The two switches that decide what the line does, and Ember's front door.
 *
 * She lives at the end of this line. The door is here; she is not - she is
 * drawn over the whole window by features/ember/EmberStage.tsx, because she
 * walks off this line onto cards, gets thrown across the window and falls out
 * of the bottom of it, and a character clipped to a toolbar cannot do any of
 * that. The line tells her what it is doing, which is the colour she burns
 * and the mood she is in, and she tells the line when she has been clicked,
 * which makes it a question for the AI.
 *
 * That leaves the switches to be switches: plain icons tinted with the flame
 * they would light. Colour is never the only signal - each keeps its pressed
 * state, its title and the line's own placeholder.
 */
export function LineModes({
  mode,
  writing,
  mood,
  canAsk,
  onMode,
}: {
  /** What the line is in now. */
  mode: LineMode;
  /** Which writing flame this workspace has: orange for a company, blue for your own. */
  writing: LineMode;
  mood: EmberMood;
  /** Whether there is an AI connected to ask. */
  canAsk: boolean;
  onMode: (mode: LineMode) => void;
}) {
  const asking = mode === "ask";
  const copying = mode === "copy";
  const home = useEmberPref("out");

  // She wears whatever the line is doing, wherever she has wandered off to.
  useEffect(() => {
    setLine({ mode, mood });
  }, [mode, mood]);
  useEffect(() => () => setLine(null), []);

  // Clicked: the line becomes a question for her, cursor in it.
  useEffect(() => onAsk(() => (canAsk && !asking ? onMode("ask") : undefined)), [canAsk, asking, onMode]);

  return (
    <>
      <span className="quickadd__perch">{home && <Door mode={mode} />}</span>

      <span className="quickadd__modes">
        {canAsk && (
          <button
            type="button"
            className={`quickadd__star${asking ? " quickadd__star--on" : ""}`}
            data-flame="ask"
            aria-pressed={asking}
            title={asking ? modeInfo(writing).detail : modeInfo("ask").detail}
            onClick={() => onMode(asking ? writing : "ask")}
          >
            <Sparkles size={16} aria-hidden />
            <span className="visually-hidden">{asking ? modeInfo(writing).title : modeInfo("ask").title}</span>
          </button>
        )}

        <button
          type="button"
          className={`quickadd__star${copying ? " quickadd__star--on" : ""}`}
          data-flame="copy"
          aria-pressed={copying}
          title={copying ? modeInfo(writing).detail : modeInfo("copy").detail}
          onClick={() => onMode(copying ? writing : "copy")}
        >
          <ClipboardCopy size={16} aria-hidden />
          <span className="visually-hidden">{copying ? modeInfo(writing).title : modeInfo("copy").title}</span>
        </button>
      </span>
    </>
  );
}
