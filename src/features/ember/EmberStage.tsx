import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DANCES, pokeAt, writingMode, type EmberDance, type LineMode } from "@shared/ember";
import {
  isChuck,
  leap,
  nothingBelow,
  releaseSpeed,
  shape,
  SIZE,
  standing,
  step,
  type Body,
  type BodyEvent,
  type Ledge,
} from "@shared/body";
import { doodleOf } from "@shared/wardrobe";
import { aimFor, climbed, stranded, WAYS_UP, type WayUp } from "@shared/ascent";
import { keyOf, learnedBy, LADDER, needsLabel, needsOf, warmthBand, type EmberStats, type Learnable, type Warmth } from "@shared/growth";
import { herPick, tidy, wear, type Garment, type Outfit } from "@shared/closet";
import { Ember, type EmberPose } from "@/components/Ember";
import { chirp, speak } from "@/lib/chirp";
import { emberPref, useEmberPref } from "@/lib/emberPrefs";
import {
  askEmber,
  botherEmber,
  feedEmber,
  onFed,
  onKnock,
  onStatsChanged,
  playEmber,
  pokeEmber,
  setDoor,
  setWarmth,
  useEmberState,
  useLine,
} from "./stage";
import { Book, nameOf } from "./Book";

/**
 * Ember, alive in the window.
 *
 * She has a body - `shared/body.ts`, sixty times a second - and a small mind
 * that decides what the body does next. She lives behind a door at the end of
 * the quick line: she comes out of it when Caulder opens, wanders the line,
 * stops, looks about, breaks into a run now and then, and goes back in when
 * it is late. Pick her up and put her on any card and she wanders that
 * instead. Throw her and she tumbles, bounces off cards higher than is fair,
 * splats flat on walls and peels off them. Drop her over nothing and she
 * sprouts wings, flaps, fails, and falls out of the bottom of the window -
 * and a moment later her door bursts open and out she stumbles. Put her down
 * on a card below her line and she stands there a moment, looks up, and gets
 * herself back the hard way: see `shared/ascent.ts` for the five ways.
 *
 * **She lives on Today and nowhere else.** Leave it and she is simply not
 * there; come back and she is standing on her line where you left her - not
 * coming out of her door again every time you change tabs, which would be a
 * routine the tenth time. Only a real absence (the night, the switch in
 * Settings) sends her indoors.
 *
 * **She is the reason to keep your habits** (shared/growth.ts). Every habit
 * ticked sends a marshmallow flying from the box you ticked into her mouth;
 * how many you have kept these last days is how warm she is, and a cold
 * Ember walks slowly, rests a lot and sits by her door. Every level teaches
 * her something, and when it does a present drops onto her line and she
 * opens it and shows you. Right-click her for her book.
 *
 * **She has a personality.** She dresses herself each morning - a scarf and
 * sneakers, and something extra most days - unless you have dressed her. She
 * says good morning, or asks if you are up late. She has a favourite dance.
 * Left alone long enough she gets bored and does it anyway. And the day
 * every habit is fed, she says so.
 *
 * **Moved by a transform written straight onto her element**, not by React
 * state. She moves every frame; re-rendering a sprite of a few hundred rects
 * sixty times a second to move it would be most of the frame. React hears
 * about her only when what she looks like changes - held, flying, walking -
 * which is a few times a second at most.
 */

/** Her mind: what she means to be doing. */
type Plan =
  | { kind: "inside"; since: number }
  | { kind: "coming-out"; since: number }
  | { kind: "going-in"; since: number }
  | { kind: "peeking"; since: number }
  | { kind: "idle"; until: number }
  | { kind: "walk"; to: number; speed: number }
  | { kind: "look"; until: number; turns: number }
  | { kind: "held" }
  | { kind: "air" }
  | { kind: "coyote"; until: number }
  | { kind: "away"; until: number }
  /** Stranded below her line, looking up at it and thinking about it. */
  | { kind: "ponder"; until: number }
  /** On her way back up, the hard way. */
  | Journey;

type Journey = {
  kind: "journey";
  way: WayUp;
  since: number;
  /** Her box where she set off from, and where she means to stand. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Beats already played, so each happens once. */
  fired: Set<string>;
};

/** What the stage draws round her on the way up: a rope, a hook, a web, a spring, a flame, smoke. */
type Extras = {
  line?: { x1: number; y1: number; x2: number; y2: number; kind: "rope" | "web" };
  hook?: { x: number; y: number };
  splat?: { x: number; y: number };
  spring?: { x: number; y: number; h: number };
  jet?: { x: number; y: number; big: boolean };
  puff?: { x: number; y: number; age: number };
  mallow?: { x: number; y: number };
  gift?: { x: number; y: number };
};

/** How long the wings hold before they give out. Long enough for hope. */
const FLAP_MS = 900;
/** How long she is gone after falling out of the window before her door bursts open. */
const AWAY_MS = 1100;
/** On a card that is not home for this long, she leaps home. */
const HOMESICK_MS = 45_000;
/** A hit faster than this shakes the window. */
const QUAKE_FROM = 1500;
/** Walking and running speeds, pixels a second. */
const WALK = [70, 115] as const;
const RUN = 250;

type Look = { pose: EmberPose | null; walking: "no" | "walk" | "run"; homeward: boolean };

/** A present on her line: something she has just learned. */
type Gift = {
  item: Learnable;
  x: number;
  y: number;
  vy: number;
  bounced: number;
  phase: "falling" | "waiting" | "opening";
  since: number;
  announced: boolean;
};

/** How the warmth your habits give her shows in how she moves: speed, and how long she rests. */
const PACE: Record<Warmth, number> = { blazing: 1.25, warm: 1, low: 0.7, embers: 0.5 };
const REST: Record<Warmth, number> = { blazing: 0.7, warm: 1, low: 1.6, embers: 3 };

/** A cold Ember says so, now and then - never oftener than this. */
const HUNGRY_EVERY_MS = 75_000;

const SEEN = "caulder.ember.seen";
const OUTFIT = "caulder.ember.outfit";
const FAVOURITE = "caulder.ember.favourite";
const GREETED = "caulder.ember.greeted";
const ALL_FED = "caulder.ember.allfed";

/** Left alone this long on Today, she gets bored. */
const BORED_AFTER_MS = 3 * 60_000;

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Nowhere to keep it: she forgets, which is the kinder failure.
  }
}

/** What you dressed her in, if you did. */
function readOutfit(): Outfit | null {
  const stored = readKey(OUTFIT);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as Outfit;
  } catch {
    return null;
  }
}

/** Good morning, afternoon or evening - or a gentle word about the hour. */
function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Morning!";
  if (hour >= 12 && hour < 17) return "Afternoon!";
  if (hour >= 17 && hour < 22) return "Evening!";
  return "Up late?";
}

/** What she has already been given, so a present is never given twice. Null the first time ever. */
function readSeen(): Set<string> | null {
  try {
    const stored = window.localStorage.getItem(SEEN);
    return stored ? new Set(JSON.parse(stored) as string[]) : null;
  } catch {
    return null;
  }
}

function writeSeen(keys: Iterable<string>): void {
  try {
    window.localStorage.setItem(SEEN, JSON.stringify([...keys]));
  } catch {
    // Nowhere to remember it: she may give it again, which is the kinder failure.
  }
}

