import type { LineMode } from "@shared/ember";
import { knockEmber, useDoor, useWarmth } from "./stage";

/**
 * Ember's front door, at the end of the quick line.
 *
 * She lives here. She comes out of it when Caulder opens, goes back in when
 * it is late, and turns up out of it again after falling off the bottom of
 * the window - a character that appears from nowhere is a picture, and one
 * that comes out of her own house is somebody.
 *
 * Drawn like her, in sprite pixels at two screen pixels each: `k` ink, `n`
 * the wood, `p` the warm light inside, `y` the knob, `g` the mat. Knock on it
 * while she is in and she answers.
 */

const SHUT = [
  "...kkkkkk...",
  ".kknnnnnnkk.",
  ".knnnnnnnnk.",
  "knnkkkkkknnk",
  "knnkppppknnk",
  "knnkppppknnk",
  "knnkkkkkknnk",
  "knnnnnnnnnnk",
  "knkkknnkkknk",
  "knknnnnnnknk",
  "knknnnnnnknk",
  "knknnnnnyknk",
  "knknnnnnnknk",
  "knkkknnkkknk",
  "knnnnnnnnnnk",
  "knnnnnnnnnnk",
  "kkkkkkkkkkkk",
  "gggggggggggg",
];

const AJAR = [
  "...kkkkkk...",
  ".kkkkknnnkk.",
  ".kkkkknnnnk.",
  "kkkkknkkknnk",
  "kkkkknppknnk",
  "kkkkknppknnk",
  "kkkkknkkknnk",
  "kkkkknnnnnnk",
  "kkkkknnkkknk",
  "kkkkknnnnknk",
  "kkkkknnnnknk",
  "kkkkknnnyknk",
  "kpkkknnnnknk",
  "kppkknnkkknk",
  "kpppknnnnnnk",
  "kppppnnnnnnk",
  "kkkkkkkkkkkk",
  "gggggggggggg",
];

const OPEN = [
  "...kkkkkk...",
  ".kkkkkkknkk.",
  ".kkkkkkknnk.",
  "kkkkkkkknnnk",
  "kkkkkkkknpnk",
  "kkkkkkkknnnk",
  "kkkkkkkknnnk",
  "kkkkkkkknnnk",
  "kkkkkkkknnnk",
  "kkkkkkkknynk",
  "kkkkkkkknnnk",
  "kpkkkkkknnnk",
  "kppkkkkknnnk",
  "kpppkkkknnnk",
  "kppppkkknnnk",
  "kpppppkknnnk",
  "kkkkkkkkkkkk",
  "gggggggggggg",
];

const INK: Record<string, string> = { k: "px--k", n: "px--n", p: "px--p", y: "px--y", g: "px--g" };

function Pixels({ rows, className }: { rows: readonly string[]; className: string }) {
  return (
    <g className={className}>
      {rows.flatMap((row, y) => {
        const out = [];
        let x = 0;
        while (x < row.length) {
          const ch = row[x] ?? ".";
          let w = 1;
          while (row[x + w] === ch) w += 1;
          if (INK[ch]) out.push(<rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} className={INK[ch]} />);
          x += w;
        }
        return out;
      })}
    </g>
  );
}

export function Door({ mode }: { mode: LineMode }) {
  const door = useDoor();
  // The light in her window is how warm your habits keep her.
  const warmth = useWarmth();
  return (
    <button
      type="button"
      className="ember-door"
      data-ember-door
      data-state={door}
      data-warmth={warmth}
      data-flame={mode}
      aria-label={door === "sleeping" ? "Ember's door. She is asleep; knock to wake her." : "Ember's door. Knock."}
      title={door === "sleeping" ? "She is asleep. Knock?" : "Ember lives here. Knock?"}
      onClick={knockEmber}
    >
      <svg viewBox="0 0 12 18" width="24" height="36" className="ember-door__svg" focusable="false" aria-hidden>
        <Pixels rows={SHUT} className="ember-door__shut" />
        <Pixels rows={AJAR} className="ember-door__ajar" />
        <Pixels rows={OPEN} className="ember-door__open" />
      </svg>
      {door === "sleeping" && (
        <span className="ember-door__zzz" aria-hidden>
          z
        </span>
      )}
    </button>
  );
}
