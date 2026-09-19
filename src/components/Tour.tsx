import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Portal } from "./Portal";

/**
 * The first-run tour: five steps, a spotlight on each part of the app and a
 * sentence or two beside it. Fast on purpose - it says where things are, not
 * how every one of them works, and the rest is found by using it.
 *
 * Escape, Skip or Done end it for good; `?` has a way back. Arrow keys move
 * through it, focus stays on its buttons, and a screen reader hears each step
 * as a dialog.
 */

type Step = {
  /** What the spotlight rests on; none is the whole window, for the last word. */
  target: string | null;
  title: string;
  body: ReactNode;
};

function stepsFor(anywhere: string | null): Step[] {
  return [
    {
      target: '[data-tour="plan"]',
      title: "Your day, in one place",
      body: "Today is what is due, what is late and what has gone quiet, with your own half of the day beside it. The Calendar is the week.",
    },
    {
      target: ".today__quick",
      title: "One line for anything",
      body: (
        <>
          Type it the way you would say it - <q>call Asha tomorrow 4pm</q>, <q>gym 45 min</q>, <q>rough day, but shipped it</q>. It
          goes where it belongs and says where first. From any app,{" "}
          {anywhere ? (
            <>
              press <kbd>{anywhere}</kbd> or click
            </>
          ) : (
            "click"
          )}{" "}
          Caulder's icon by the clock. For a quick note instead, press <kbd>Ctrl N</kbd> in that window, or right-click the icon.
        </>
      ),
    },
    {
      target: '[data-tour="you"]',
      title: "Yours, not the company's",
      body: "The journal (J) and Life (Y): habits, studies, hobbies, goals, a vision board and your level. They stay put whichever company you pick.",
    },
    {
      target: '[data-tour="company"]',
      title: "Your company",
      body: "Contacts, deals, money and the company's brain. Choose another company, or add one, from its name.",
    },
    {
      target: null,
      title: "That's it",
      body: (
        <>
          Press <kbd>?</kbd> any time for every shortcut, and <kbd>Ctrl K</kbd> to search everything. The tour is under <kbd>?</kbd>{" "}
          too.
        </>
      ),
    },
  ];
}

type Box = { top: number; left: number; width: number; height: number };

const PAD = 8;
const CARD_W = 340;

export function Tour({ onDone }: { onDone: () => void }) {
  const [anywhere, setAnywhere] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const next = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    window.caulder.capture.get().then(
      (key) => setAnywhere(key.held ? key.accelerator.replace(/\+/g, " ") : null),
      () => undefined,
    );
  }, []);

  const steps = stepsFor(anywhere);
  const step = steps[at] ?? steps[0];
  const last = at === steps.length - 1;

  // Where the spotlight goes: measured, and measured again when the window moves.
  const measure = useCallback(() => {
    const target = step?.target ? document.querySelector(step.target) : null;
    if (!target) {
      setBox(null);
      return;
    }
    target.scrollIntoView({ block: "nearest" });
    const rect = target.getBoundingClientRect();
    setBox({ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 });
  }, [step?.target]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  useEffect(() => next.current?.focus(), [at]);

  const forward = useCallback(() => (last ? onDone() : setAt((n) => n + 1)), [last, onDone]);
  const back = useCallback(() => setAt((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDone();
      else if (event.key === "ArrowRight") forward();
      else if (event.key === "ArrowLeft") back();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    // Capture, so the app's own single-letter keys do not act underneath.
    window.addEventListener("keydown", keys, true);
    return () => window.removeEventListener("keydown", keys, true);
  }, [onDone, forward, back]);

  // The card beside the spotlight where there is room, below it where there is not, centred with none.
  const place = (): { top: number; left: number } => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (!box) return { top: Math.max(24, height / 2 - 110), left: Math.max(16, width / 2 - CARD_W / 2) };
    const clampTop = (top: number) => Math.min(Math.max(16, top), height - 240);
    if (box.left + box.width + 16 + CARD_W < width) return { top: clampTop(box.top), left: box.left + box.width + 16 };
    return { top: clampTop(box.top + box.height + 12), left: Math.min(Math.max(16, box.left), width - CARD_W - 16) };
  };
  const card = place();

  return (
    <Portal>
      <div className="tour" role="presentation">
        {box ? (
          <div className="tour__spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} aria-hidden />
        ) : (
          <div className="tour__scrim" aria-hidden />
        )}
        <div
          className="tour__card card anim-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          aria-describedby="tour-body"
          style={{ top: card.top, left: card.left, width: CARD_W }}
        >
          <p className="tour__count">
            {at + 1} of {steps.length}
          </p>
          <h2 className="tour__title" id="tour-title">
            {step?.title}
          </h2>
          <p className="tour__body" id="tour-body">
            {step?.body}
          </p>
          <div className="tour__actions">
            {!last && (
              <button type="button" className="btn btn--sm btn--ghost" onClick={onDone}>
                Skip
              </button>
            )}
            <span className="tour__spacer" />
            {at > 0 && (
              <button type="button" className="btn btn--sm" onClick={back}>
                Back
              </button>
            )}
            <button ref={next} type="button" className="btn btn--sm btn--primary" onClick={forward}>
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