function between(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

type Survey = { ledges: Ledge[]; elements: Map<string, Element>; home: { ledge: Ledge; door: number } | null };

/**
 * Each card's own name, for as long as it is on the page. By element, not by
 * position: counted by position, a habit ticked or a card appearing above
 * her renumbered every card below, and the one she was standing on became
 * somebody else's - or nobody's, and she fell through it.
 */
const cardIds = new WeakMap<Element, string>();
let cardsNamed = 0;

function cardId(element: Element): string {
  let id = cardIds.get(element);
  if (!id) {
    cardsNamed += 1;
    id = `ledge-${cardsNamed}`;
    cardIds.set(element, id);
  }
  return id;
}

/** Every card on the screen, as somewhere to stand; and which one has her door. */
function survey(): Survey {
  const ledges: Ledge[] = [];
  const elements = new Map<string, Element>();
  let home: Survey["home"] = null;
  const door = document.querySelector("[data-ember-door]");
  const doorBox = door?.getBoundingClientRect();
  document.querySelectorAll(".card").forEach((element) => {
    const box = element.getBoundingClientRect();
    // Every card, on screen or not. The page scrolls under her, and a card
    // scrolled out of view is still the one she is standing on: she goes up
    // out of sight with it and is there when you scroll back, instead of
    // losing her footing and falling onto whatever is on screen.
    if (box.width < 96 || box.height < 24) return;
    const ledge = { id: cardId(element), left: box.left + 12, right: box.right - 12, top: box.top };
    ledges.push(ledge);
    elements.set(ledge.id, element);
    if (door && doorBox && element.contains(door)) home = { ledge, door: doorBox.left + doorBox.width / 2 };
  });
  return { ledges, elements, home };
}

/**
 * The card she is standing on, measured again. She is drawn over the window
 * rather than in the page, so the page scrolls and shifts under her; looking
 * round five times a second left her hanging where her card had been, in
 * front of something else, and then jumping back onto it. One card a frame
 * keeps her feet on it the frame it moves.
 */
function followed(world: Survey, id: string): Survey {
  const element = world.elements.get(id);
  const was = world.ledges.find((one) => one.id === id);
  if (!element || !was || !element.isConnected) return world;
  const box = element.getBoundingClientRect();
  // Gone, or too small to stand on: the next full look decides.
  if (box.width < 96 || box.height < 24) return world;
  if (box.top === was.top && box.left + 12 === was.left && box.right - 12 === was.right) return world;
  const ledge = { id, left: box.left + 12, right: box.right - 12, top: box.top };
  const ledges = world.ledges.map((one) => (one.id === id ? ledge : one));
  const home = world.home && world.home.ledge.id === id ? { ...world.home, ledge } : world.home;
  return { ...world, ledges, home };
}

/** The card she landed on gives under her. */
function thump(element: Element | undefined): void {
  if (!element) return;
  element.classList.remove("ember-thump");
  void (element as HTMLElement).offsetWidth;
  element.classList.add("ember-thump");
  setTimeout(() => element.classList.remove("ember-thump"), 420);
}

/** A hit hard enough to shake the window. */
function quake(): void {
  const shell = document.querySelector(".shell");
  if (!shell) return;
  shell.classList.remove("ember-quake");
  void (shell as HTMLElement).offsetWidth;
  shell.classList.add("ember-quake");
  setTimeout(() => shell.classList.remove("ember-quake"), 380);
}

/** Shows or hides one of the drawn extras, touching the page only when it changes. */
function show(node: SVGElement, on: boolean): void {
  const display = on ? "" : "none";
  if (node.style.display !== display) node.style.display = display;
}

function stillness(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function localDay(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function lateNow(): boolean {
  const hour = new Date().getHours();
  return hour >= 1 && hour < 6;
}

export function EmberStage({ personal, home: onHome, companyId }: { personal: boolean; home: boolean; companyId: string | null }) {
  const { cross, burning } = useEmberState();
  const line = useLine();
  const switchedOn = useEmberPref("out");
  const allowed = switchedOn && onHome;
  /** She was out when you left Today: when you come back, she is still out. */
  const wasOut = useRef(false);
  const mode: LineMode = line?.mode ?? writingMode(personal);

  const el = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const body = useRef<Body | null>(null);
  const plan = useRef<Plan>({ kind: "inside", since: performance.now() });
  const facing = useRef<1 | -1>(1);
  const busy = useRef(false);
  /** A trick playing right now: the one thing a present waits for. */
  const playing = useRef(false);
  const gait = useRef(0);
  const shown = useRef(0);
  const flapping = useRef<number | null>(null);
  const plunging = useRef(false);
  const settledAt = useRef(0);
  const hand = useRef<{ dx: number; dy: number; samples: { t: number; x: number; y: number }[] } | null>(null);
  /** How many times she has had to get back up, so she tries a different way each time. */
  const climbs = useRef(0);
  /** What she says, or does, when she lands back on her line after a way up. */
  const finale = useRef<"nailed" | "bow" | null>(null);
  const rope = useRef<SVGLineElement>(null);
  const ropeUnder = useRef<SVGLineElement>(null);
  const hook = useRef<SVGGElement>(null);
  const splat = useRef<SVGGElement>(null);
  const spring = useRef<SVGPolylineElement>(null);
  const jet = useRef<SVGGElement>(null);
  const puff = useRef<SVGGElement>(null);
  const treatNode = useRef<SVGGElement>(null);
  const giftNode = useRef<SVGGElement>(null);
  const [look, setLook] = useState<Look>({ pose: null, walking: "no", homeward: false });
  const [out, setOut] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuEl = useRef<HTMLDivElement>(null);

  // The menu closes on Escape or a click anywhere else, and opens with its
  // first item focused so it works from the keyboard too.
  useEffect(() => {
    if (!menu) return;
    menuEl.current?.querySelector("button")?.focus();
    const away = (event: PointerEvent) => {
      if (!menuEl.current?.contains(event.target as Node)) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", escape);
    };
  }, [menu]);

  // React hears about her only when something it draws has changed. Asked
  // every frame, even a "no change" is an update queued sixty times a second.
  const lastLook = useRef<Look>({ pose: null, walking: "no", homeward: false });
  const lastOut = useRef(false);
  const showLook = useCallback((next: Look) => {
    const was = lastLook.current;
    if (was.pose === next.pose && was.walking === next.walking && was.homeward === next.homeward) return;
    lastLook.current = next;
    setLook(next);
  }, []);
  const showOut = useCallback((next: boolean) => {
    if (lastOut.current === next) return;
    lastOut.current = next;
    setOut(next);
  }, []);

  /** A line out loud and in her bubble. */
  const say = useCallback((text: string) => playEmber({ say: text }), []);
  /** A line in her bubble only: something she says of her own accord. */
  const mutter = useCallback((text: string) => playEmber({ say: text, quiet: true }), []);

  // ---- How she is doing: read from what you have done ----------------------
  const [stats, setStats] = useState<EmberStats | null>(null);
  const learned = useMemo(() => (stats ? learnedBy(stats) : null), [stats]);
  const band: Warmth = stats ? warmthBand(stats.warmth) : "warm";
  const bandNow = useRef(band);
  bandNow.current = band;
  const learnedNow = useRef(learned);
  learnedNow.current = learned;
  useEffect(() => setWarmth(band), [band]);

  useEffect(() => {
    if (!companyId) return;
    let live = true;
    let soon: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      clearTimeout(soon);
      // A moment's grace, so a burst of changes is one read.
      soon = setTimeout(() => {
        window.caulder.ember.stats(companyId).then(
          (next) => live && setStats(next),
          () => undefined,
        );
      }, 150);
    };
    read();
    const beat = setInterval(read, 60_000);
    const off = onStatsChanged(read);
    return () => {
      live = false;
      clearTimeout(soon);
      clearInterval(beat);
      off();
    };
  }, [companyId]);

  // ---- Her clothes: her own pick, unless you dressed her ------------------
  const has = useCallback((garment: Garment) => !learned || learned.has(`garment:${garment}`), [learned]);
  const [chosenOutfit, setChosenOutfit] = useState<Outfit | null>(() => readOutfit());
  const outfit = useMemo(() => (chosenOutfit ? tidy(chosenOutfit, has) : herPick(localDay(), has)), [chosenOutfit, has]);

  // ---- Her favourite dance: chosen once, from what she knows, and kept ----
  const [favourite, setFavourite] = useState<string | null>(() => readKey(FAVOURITE));
  useEffect(() => {
    if (favourite || !learned) return;
    const known = DANCES.filter((one) => learned.has(`dance:${one}`));
    const pick = known[Math.floor(Math.random() * known.length)];
    if (!pick) return;
    writeKey(FAVOURITE, pick);
    setFavourite(pick);
  }, [favourite, learned]);
  const favouriteNow = useRef(favourite);
  favouriteNow.current = favourite;

  // ---- The day every habit is fed, she says so, once ---------------------
  useEffect(() => {
    if (!stats || stats.habits === 0 || stats.keptToday < stats.habits) return;
    const day = localDay();
    if (readKey(ALL_FED) === day) return;
    writeKey(ALL_FED, day);
    setTimeout(() => {
      playEmber({ trick: "dance", loud: true });
      say("All fed. Best day ever!");
    }, 1400);
  }, [stats, say]);

  // ---- Somebody about: the pointer moving, a key pressed -----------------
  const lastSeen = useRef(performance.now());
  useEffect(() => {
    const seen = () => {
      lastSeen.current = performance.now();
    };
    window.addEventListener("pointermove", seen, { passive: true });
    window.addEventListener("keydown", seen);
    return () => {
      window.removeEventListener("pointermove", seen);
      window.removeEventListener("keydown", seen);
    };
  }, []);

  // Presents: whatever she knows now that she had not been given before.
  // The very first time, everything she starts with counts as given.
  const gifts = useRef<Learnable[]>([]);
  const gift = useRef<Gift | null>(null);
  useEffect(() => {
    if (!learned) return;
    const seen = readSeen();
    if (seen === null) {
      writeSeen(learned);
      return;
    }
    const waiting = new Set([...gifts.current.map(keyOf), ...(gift.current ? [keyOf(gift.current.item)] : [])]);
    for (const rung of LADDER) {
      const key = keyOf(rung.item);
      if (learned.has(key) && !seen.has(key) && !waiting.has(key)) gifts.current.push(rung.item);
    }
  }, [learned]);

  // Feeding: a habit ticked throws a marshmallow from wherever you clicked.
  const mallow = useRef<{ from: { x: number; y: number }; since: number } | null>(null);
  const lastPoint = useRef<{ x: number; y: number; at: number } | null>(null);
  useEffect(() => {
    const note = (event: PointerEvent) => {
      lastPoint.current = { x: event.clientX, y: event.clientY, at: performance.now() };
    };
    window.addEventListener("pointerdown", note, true);
    return () => window.removeEventListener("pointerdown", note, true);
  }, []);
  useEffect(
    () =>
      onFed(() => {
        const me = body.current;
        if (!me) return;
        const point = lastPoint.current;
        const fresh = point && performance.now() - point.at < 3000;
        mallow.current = { from: fresh ? { x: point.x, y: point.y } : { x: me.x + 32, y: me.y - 160 }, since: performance.now() };
        chirp("whoosh");
      }),
    [],
  );

  // A knock on the door: she comes out, unless it is the small hours, when
  // she opens it just far enough to say so.
  useEffect(
    () =>
      onKnock(() => {
        chirp("tok");
        setTimeout(() => chirp("tok"), 140);
        if (plan.current.kind !== "inside") return;
        plan.current = { kind: lateNow() ? "peeking" : "coming-out", since: performance.now() };
      }),
    [],
  );

  // Under reduced motion she does not wander, fall or tumble: she stands on
  // the line beside her door, where she lives, and that is all.
  useEffect(() => {
    if (!allowed || !stillness()) return;
    const place = () => {
      const home = survey().home;
      const node = el.current;
      if (!node) return;
      if (!home) {
        body.current = null;
        node.style.opacity = "0";
        node.style.pointerEvents = "none";
        return;
      }
      body.current = standing(home.door - SIZE / 2 + 40, home.ledge);
      node.style.opacity = "1";
      node.style.pointerEvents = "auto";
      node.style.transform = `translate(${body.current.x}px, ${body.current.y}px)`;
    };
    place();
    const beat = setInterval(place, 500);
    return () => clearInterval(beat);
  }, [allowed]);

  // The frame loop: her mind picks what to do, her body does it.
  useEffect(() => {
    if (!allowed) {
      const kind = plan.current.kind;
      wasOut.current = switchedOn && body.current !== null && kind !== "inside" && kind !== "away" && kind !== "going-in";
      body.current = null;
      plan.current = { kind: "inside", since: performance.now() };
      if (el.current) {
        el.current.style.opacity = "0";
        el.current.style.pointerEvents = "none";
      }
      showOut(false);
      if (!switchedOn) setDoor("shut");
      return;
    }
    if (stillness()) return;
    let frame = 0;
    let nap: ReturnType<typeof setTimeout> | undefined;
    let nextGiftAt = 0;
    let lastHungry = performance.now();
    let last = performance.now();
    let world = survey();
    let surveyed = last;
    let fell = false;
    // The page scrolled or the window changed size: every card moved at once,
    // so look again this frame rather than in a fifth of a second. Scroll
    // events do not bubble; caught on the way down, any scroller counts.
    let dirty = false;
    const moved = () => {
      dirty = true;
    };
    window.addEventListener("scroll", moved, { capture: true, passive: true });
    window.addEventListener("resize", moved, { passive: true });

    /** What her body just did, and what the world does about it. */
    const handle = (event: BodyEvent, now: number) => {
      switch (event.kind) {
        case "landed": {
          thump(world.elements.get(event.ledge.id));
          chirp("thud");
          flapping.current = null;
          plunging.current = false;
          settledAt.current = now;
          plan.current = { kind: "idle", until: now + between(700, 1600) };
          const home = world.home;
          if (home && event.ledge.id === home.ledge.id && finale.current) {
            if (finale.current === "bow") playEmber({ trick: "bow", loud: true });
            else say("Nailed it.");
            finale.current = null;
          } else if (home && event.ledge.id !== home.ledge.id && stranded(event.ledge.top, home.ledge.top)) {
            // Put down below her line: she looks up at it, and has a think.
            finale.current = null;
            plan.current = { kind: "ponder", until: now + between(1600, 2600) };
            setTimeout(() => say("Hmm."), 450);
          } else if (event.impact > 900) say("Oof!");
          break;
        }
        case "bounced":
          thump(world.elements.get(event.ledge.id));
          chirp("boing");
          flapping.current = null;
          plunging.current = false;
          if (event.impact >= QUAKE_FROM) quake();
          if (event.impact > 1100) say("Boing!");
          break;
        case "bonk":
          chirp("bonk");
          botherEmber("bump");
          if (event.impact >= QUAKE_FROM) quake();
          break;
        case "splat":
          chirp("splat");
          botherEmber("bump");
          if (event.impact >= QUAKE_FROM) quake();
          say(event.impact >= QUAKE_FROM ? "SPLAT!" : "Splat.");
          break;
        case "unstuck":
          chirp("whoop");
          break;
        case "edge":
          if (plan.current.kind === "walk") plan.current = { kind: "idle", until: now + between(600, 1400) };
          break;
        case "lost":
          // The ground went. She hangs there, looks down, and then goes.
          plan.current = { kind: "coyote", until: now + 450 };
          say("Uh oh.");
          break;
        case "gone":
          botherEmber("drop");
          flapping.current = null;
          plunging.current = false;
          fell = true;
          plan.current = { kind: "away", until: now + AWAY_MS };
          setTimeout(() => chirp("thud"), 250);
          break;
      }
    };

    const go = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      // Real time since the last frame, for her body. Chromium hands a window
      // it thinks is covered only a frame or so a second, and one physics step
      // per frame, capped so she cannot pass through a card, then plays her in
      // slow motion - a leap home took twenty seconds. Real time, cut into
      // small steps, keeps her falling at the speed things fall.
      const elapsed = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (dirty || now - surveyed > 200) {
        world = survey();
        surveyed = now;
        dirty = false;
      } else if (body.current?.on) {
        world = followed(world, body.current.on);
      }
      const size = { width: window.innerWidth, height: window.innerHeight, ledges: world.ledges };

      /** Her body moved on by `seconds`, a sixtieth at a time; null if she fell out of the window. */
      const advance = (who: Body, seconds: number, want: { walk: number; speed: number }): Body | null => {
        let moved: Body | null = who;
        const began = plan.current;
        let left = seconds;
        while (moved && left > 1e-6) {
          const h = Math.min(left, 1 / 60);
          left -= h;
          const next = step(moved, h, size, want);
          moved = next.body;
          for (const event of next.events) handle(event, now);
          if (fell) {
            fell = false;
            return null;
          }
          // Landed, splatted, lost her footing: the rest of the frame is the
          // new plan's business.
          if (plan.current !== began) break;
        }
        return moved;
      };
      const home = world.home;
      const mind = plan.current;
      let me = body.current;
      let visible = 1;
      let intent = { walk: 0, speed: 0 };

      // ---- Her mind -------------------------------------------------------
      switch (mind.kind) {
        case "inside":
          visible = 0;
          me = null;
          if (home && wasOut.current) {
            // Back on Today after a look elsewhere: she never went anywhere.
            wasOut.current = false;
            me = standing(Math.min(home.ledge.right - SIZE / 2 - 12, home.door - SIZE / 2 + 60), home.ledge);
            shown.current = 1;
            visible = 1;
            plan.current = { kind: "idle", until: now + between(800, 2000) };
            break;
          }
          if (home && lateNow()) setDoor("sleeping");
          else if (home && now - mind.since > 700) plan.current = { kind: "coming-out", since: now };
          break;
        case "peeking": {
          // Woken in the small hours: the door opens, a sleepy face, and back to bed.
          const t = now - mind.since;
          setDoor("open");
          if (home && t > 250 && t < 2200) {
            if (!me) {
              me = standing(home.door - SIZE / 2, home.ledge);
              say("Five more minutes...");
            }
            visible = Math.min(1, (t - 250) / 200);
          } else {
            visible = 0;
            if (t >= 2200) me = null;
          }
          if (t > 2400) {
            plan.current = { kind: "inside", since: now };
            setDoor("sleeping");
          }
          break;
        }
        case "coming-out": {
          const t = now - mind.since;
          setDoor("open");
          visible = 0;
          if (!home) {
            plan.current = { kind: "inside", since: now };
            setDoor("shut");
          } else if (t > 220) {
            // Out of the door with a hop, into the world.
            me = { ...standing(home.door - SIZE / 2, home.ledge), on: null, vx: 170, vy: -520, spin: 60, qv: 3 };
            facing.current = 1;
            visible = 1;
            chirp("boing");
            plan.current = { kind: "air" };
            setTimeout(() => setDoor("shut"), 380);
            // The first time out each day, she says hello - in her bubble only.
            const day = localDay();
            if (readKey(GREETED) !== day) {
              writeKey(GREETED, day);
              setTimeout(() => mutter(greetingFor(new Date().getHours())), 900);
            }
          }
          break;
        }
        case "going-in": {
          const t = now - mind.since;
          setDoor("open");
          visible = Math.max(0, 1 - t / 260);
          if (t > 420) {
            me = null;
            plan.current = { kind: "inside", since: now };
            setDoor(lateNow() ? "sleeping" : "shut");
            chirp("tok");
          }
          break;
        }
        case "away":
          visible = 0;
          me = null;
          if (now > mind.until) {
            plan.current = home ? { kind: "coming-out", since: now } : { kind: "inside", since: now };
            if (home) setTimeout(() => say("I'm fine!"), 650);
          }
          break;
        case "walk": {
          if (!me?.on) break;
          const gap = mind.to - me.x;
          if (Math.abs(gap) < 4) {
            // Arrived at the door at bedtime: in she goes.
            if (home && me.on === home.ledge.id && lateNow() && Math.abs(me.x + SIZE / 2 - home.door) < 12) {
              plan.current = { kind: "going-in", since: now };
            } else plan.current = { kind: "idle", until: now + between(1200, 3500) };
            break;
          }
          intent = { walk: Math.sign(gap), speed: mind.speed };
          break;
        }
        case "look":
          if (now > mind.until) {
            if (mind.turns > 0) {
              facing.current = facing.current === 1 ? -1 : 1;
              if (me) me = { ...me, qv: me.qv - 2 };
              plan.current = { kind: "look", until: now + between(500, 900), turns: mind.turns - 1 };
            } else plan.current = { kind: "idle", until: now + between(800, 2000) };
          }
          break;
        case "idle": {
          if (!me?.on || busy.current || now < mind.until) break;
          const here = me;
          const ledge = world.ledges.find((one) => one.id === here.on);
          if (!ledge) break;
          const onHome = home?.ledge.id === ledge.id;
          if (onHome && home && lateNow()) {
            plan.current = { kind: "walk", to: home.door - SIZE / 2, speed: WALK[0] };
            break;
          }
          if (!onHome && home && now - settledAt.current > HOMESICK_MS) {
            const launch = leap(me, { x: home.door - SIZE / 2 + 50, y: home.ledge.top - 60 });
            me = { ...me, on: null, vx: launch.vx, vy: launch.vy, spin: Math.sign(launch.vx || 1) * 360, qv: me.qv - 3 };
            chirp("boing");
            plan.current = { kind: "air" };
            break;
          }
          const warm = bandNow.current;
          const pace = PACE[warm];
          const rest = REST[warm];
          // Cold, she says so now and then - quietly, and never nagging.
          if ((warm === "low" || warm === "embers") && now - lastHungry > HUNGRY_EVERY_MS) {
            lastHungry = now;
            mutter(warm === "embers" ? "So... cold..." : "Hungry...");
          }
          // Nobody about for a while: she gets bored, and does her favourite
          // dance anyway, to nobody. Then asks.
          if (now - lastSeen.current > BORED_AFTER_MS && onHome) {
            lastSeen.current = now;
            const loved = favouriteNow.current;
            if (loved && learnedNow.current?.has(`dance:${loved}`)) playEmber({ trick: "dance", loud: false, dance: loved as EmberDance });
            setTimeout(() => mutter("...anyone there?"), 3500);
            plan.current = { kind: "idle", until: now + 6000 };
            break;
          }
          // Down to embers she goes and sits by her door, and waits for you.
          if (warm === "embers" && onHome && home) {
            const door = home.door - SIZE / 2 + 36;
            plan.current =
              Math.abs(me.x - door) > 8
                ? { kind: "walk", to: door, speed: WALK[0] * pace }
                : { kind: "idle", until: now + between(4000, 7000) };
            break;
          }
          const roll = Math.random();
          const lo = ledge.left - SIZE / 2 + 8;
          const hi = ledge.right - SIZE / 2 - 8;
          if (roll < 0.58) {
            let to = between(lo, hi);
            if (Math.abs(to - me.x) < 60) to = me.x + (to < me.x ? -90 : 90);
            plan.current = { kind: "walk", to: Math.max(lo, Math.min(hi, to)), speed: between(WALK[0], WALK[1]) * pace };
          } else if (roll < (warm === "blazing" ? 0.78 : 0.7) && warm !== "low") {
            plan.current = { kind: "walk", to: me.x < (lo + hi) / 2 ? hi : lo, speed: RUN * pace };
          } else if (roll < 0.88) {
            plan.current = { kind: "look", until: now + 400 * rest, turns: 2 };
          } else {
            plan.current = { kind: "idle", until: now + between(2500, 5000) * rest };
          }
          break;
        }
        case "ponder": {
          if (!me?.on) break;
          if (home) facing.current = home.door > me.x + 32 ? 1 : -1;
          // Getting home outranks a pastime: the book can wait.
          if (now < mind.until) break;
          if (!home) {
            plan.current = { kind: "idle", until: now + 1000 };
            break;
          }
          plan.current = {
            kind: "journey",
            way: (() => {
              const known = WAYS_UP.filter((one) => !learnedNow.current || learnedNow.current.has(`way:${one}`));
              return known[climbs.current++ % Math.max(1, known.length)] ?? "rope";
            })(),
            since: now,
            from: { x: me.x, y: me.y },
            to: { x: aimFor(me.x, home.ledge), y: home.ledge.top - 60 },
            fired: new Set(),
          };
          break;
        }
        default:
          break;
      }

      // ---- The way back up ------------------------------------------------
      let extras: Extras = {};
      let journeyPose: EmberPose | null = null;
      const trip = plan.current;
      if (trip.kind === "journey" && me) {
        const t = (now - trip.since) / 1000;
        const cue = (key: string, at: number, then: () => void) => {
          if (t >= at && !trip.fired.has(key)) {
            trip.fired.add(key);
            then();
          }
        };
        const lerp = (a: number, b: number, u: number) => a + (b - a) * Math.max(0, Math.min(1, u));
        if (!home) {
          // Her line went while she was on her way to it.
          me = { ...me, on: null };
          plan.current = { kind: "air" };
        } else {
          const anchor = { x: trip.to.x + 32, y: home.ledge.top };
          const handAt = (who: Body) => ({ x: who.x + 32, y: who.y + 14 });
          const arrive = (flop: number) => {
            me = { ...standing(trip.to.x, home.ledge), angle: flop, spin: 0, qv: -3 };
            settledAt.current = now;
            plan.current = { kind: "idle", until: now + between(1500, 2500) };
          };

          switch (trip.way) {
            case "rope": {
              // The hook, thrown up - and straight back down onto her head.
              journeyPose = "aim";
              if (t >= 0.5 && t < 1.2) {
                const u = (t - 0.5) / 0.7;
                const hand0 = handAt(me);
                extras.hook = { x: hand0.x + 12 * Math.sin(Math.PI * u), y: hand0.y - (trip.from.y - trip.to.y) * 0.55 * Math.sin(Math.PI * u) };
              }
              cue("whoosh", 0.5, () => chirp("swish"));
              cue("bonk", 1.2, () => playEmber({ trick: "bonk", loud: true }));
              if (t >= 1.2 && t < 2.3) journeyPose = null;
              // Again, and this time it catches.
              if (t >= 2.3 && t < 2.65) {
                const u = 1 - Math.pow(1 - (t - 2.3) / 0.35, 2);
                const hand0 = handAt(me);
                extras.hook = { x: lerp(hand0.x, anchor.x, u), y: lerp(hand0.y, anchor.y, u) };
                extras.line = { x1: hand0.x, y1: hand0.y, x2: extras.hook.x, y2: extras.hook.y, kind: "rope" };
              }
              cue("swish2", 2.3, () => chirp("swish"));
              cue("clang", 2.65, () => chirp("clang"));
              cue("heave", 2.8, () => say("Hnnngh!"));
              if (t >= 2.65) {
                const climb = climbed(t - 2.9);
                if (t >= 2.9) {
                  me = { ...me, on: null, vx: 0, vy: 0, x: lerp(trip.from.x, trip.to.x, climb.share), y: lerp(trip.from.y, trip.to.y - 12, climb.share), q: climb.slipping ? -0.1 : 0.12, angle: 0, spin: 0 };
                  facing.current = climb.pull % 2 === 0 ? 1 : -1;
                  journeyPose = climb.slipping ? "slip" : "climb";
                  if (climb.slipping) cue("slip", 0, () => {
                    chirp("whoop");
                    say("Whoa!");
                  });
                }
                const hand0 = handAt(me);
                extras.hook = anchor;
                extras.line = { x1: anchor.x, y1: anchor.y, x2: hand0.x, y2: hand0.y, kind: "rope" };
                if (climb.done) {
                  // Over the edge in a heap, and up, as if nothing happened.
                  chirp("thud");
                  arrive(facing.current * 80);
                  setTimeout(() => say("Easy."), 800);
                  extras = {};
                }
              }
              break;
            }
            case "web": {
              journeyPose = "aim";
              cue("thwip", 0.05, () => {
                chirp("thwip");
                say("Thwip!");
              });
              const hand0 = handAt(me);
              if (t >= 0.05 && t < 0.2) {
                const u = (t - 0.05) / 0.15;
                extras.line = { x1: hand0.x, y1: hand0.y, x2: lerp(hand0.x, anchor.x, u), y2: lerp(hand0.y, anchor.y, u), kind: "web" };
              }
              if (t >= 0.2) extras.splat = anchor;
              if (t >= 0.2 && t < 0.35) extras.line = { x1: hand0.x, y1: hand0.y, x2: anchor.x, y2: anchor.y, kind: "web" };
              if (t >= 0.35 && t < 0.7) {
                // Yanked up by her own web, far harder than she expected.
                const u = Math.pow((t - 0.35) / 0.35, 2);
                me = { ...me, on: null, x: lerp(trip.from.x, trip.to.x, u), y: lerp(trip.from.y, trip.to.y - 90, u), q: 0.45, angle: 0, spin: 0 };
                journeyPose = "flying";
                const hand1 = handAt(me);
                extras.line = { x1: anchor.x, y1: anchor.y, x2: hand1.x, y2: hand1.y, kind: "web" };
              }
              if (t >= 0.7) {
                chirp("pop");
                me = { ...me, on: null, x: trip.to.x, y: trip.to.y - 90, vx: 0, vy: -220, spin: facing.current * 540, q: 0.3 };
                finale.current = "nailed";
                plan.current = { kind: "air" };
              }
              break;
            }
            case "magic": {
              cue("wand", 0, () => playEmber({ trick: "magic", loud: true }));
              cue("poof1", 1.15, () => chirp("poof"));
              if (t >= 1.15 && t < 1.75) extras.puff = { x: me.x + 32, y: me.y + 32, age: t - 1.15 };
              if (t >= 1.25 && t < 1.75) visible = 0;
              // It works - two steps to the left.
              cue("miss", 1.75, () => {
                const ledge = world.ledges.find((one) => one.id === me?.on);
                const shift = facing.current * -44;
                if (me && ledge) me = { ...me, x: Math.max(ledge.left - 32, Math.min(ledge.right - 32, me.x + shift)) };
                chirp("poof");
              });
              if (t >= 1.75 && t < 2.2) extras.puff = { x: me.x + 32, y: me.y + 32, age: t - 1.75 };
              cue("huh", 2.1, () => say("...huh."));
              cue("again", 2.9, () => {
                chirp("zap");
                say("Alakazam!");
              });
              cue("poof2", 3.3, () => chirp("poof"));
              if (t >= 3.3 && t < 3.8) {
                extras.puff = { x: me.x + 32, y: me.y + 32, age: t - 3.3 };
                if (t >= 3.4) visible = 0;
              }
              if (t >= 3.8) {
                chirp("poof");
                arrive(0);
                playEmber({ trick: "bow", loud: true });
              }
              break;
            }
            case "spring": {
              // Out comes a pogo spring, and she squashes it down with everything she has.
              cue("heave", 0.1, () => say("Hnnngh..."));
              const coil = t < 0.3 ? 22 * (t / 0.3) : t < 1.1 ? 22 - 14 * ((t - 0.3) / 0.8) : 8;
              me = { ...me, y: trip.from.y - coil, q: t < 0.3 ? 0 : -0.45 * Math.min(1, (t - 0.3) / 0.8), qv: 0 };
              extras.spring = { x: me.x + 32, y: trip.from.y + 60, h: coil };
              if (t >= 1.1) {
                chirp("boing");
                say("BOING!");
                const launch = leap(me, trip.to, 200);
                me = { ...me, on: null, vx: launch.vx, vy: launch.vy, spin: facing.current * 360, qv: 9 };
                finale.current = "bow";
                plan.current = { kind: "air" };
              }
              break;
            }
            case "rocket": {
              cue("count", 0, () => say("Three, two, one!"));
              const lit = t >= 0.3 && !(t >= 1.7 && t < 2.1);
              if (t < 1) {
                me = { ...me, x: trip.from.x + (Math.random() - 0.5) * 2 };
                if (lit) extras.jet = { x: me.x + 32, y: me.y + 60, big: false };
                break;
              }
              cue("lift", 1, () => {
                chirp("rocket");
                // Off the ground first: switched to falling while her feet are
                // exactly on the card's edge, she would land on it again this
                // very frame and the rocket would never leave.
                if (me) me = { ...me, on: null, y: me.y - 3, vy: -380 };
              });
              cue("sputter", 1.7, () => say("Uh oh."));
              cue("relight", 2.1, () => {
                chirp("rocket");
                say("Whoa!");
              });
              if (lit) me = { ...me, vy: Math.max(-650, me.vy - 3300 * dt) };
              me = advance({ ...me, on: null }, elapsed, { walk: 0, speed: 0 });
              if (plan.current !== trip || !me) break;
              const steer = Math.max(-260, Math.min(260, (trip.to.x - me.x) * 2.5 + Math.sin(t * 10) * 140));
              me = { ...me, vx: me.vx + (steer - me.vx) * Math.min(1, dt * 6), spin: (Math.sin(t * 8) * 18 - me.angle) * 8 };
              journeyPose = "flying";
              if (lit) extras.jet = { x: me.x + 32, y: me.y + 60, big: true };
              const above = me.y + 60 < trip.to.y + 60 - 50 && Math.abs(me.x - trip.to.x) < 30;
              if (above || t > 5.5) {
                finale.current = "nailed";
                plan.current = { kind: "air" };
              }
              break;
            }
          }
        }
      }

      // ---- A marshmallow on its way to her ------------------------------------
      const treat = mallow.current;
      if (treat && me) {
        const u = Math.min(1, (now - treat.since) / 480);
        const to = { x: me.x + 32, y: me.y + 22 };
        const lift = Math.min(treat.from.y, to.y) - 110;
        const x = (1 - u) * (1 - u) * treat.from.x + 2 * (1 - u) * u * ((treat.from.x + to.x) / 2) + u * u * to.x;
        const y = (1 - u) * (1 - u) * treat.from.y + 2 * (1 - u) * u * lift + u * u * to.y;
        extras.mallow = { x, y };
        if (me.on) facing.current = treat.from.x > me.x + 32 ? 1 : -1;
        if (u >= 1) {
          mallow.current = null;
          playEmber({ trick: "gulp", loud: true });
          me = { ...me, qv: me.qv - 3 };
        }
      } else if (treat) mallow.current = null;

      // ---- A present on her line --------------------------------------------
      const idleish = plan.current.kind === "idle" || plan.current.kind === "look" || plan.current.kind === "walk";
      if (!gift.current && gifts.current.length > 0 && home && me?.on === home.ledge.id && idleish && !playing.current && now > nextGiftAt) {
        const item = gifts.current.shift() as Learnable;
        const x = Math.max(home.ledge.left + 20, Math.min(home.ledge.right - 20, me.x + 32 + facing.current * 110));
        gift.current = { item, x, y: -40, vy: 0, bounced: 0, phase: "falling", since: now, announced: false };
      }
      const present = gift.current;
      if (present && !home) gift.current = null;
      else if (present && home) {
        const floor = home.ledge.top - 18;
        if (present.phase === "falling") {
          present.vy += 2600 * dt;
          present.y += present.vy * dt;
          if (present.y >= floor) {
            present.y = floor;
            if (present.vy > 350 && present.bounced < 2) {
              present.vy = -present.vy * 0.4;
              present.bounced += 1;
              chirp("tok");
            } else {
              present.vy = 0;
              present.phase = "waiting";
              say("Ooh! A present!");
            }
          }
        }
        if (present.phase === "waiting" && me?.on === home.ledge.id && !playing.current) {
          const beside = present.x - 32 + (me.x + 32 < present.x ? -26 : 26);
          if (Math.abs(me.x - beside) < 6) {
            present.phase = "opening";
            present.since = now;
            chirp("poof");
            facing.current = present.x > me.x + 32 ? 1 : -1;
            plan.current = { kind: "idle", until: now + 2000 };
          } else if (plan.current.kind !== "walk") {
            plan.current = { kind: "walk", to: beside, speed: WALK[1] };
          }
        }
        if (present.phase === "opening") {
          const age = (now - present.since) / 1000;
          if (age < 0.5) extras.puff = { x: present.x, y: present.y + 9, age };
          if (age > 0.25 && !present.announced) {
            present.announced = true;
            const seen = readSeen() ?? new Set<string>();
            seen.add(keyOf(present.item));
            writeSeen(seen);
            say(`New: ${nameOf(present.item)}!`);
          }
          if (age > 1.4) {
            const item = present.item;
            gift.current = null;
            nextGiftAt = now + 3500;
            if (item.kind === "dance") playEmber({ trick: "dance", loud: true, dance: item.id });
            else if (item.kind === "costume") playEmber({ trick: "signature", loud: true, costume: item.id });
            else playEmber({ trick: "cheer", loud: true });
          }
        } else {
          extras.gift = { x: present.x, y: present.y };
        }
      }

      // ---- Her body -------------------------------------------------------
      const phase = plan.current.kind;
      if (phase === "held" && me && hand.current) {
        // Hanging from the spot she was grabbed by, swinging behind the hand
        // like a pendulum, and stretched out by how hard she is being yanked.
        const samples = hand.current.samples;
        const a = samples[samples.length - 2];
        const b = samples[samples.length - 1];
        const hvx = a && b && b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 : 0;
        const hvy = a && b && b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;
        const swing = Math.max(-50, Math.min(50, -hvx * 0.06));
        const spin = me.spin + (-160 * (me.angle - swing) - 8 * me.spin) * dt;
        const stretch = Math.min(0.45, Math.hypot(hvx, hvy) / 3500);
        me = {
          ...me,
          x: (b?.x ?? me.x + hand.current.dx) - hand.current.dx,
          y: (b?.y ?? me.y + hand.current.dy) - hand.current.dy,
          vx: hvx,
          vy: hvy,
          spin,
          angle: me.angle + spin * dt,
          q: me.q + (stretch - me.q) * Math.min(1, dt * 14),
          qv: 0,
        };
      } else if (me && (phase === "coyote" || phase === "air" || phase === "idle" || phase === "walk" || phase === "look" || phase === "ponder")) {
        if (phase === "coyote") {
          if (now > (plan.current as { until: number }).until) plan.current = { kind: "air" };
        } else {
          // Busy, she stands still - unless she is on her way to a present,
          // which only a trick playing can hold up.
          const toGift = gift.current?.phase === "waiting" && !playing.current;
          me = advance(me, elapsed, busy.current && !toGift ? { walk: 0, speed: 0 } : intent);
        }
        // Wings: falling, with nothing under her.
        if (me && plan.current.kind === "air" && !me.on && !me.stuck) {
          if (flapping.current === null && !plunging.current && me.vy > 150 && nothingBelow(me, world.ledges)) {
            flapping.current = now;
            chirp("flap");
            say("Nooooo!");
          }
          if (flapping.current !== null) {
            if (now - flapping.current < FLAP_MS) {
              me = { ...me, vy: Math.min(me.vy, 140), vx: me.vx * 0.97, spin: -((((me.angle % 360) + 540) % 360) - 180) * 3 };
            } else {
              flapping.current = null;
              plunging.current = true;
              chirp("whistle");
              say("Aaaaaah!");
            }
          }
          // Head first, the whole way down.
          if (plunging.current) me = { ...me, spin: (180 - (((me.angle % 360) + 360) % 360)) * 5 };
        }
      }

      // Walking gait: a squash on every footfall and a hop between them,
      // which is what makes a walk bounce rather than slide.
      let bob = 0;
      if (me?.on && Math.abs(me.vx) > 15 && !busy.current) {
        const before = Math.floor(gait.current);
        gait.current += (dt * Math.abs(me.vx)) / 24;
        if (Math.floor(gait.current) !== before) me = { ...me, qv: me.qv - 1.1 - Math.abs(me.vx) / 250 };
        bob = -Math.abs(Math.sin(gait.current * Math.PI)) * Math.min(5, 1.5 + Math.abs(me.vx) / 60);
        facing.current = me.vx > 0 ? 1 : -1;
      }
      body.current = me;

      // ---- Drawing her ----------------------------------------------------
      shown.current += (visible - shown.current) * Math.min(1, dt * 14);
      if (visible === 1 && shown.current > 0.97) shown.current = 1;
      const node = el.current;
      if (node) {
        if (!me || shown.current < 0.02) {
          if (node.style.opacity !== "0") {
            node.style.opacity = "0";
            node.style.pointerEvents = "none";
          }
        } else {
          const { sx, sy } = shape(me.q);
          const speed = me.on ? 0 : Math.hypot(me.vx, me.vy);
          const k = me.stuck || phase === "held" ? 0 : Math.min(0.4, speed / 5000);
          const dir = (Math.atan2(me.vy, me.vx) * 180) / Math.PI;
          const wall = me.stuck?.wall;
          // Flat against the wall she hit, spread out along it.
          const splat = wall
            ? wall === "top"
              ? "translate(32px, 0px) scale(1.5, 0.4) translate(-32px, 0px)"
              : `translate(${wall === "left" ? 0 : 64}px, 32px) scale(0.35, 1.45) translate(${wall === "left" ? 0 : -64}px, -32px)`
            : "";
          // Coming out of and going into her door: she grows out of the doorway.
          const grow = 0.6 + shown.current * 0.4;
          const opacity = String(shown.current);
          if (node.style.opacity !== opacity) node.style.opacity = opacity;
          const catches = shown.current > 0.5 ? "auto" : "none";
          if (node.style.pointerEvents !== catches) node.style.pointerEvents = catches;
          // Where her feet are when she is standing, for anything that needs
          // to know without reading a transform: the spec about her, mostly.
          const feet = me.on ? String(Math.round(me.y + 60)) : "";
          if (node.dataset["feet"] !== feet) node.dataset["feet"] = feet;
          const transform = [
            `translate(${me.x.toFixed(1)}px, ${(me.y + bob).toFixed(1)}px)`,
            splat,
            k > 0.01 ? `translate(32px, 32px) rotate(${dir}deg) scale(${1 + k}, ${1 - k * 0.55}) rotate(${-dir}deg) translate(-32px, -32px)` : "",
            `translate(32px, 32px) rotate(${me.angle.toFixed(1)}deg) translate(-32px, -32px)`,
            `translate(32px, 60px) scale(${(facing.current * sx * grow).toFixed(3)}, ${(sy * grow).toFixed(3)}) translate(-32px, -60px)`,
          ].join(" ");
          // Standing still, nothing changes: write nothing, and the page has
          // nothing to recalculate. Rounded so a spring settling in its
          // fourth decimal place counts as still.
          if (node.style.transform !== transform) node.style.transform = transform;
        }
      }

      // What she has brought with her: rope, hook, web, spring, flame, smoke.
      const place = (node: SVGElement | null, at: { x: number; y: number } | undefined, more = "") => {
        if (!node) return;
        show(node, Boolean(at));
        if (at) node.setAttribute("transform", `translate(${at.x} ${at.y})${more}`);
      };
      for (const [node, under] of [
        [rope.current, false],
        [ropeUnder.current, true],
      ] as const) {
        if (!node) continue;
        const drawnLine = extras.line;
        show(node, Boolean(drawnLine));
        if (drawnLine) {
          node.setAttribute("x1", String(drawnLine.x1));
          node.setAttribute("y1", String(drawnLine.y1));
          node.setAttribute("x2", String(drawnLine.x2));
          node.setAttribute("y2", String(drawnLine.y2));
          node.setAttribute("class", `ember-way__line ember-way__line--${drawnLine.kind}${under ? " ember-way__line--under" : ""}`);
        }
      }
      place(hook.current, extras.hook);
      place(treatNode.current, extras.mallow);
      place(giftNode.current, extras.gift);
      place(splat.current, extras.splat);
      place(jet.current, extras.jet, extras.jet ? ` scale(${extras.jet.big ? 1.6 : 1} ${extras.jet.big ? 1.3 + Math.random() * 0.6 : 0.8 + Math.random() * 0.3})` : "");
      place(puff.current, extras.puff, extras.puff ? ` scale(${0.5 + extras.puff.age * 3})` : "");
      if (puff.current && extras.puff) puff.current.style.opacity = String(Math.max(0, 1 - extras.puff.age * 2));
      if (spring.current) {
        const coil = extras.spring;
        show(spring.current, Boolean(coil));
        if (coil) {
          const turns = 5;
          const points = Array.from({ length: turns * 2 + 1 }, (_, n) => `${coil.x + (n % 2 === 0 ? -9 : 9)},${coil.y - (coil.h * n) / (turns * 2)}`);
          spring.current.setAttribute("points", points.join(" "));
        }
      }
      const journeying = plan.current.kind === "journey" ? plan.current.way : "";
      if (node && node.dataset["journey"] !== journeying) node.dataset["journey"] = journeying;
      const unopened = String(gifts.current.length + (gift.current ? 1 : 0));
      if (node && node.dataset["gifts"] !== unopened) node.dataset["gifts"] = unopened;

      // Her shadow on whatever is under her: smaller and fainter the higher she is.
      const shade = shadow.current;
      if (shade) {
        const here = me;
        const below = here
          ? world.ledges
              .filter((one) => here.x + 32 >= one.left && here.x + 32 <= one.right && one.top >= here.y + 40)
              .sort((a, b) => a.top - b.top)[0]
          : undefined;
        if (!here || !below || shown.current < 0.02) {
          if (shade.style.opacity !== "0") shade.style.opacity = "0";
        } else {
          const height = Math.max(0, below.top - (here.y + 60));
          const scale = Math.max(0.3, 1 - height / 400);
          const opacity = (0.2 * scale * shown.current).toFixed(3);
          if (shade.style.opacity !== opacity) shade.style.opacity = opacity;
          const transform = `translate(${(here.x + 32).toFixed(1)}px, ${(below.top - 3).toFixed(1)}px) scale(${(scale * (me?.on ? shape(me.q).sx : 1)).toFixed(3)}, 1)`;
          if (shade.style.transform !== transform) shade.style.transform = transform;
        }
      }

      showLook({
        pose: journeyPose ??
          (phase === "held" || phase === "coyote"
            ? "held"
            : me?.stuck
              ? "splat"
              : flapping.current !== null
                ? "icarus"
                : plunging.current
                  ? "plunge"
                  : me && !me.on && phase === "air"
                    ? "flying"
                    : me?.on && Math.abs(me.vx) > 180 && learnedNow.current?.has("dance:ninjarun")
                      ? "ninja"
                      : null),
        walking: me?.on && Math.abs(me.vx) > 15 ? (Math.abs(me.vx) > 180 ? "run" : "walk") : "no",
        // Getting home, or a present waiting: her own life can wait.
        homeward:
          plan.current.kind === "ponder" || plan.current.kind === "journey" || finale.current !== null || gift.current !== null || gifts.current.length > 0,
      });
      showOut(Boolean(me) && shown.current > 0.02);

      // Indoors and out of sight, there is nothing to draw: look in four
      // times a second for a reason to come out rather than sixty.
      if (plan.current.kind === "inside" && shown.current < 0.02) {
        nap = setTimeout(() => {
          last = performance.now();
          frame = requestAnimationFrame(go);
        }, 250);
      } else frame = requestAnimationFrame(go);
    };

    frame = requestAnimationFrame(go);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(nap);
      window.removeEventListener("scroll", moved, { capture: true });
      window.removeEventListener("resize", moved);
    };
  }, [allowed, switchedOn, say, showLook, showOut]);

  // Somebody reached for her: a click asks the AI (and, with play on, pokes
  // her where it landed); a drag picks her up.
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const me = body.current;
    if (!me || event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY, t: performance.now() };
    const box = event.currentTarget.getBoundingClientRect();
    const share = box.height > 0 ? (event.clientY - box.top) / box.height : 0.5;
    let lifted = false;

    const move = (moved: PointerEvent) => {
      const sample = { t: performance.now(), x: moved.clientX, y: moved.clientY };
      if (!lifted) {
        if (Math.hypot(sample.x - start.x, sample.y - start.y) < 6) return;
        lifted = true;
        const now = body.current ?? me;
        hand.current = { dx: start.x - now.x, dy: start.y - now.y, samples: [start] };
        body.current = { ...now, on: null, stuck: null, vx: 0, vy: 0 };
        flapping.current = null;
        plunging.current = false;
        plan.current = { kind: "held" };
        chirp("whoop");
      }
      hand.current?.samples.push(sample);
      if ((hand.current?.samples.length ?? 0) > 12) hand.current?.samples.shift();
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      if (!lifted) {
        askEmber();
        if (emberPref("play")) pokeEmber(pokeAt(share));
        return;
      }
      const { vx, vy } = releaseSpeed(hand.current?.samples ?? [], performance.now());
      hand.current = null;
      const held = body.current;
      if (!held) return;
      // Thrown, she tumbles with the throw.
      body.current = { ...held, vx, vy, spin: vx * 0.45 + held.spin };
      if (isChuck(vx, vy)) {
        botherEmber("chuck");
        chirp("whoosh");
        say("Wheeeee!");
      }
      plan.current = { kind: "air" };
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  /** Home, by leaping there: a lob with a somersault in it, not a teleport. */
  const onDoubleClick = () => {
    const me = body.current;
    const home = survey().home;
    if (!me || !home) return;
    const launch = leap(me, { x: home.door - SIZE / 2 + 50, y: home.ledge.top - 60 });
    body.current = { ...me, on: null, stuck: null, vx: launch.vx, vy: launch.vy, spin: Math.sign(launch.vx || 1) * 360 };
    chirp("boing");
    plan.current = { kind: "air" };
  };

  // On fire: the crackle goes on until somebody does something about it,
  // and Escape counts as a marshmallow for anybody who cannot reach the button.
  useEffect(() => {
    if (!burning) return;
    chirp("burn");
    speak("RAAAAAH!");
    const roar = setInterval(() => chirp("burn"), 1600);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") feedEmber();
    };
    window.addEventListener("keydown", escape);
    return () => {
      clearInterval(roar);
      window.removeEventListener("keydown", escape);
    };
  }, [burning]);

  // Busy with a pastime, a trick or a mood: she stands still for it.
  const still = useCallback((on: boolean, trick: boolean) => {
    busy.current = on;
    playing.current = trick;
  }, []);

  return (
    <>
      <div className="ember-shadow" ref={shadow} aria-hidden />
      <svg className="ember-way" aria-hidden>
        <line ref={ropeUnder} className="ember-way__line" style={{ display: "none" }} />
        <line ref={rope} className="ember-way__line" style={{ display: "none" }} />
        <g ref={splat} className="ember-way__splat" style={{ display: "none" }}>
          <rect x={-5} y={-1} width={10} height={2} />
          <rect x={-1} y={-5} width={2} height={10} />
          <rect x={-4} y={-4} width={2} height={2} />
          <rect x={2} y={-4} width={2} height={2} />
          <rect x={-4} y={2} width={2} height={2} />
          <rect x={2} y={2} width={2} height={2} />
        </g>
        <g ref={hook} className="ember-way__hook" style={{ display: "none" }}>
          <rect x={-1} y={-2} width={2} height={8} />
          <rect x={-5} y={-4} width={2} height={4} />
          <rect x={3} y={-4} width={2} height={4} />
          <rect x={-5} y={-1} width={10} height={2} />
        </g>
        <polyline ref={spring} className="ember-way__spring" style={{ display: "none" }} />
        <g ref={jet} className="ember-way__jet" style={{ display: "none" }}>
          <rect x={-6} y={0} width={12} height={4} className="fire--p" />
          <rect x={-5} y={4} width={10} height={5} className="fire--m" />
          <rect x={-3} y={9} width={6} height={5} className="fire--r" />
          <rect x={-1} y={14} width={2} height={3} className="fire--r" />
        </g>
        <g ref={puff} className="ember-way__puff" style={{ display: "none" }}>
          <rect x={-14} y={-8} width={28} height={16} />
          <rect x={-10} y={-14} width={20} height={28} />
          <rect x={-18} y={-4} width={36} height={8} />
        </g>
        {/* A marshmallow, toasted on top. */}
        <g ref={treatNode} className="ember-way__mallow" style={{ display: "none" }}>
          <rect x={-6} y={-5} width={12} height={10} className="px--w" />
          <rect x={-6} y={-5} width={12} height={3} className="px--y" />
        </g>
        {/* A present: red, a gold ribbon both ways, and a bow. */}
        <g ref={giftNode} className="ember-way__gift" style={{ display: "none" }}>
          <rect x={-11} y={2} width={22} height={16} className="px--r" />
          <rect x={-12} y={0} width={24} height={5} className="px--r" />
          <rect x={-2} y={0} width={4} height={18} className="px--y" />
          <rect x={-12} y={2} width={24} height={3} className="px--y" />
          <rect x={-7} y={-4} width={5} height={4} className="px--y" />
          <rect x={2} y={-4} width={5} height={4} className="px--y" />
        </g>
      </svg>
      <div
        ref={el}
        className="ember-body"
        data-out={out ? "yes" : "no"}
        data-pose={look.pose ?? "none"}
        data-gait={look.walking}
        data-warmth={band}
        role="button"
        tabIndex={out ? 0 : -1}
        aria-hidden={!out}
        aria-label="Ember. Click to ask her anything; drag her anywhere; double-click to send her home; right-click for a dance."
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onContextMenu={(event) => {
          // Right-click: ask her for any move she knows.
          event.preventDefault();
          setMenu({
            x: Math.max(8, Math.min(event.clientX, window.innerWidth - 400)),
            y: Math.max(8, Math.min(event.clientY, window.innerHeight - 560)),
          });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            askEmber();
          }
        }}
      >
        <Ember
          mode={mode}
          mood={line?.mood ?? "resting"}
          size={64}
          pose={look.pose}
          walks={look.walking !== "no"}
          dressed={doodleOf(localDay())}
          cross={cross}
          fury={burning}
          onStill={still}
          occupied={look.homeward}
          learned={learned}
          warmth={band}
          outfit={outfit}
        />
      </div>

      {menu && (
        <Book
          menu={menuEl}
          at={menu}
          stats={stats}
          learned={learned}
          onPlay={(item) => {
            setMenu(null);
            if (item.kind === "dance") playEmber({ trick: "dance", loud: true, dance: item.id });
            else if (item.kind === "costume") playEmber({ trick: "signature", loud: true, costume: item.id });
            else say(`${nameOf(item)}: that is how I get home.`);
          }}
          onLocked={(item) => {
            setMenu(null);
            playEmber({ trick: "nope", loud: true });
            say(`Not yet! ${needsLabel(needsOf(item))}.`);
          }}
          outfit={outfit}
          chosen={chosenOutfit !== null}
          favourite={favourite}
          onWear={(garment) => {
            const next = wear(outfit, garment);
            setChosenOutfit(next);
            writeKey(OUTFIT, JSON.stringify(next));
            // A change of clothes happens in a puff of smoke.
            playEmber({ trick: "poof", loud: true });
            setTimeout(() => say("How do I look?"), 500);
          }}
          onLetHerChoose={() => {
            setChosenOutfit(null);
            writeKey(OUTFIT, null);
            playEmber({ trick: "poof", loud: true });
            setTimeout(() => say("My pick!"), 500);
          }}
        />
      )}

      {burning && onHome && (
        <div className="ember-fire" role="alertdialog" aria-label="Ember is furious and the screen is on fire">
          <svg className="ember-fire__flames" aria-hidden width="100%" height="200">
            <defs>
              <Tile id="ember-fire-back" rows={FIRE_BACK} y={104} />
              <Tile id="ember-fire-a" rows={FIRE_A} y={152} />
              <Tile id="ember-fire-b" rows={FIRE_B} y={152} />
            </defs>
            <rect className="ember-fire__back" y="104" width="100%" height="96" fill="url(#ember-fire-back)" />
            <rect className="ember-fire__a" y="152" width="100%" height="48" fill="url(#ember-fire-a)" />
            <rect className="ember-fire__b" y="152" width="100%" height="48" fill="url(#ember-fire-b)" />
          </svg>
          <div className="ember-fire__plea">
            <p className="ember-fire__title">Ember has had enough.</p>
            <button type="button" className="btn btn--primary ember-fire__mallow" autoFocus onClick={feedEmber}>
              <svg viewBox="0 0 12 12" width="24" height="24" aria-hidden className="ember-fire__stick">
                <rect x="3" y="1" width="6" height="5" className="px--w" />
                <rect x="3" y="1" width="6" height="1" className="px--y" />
                <rect x="5" y="6" width="2" height="6" className="px--n" />
              </svg>
              Give her a marshmallow
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ---- The fire --------------------------------------------------------------
 *
 * Pixel flames, drawn like her: `r` red at the root, `m` orange, `p` gold at
 * the tips, `d` the deep red behind. Two drawings of the front row swapped on
 * a beat, and a taller row behind them, each pixel four screen pixels.
 */

const FIRE_A = [
  "...p....",
  "...pp...",
  "..ppp...",
  "..pmpp..",
  ".pmmmp..",
  ".pmmmmp.",
  "pmmrmmmp",
  "pmrrrmmp",
  "mmrrrrmm",
  "mrrrrrrm",
  "rrrrrrrr",
  "rrrrrrrr",
];

const FIRE_B = [
  "....p...",
  "...pp...",
  "...ppp..",
  "..ppmp..",
  "..pmmmp.",
  ".pmmmmp.",
  "pmmmrmmp",
  "pmmrrrmp",
  "mmrrrrmm",
  "mrrrrrrm",
  "rrrrrrrr",
  "rrrrrrrr",
];

const FIRE_BACK = [
  ".....d......",
  ".....dd.....",
  "....ddd.....",
  "....dddd....",
  "...ddrdd....",
  "...drrrd....",
  "..ddrrrdd...",
  "..drrrrrd...",
  ".ddrrmrrdd..",
  ".drrmmmrrd..",
  ".drrmmmrrdd.",
  "ddrmmmmmrrd.",
  "drrmmmmmmrdd",
  "drrmmmmmmrrd",
  "drrmmmmmmrrd",
  "ddrrmmmmrrdd",
  "dddrrrrrrddd",
  "dddddddddddd",
  "dddddddddddd",
  "dddddddddddd",
  "dddddddddddd",
  "dddddddddddd",
  "dddddddddddd",
  "dddddddddddd",
];

const FIRE_INK: Record<string, string> = { r: "fire--r", m: "fire--m", p: "fire--p", d: "fire--d" };

/** One flame as a repeating tile, four screen pixels to a sprite pixel. */
function Tile({ id, rows, y }: { id: string; rows: readonly string[]; y: number }) {
  const width = rows[0]?.length ?? 0;
  return (
    <pattern id={id} width={width} height={rows.length} patternUnits="userSpaceOnUse" patternTransform={`translate(0 ${y}) scale(4)`}>
      {rows.flatMap((row, top) =>
        [...row].map((ch, left) =>
          FIRE_INK[ch] ? <rect key={`${left}-${top}`} x={left} y={top} width={1} height={1} className={FIRE_INK[ch]} /> : null,
        ),
      )}
    </pattern>
  );
}
