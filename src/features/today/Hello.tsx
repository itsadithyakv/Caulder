import { useEffect, useId, useState } from "react";
import { aside, clearDay, greet, partOf } from "@shared/voice";
import { minutesOf, timeNow } from "@shared/dates";
import { sayOnce } from "./said";

/** Which stretch of which day it is: what is said is said again only when this changes. */
function stampOf(day: string, timezone: string): { stamp: string; hour: number } {
  const hour = Math.floor(minutesOf(timeNow(timezone)) / 60);
  return { stamp: `${day}:${partOf(hour)}`, hour };
}

/**
 * Hello, by name, above the day.
 *
 * The name is the one in Settings under "This is me" - asked for nowhere else,
 * so until it is given this offers to take it right here, in one field. Not
 * given, the greeting simply goes without: it never nags for it.
 *
 * It looks at the list before it speaks - so it is told how much is due - and
 * it keeps the same hello for the morning rather than a new one each time
 * Today is drawn.
 */
export function Hello({ day, timezone, due, late }: { day: string; timezone: string; due: number; late: number }) {
  const id = useId();
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let live = true;
    window.caulder.share.me().then((mine) => live && setName(mine), () => live && setName(null));
    return () => {
      live = false;
    };
  }, []);

  // Until the name is known, say nothing: a hello that changes as it loads reads as a glitch.
  if (name === undefined) return <div className="today__hello" aria-hidden />;

  const { stamp, hour } = stampOf(day, timezone);
  const hello = sayOnce("hello", stamp, (seen, seed) => greet({ hour, day, due, late, seen, seed }));
  const save = () =>
    void window.caulder.share.setMe(typed).then(
      (mine) => {
        setName(mine);
        setAsking(false);
      },
      () => setAsking(false),
    );

  return (
    <div className="today__hello">
      <p className="today__greeting">{hello.say(name)}</p>
      {name === null &&
        (asking ? (
          <form
            className="today__name"
            onSubmit={(event) => {
              event.preventDefault();
              if (typed.trim()) save();
            }}
          >
            <label className="visually-hidden" htmlFor={id}>
              What to call you
            </label>
            <input
              id={id}
              className="input"
              autoFocus
              maxLength={60}
              placeholder="Your name"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setAsking(false)}
            />
            <button type="submit" className="btn btn--sm" disabled={!typed.trim()}>
              Save
            </button>
          </form>
        ) : (
          <button type="button" className="quickadd__keep" onClick={() => setAsking(true)}>
            What should I call you?
          </button>
        ))}
    </div>
  );
}

/** Nothing to count: say so, a different way each clear day. */
export function ClearDay({ day, timezone }: { day: string; timezone: string }) {
  const { says } = sayOnce("clear", stampOf(day, timezone).stamp, clearDay);
  return <span className="today__summary">{says}</span>;
}

/**
 * The line under the day: a joke, a pun, a tip, or something that has lasted.
 * It is a button because the natural thing to do with a joke is ask for another.
 */
export function Aside({ day, timezone }: { day: string; timezone: string }) {
  const [turn, setTurn] = useState(0);
  const { says, by } = sayOnce("aside", `${stampOf(day, timezone).stamp}:${turn}`, aside);
  return (
    <button type="button" className="today__aside" title="Another one" onClick={() => setTurn((n) => n + 1)}>
      {by ? `“${says}”` : says}
      {by && <span className="today__by"> {by}</span>}
    </button>
  );
}
