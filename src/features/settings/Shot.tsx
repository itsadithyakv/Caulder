import { ChevronDown, Play, Plus } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Pictures of the four screens that are not Caulder's.
 *
 * Connecting Google happens in somebody else's console, and every step of it
 * has one thing to find among fifty: a word in a sidebar, a link inside a
 * warning, a dropdown whose right answer looks like the wrong one. Words
 * alone make a reader hunt; a picture with that one thing ringed makes them
 * look.
 *
 * These are drawn rather than photographed, in Caulder's own tokens, for two
 * reasons. A screenshot is stale the week Google moves a menu, and it cannot
 * follow the theme - a bright white slab of somebody else's app in the middle
 * of a dark card. A drawing keeps only what has to be recognised: the shape
 * of the screen, the exact words, and the ring.
 *
 * Nothing here is read aloud: the step beside each picture says the same
 * thing in a sentence, and a screen reader hearing both would hear it twice.
 */

function Frame({ where, children }: { where: string; children: ReactNode }) {
  return (
    <figure className="shot" aria-hidden>
      <figcaption className="shot__where">{where}</figcaption>
      <div className="shot__pane">{children}</div>
    </figure>
  );
}

/** The editor a new project opens in, and the name to give it. */
function Paste() {
  return (
    <Frame where="Apps Script">
      <div className="shot__bar">
        <span className="shot__mark" />
        <span className="shot__ring">Untitled project</span>
        <span className="shot__note">call it Caulder</span>
      </div>
      <div className="shot__editor">
        {[0, 1, 2, 3].map((line) => (
          <span key={line} className="shot__codeline">
            <span className="shot__num" />
            <span className="shot__line" />
          </span>
        ))}
      </div>
    </Frame>
  );
}

/** The left sidebar, where two services are added by hand. */
function Services() {
  return (
    <Frame where="Apps Script, the left sidebar">
      <div className="shot__split">
        <div className="shot__side">
          <span className="shot__item">Files</span>
          <span className="shot__item shot__item--on">
            Services
            <span className="shot__ring shot__ring--plus">
              <Plus size={10} />
            </span>
          </span>
          <span className="shot__item">Libraries</span>
        </div>
        <div className="shot__stack">
          <span className="shot__note shot__note--down">add both</span>
          <span className="shot__btn">Google Calendar API</span>
          <span className="shot__btn">Tasks API</span>
        </div>
      </div>
    </Frame>
  );
}

/** Running setUp, the warning that follows, and the key it prints. */
function Run() {
  return (
    <Frame where="Apps Script, then Google">
      <div className="shot__bar">
        <span className="shot__btn shot__btn--go">
          <Play size={9} />
          Run
        </span>
        <span className="shot__ring">
          setUp
          <ChevronDown size={10} />
        </span>
        <span className="shot__note">pick it first</span>
      </div>
      <div className="shot__dialog">
        <span className="shot__head">Google hasn&rsquo;t verified this app</span>
        <span className="shot__row">
          <span className="shot__ring shot__ring--link">Advanced</span>
          <span className="shot__note">then Go to Caulder</span>
        </span>
      </div>
      <span className="shot__log">Your Caulder key: 7f3a9c&hellip;</span>
      <span className="shot__note shot__note--up">copy that whole line</span>
    </Frame>
  );
}

/** The deployment, where the alarming answer is the right one. */
function Deploy() {
  return (
    <Frame where="Apps Script, Deploy › New deployment">
      <span className="shot__field">
        <span className="shot__label">Execute as</span>
        <span className="shot__btn">
          Me
          <ChevronDown size={10} />
        </span>
      </span>
      <span className="shot__field">
        <span className="shot__label">Who has access</span>
        <span className="shot__ring">
          Anyone
          <ChevronDown size={10} />
        </span>
      </span>
      <span className="shot__note shot__note--up">not Only me</span>
      <span className="shot__log">
        &hellip;/macros/s/AKf&hellip;/exec
        <span className="shot__note">copy this</span>
      </span>
    </Frame>
  );
}

const SHOTS = { paste: Paste, services: Services, run: Run, deploy: Deploy };

/** Which screen a step happens on. */
export type ShotName = keyof typeof SHOTS;

/** The picture for one step of connecting Google. */
export function Shot({ of }: { of: ShotName }) {
  const Drawing = SHOTS[of];
  return <Drawing />;
}
