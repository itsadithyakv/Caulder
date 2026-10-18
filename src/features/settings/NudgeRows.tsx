import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import type { NudgeSettings } from "@shared/nudges";
import { Select } from "@/components/Select";
import { formatTime } from "@/lib/format";

/** Every half hour of the waking day, for the hour a nudge comes. */
const HOURS = Array.from({ length: 36 }, (_, index) => {
  const minutes = 6 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

/**
 * The notification Caulder sends on its own: a morning brief, off until
 * switched on, at the hour picked - and a test, so
 * whether Windows is letting them through is found out here rather than by a
 * reminder that never arrived.
 */
export function NudgeRows() {
  const [settings, setSettings] = useState<NudgeSettings | null>(null);
  const [tested, setTested] = useState<"sent" | "unsupported" | null>(null);

  useEffect(() => {
    void window.caulder.nudges.get().then(setSettings, () => setSettings({ briefAt: null }));
  }, []);

  if (!settings) return null;

  const save = (next: NudgeSettings) => void window.caulder.nudges.set(next).then(setSettings, () => undefined);

  const row = (key: keyof NudgeSettings, title: string, hint: string, standard: string) => {
    const at = settings[key];
    return (
      <div className="checkline">
        <button
          type="button"
          className="toggle"
          role="switch"
          aria-checked={at !== null}
          aria-label={title}
          onClick={() => save({ ...settings, [key]: at === null ? standard : null })}
        >
          <span className="toggle__thumb" />
        </button>
        <span className="checkline__text">
          <span className="checkline__title">{title}</span>
          <span className="card__hint">{hint}</span>
          {at !== null && (
            <label className="field remindlead">
              <span className="field__label">At</span>
              <Select
                aria-label={`${title}, at`}
                value={at}
                onChange={(value) => save({ ...settings, [key]: value })}
                options={HOURS.map((hour) => ({ value: hour, label: formatTime(hour) }))}
              />
            </label>
          )}
        </span>
      </div>
    );
  };

  return (
    <>
      {row("briefAt", "A morning brief of what matters today", "The must-dos by name, then how many more and how many are late. Nothing on a day with nothing.", "09:00")}
      <p className="card__hint">
        Anything you tell the line to <strong>remind me</strong> about - &ldquo;remind me in 20 mins to check the oven&rdquo;,
        &ldquo;don&rsquo;t let me forget rent on the 1st&rdquo; - arrives at its time whatever these say, because you asked in so many
        words.
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => void window.caulder.nudges.test().then((ok) => setTested(ok ? "sent" : "unsupported"), () => setTested("unsupported"))}
        >
          <BellRing size={14} aria-hidden />
          Send a test notification
        </button>
        {tested === "sent" && (
          <span className="card__hint" role="status">
            Sent. If nothing appeared, check Windows&rsquo; notification settings.
          </span>
        )}
        {tested === "unsupported" && (
          <span className="card__hint" role="status">
            This computer is not letting apps show notifications at all.
          </span>
        )}
      </div>
    </>
  );
}
