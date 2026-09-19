import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { QUICK_WINDOW_SHORTCUTS, SHORTCUTS } from "@/lib/shortcuts";

/**
 * The shortcut list, on `?`.
 *
 * A dialog rather than a settings page: it is read once, mid-flow, and closed.
 *
 * The one key that works outside Caulder is read live rather than written
 * down here: it can be changed, turned off, or taken by another app, and a
 * list naming a key you do not have would send somebody pressing nothing.
 */
export function ShortcutHelp({ onClose, onTour }: { onClose: () => void; onTour?: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const [anywhere, setAnywhere] = useState<string | null>(null);

  // Focus moves into the dialog so Escape and Tab behave, and so a screen
  // reader announces it rather than leaving the user where they were.
  useEffect(() => closeButton.current?.focus(), []);

  useEffect(() => {
    window.caulder.capture.get().then(
      (key) => setAnywhere(key.held ? key.accelerator.replace(/\+/g, " + ") : null),
      () => undefined,
    );
  }, []);

  const groups = [
    ...SHORTCUTS,
    {
      group: "From any app",
      items: [
        anywhere
          ? { keys: anywhere, describes: "Open the quick window - or click the tray icon" }
          : { keys: "Off", describes: "Set a key in Settings, or click the tray icon" },
      ],
    },
    QUICK_WINDOW_SHORTCUTS,
  ];

  return (
    <div
      className="scrim anim-in"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="card shortcuts anim-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <div className="leadtasks__head">
          <h2 className="card__title" id="shortcuts-title">
            Keyboard shortcuts
          </h2>
          <button
            ref={closeButton}
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={15} aria-hidden />
          </button>
        </div>

        <p className="card__hint">
          Single letters, so they stay out of the way while you are typing. The
          quick window works from any app.
        </p>
        {onTour && (
          <button type="button" className="btn btn--sm shortcuts__tour" onClick={onTour}>
            Show me around again
          </button>
        )}

        {groups.map((group) => (
          <div key={group.group} className="today__group">
            <h3 className="today__groupTitle">{group.group}</h3>
            <dl className="facts">
              {group.items.map((item) => (
                <div key={item.keys} className="facts__row">
                  <dt className="facts__label">
                    <kbd className="kbd">{item.keys}</kbd>
                  </dt>
                  <dd className="facts__value">{item.describes}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
