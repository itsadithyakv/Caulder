import { useEffect, useRef } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import {
  MAP_LOOK,
  adjacency,
  matching,
  radiusOf,
  type MapGraph,
  type MapKind,
  type MapLook,
  type MapNode,
  type MapPosition,
} from "@shared/map";

/**
 * The Map, drawn (PLAN.md, phases 7 and 16) - and made to feel like
 * Obsidian's graph.
 *
 * Canvas rather than SVG, so a few thousand dots stay smooth. d3-force lays
 * the dots out and keeps them alive while one is moved: drag a dot and its
 * neighbours follow on their lines, let go and it settles back into the
 * weave. Hold Shift as it is let go to leave it where it was put, pinned;
 * double-click a pinned dot to let it go. Hover a dot and everything else
 * fades - gradually, not in a blink - while its lines light up. Labels grow
 * in as you zoom, and the ones that matter show earlier. Under reduced motion
 * the layout is worked out before the first frame and the fades are instant.
 *
 * Where the map can link (the whole Map, not a page's little one), a hovered
 * dot shows a small + at its shoulder: drag that onto another dot and they
 * are linked - or hold Alt and drag the dot itself. A line written in a page
 * lights up under the pointer and can be clicked, to take it out.
 *
 * The drawing lives outside React: a frame is a pure function of the
 * simulation and a few refs, and React only hands over the graph and the look.
 */

type Dot = SimulationNodeDatum & { key: string; node: MapNode; r: number };
type Line = SimulationLinkDatum<Dot> & { source: Dot | string; target: Dot | string; written: boolean };

/** A link being drawn: from one dot, to the one under the pointer or to the pointer itself. */
type Linking = { from: Dot; to: Dot | null; x: number; y: number };

type Camera = { x: number; y: number; k: number };

/** Colours come from the theme; the canvas reads them rather than knowing them. */
const KIND_TOKEN: Record<MapKind, string> = {
  page: "--map-page",
  contact: "--map-contact",
  product: "--map-product",
  person: "--map-person",
  document: "--map-document",
  decision: "--map-decision",
  own: "--map-own",
};

/** Kept across rebuilds, so a replay step or a filter does not throw the layout away. */
const remembered = new Map<string, { x: number; y: number }>();

function seedOf(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 10_000) / 10_000;
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** How far the rest fades while one dot is looked at. */
const FADED = 0.12;

/**
 * The + a hovered dot offers to drag a link from: at its upper right, just
 * clear of it, the same size on screen at any zoom.
 */
function handleOf(dot: Dot, k: number): { x: number; y: number; r: number } {
  const reach = dot.r + 12 / k;
  return { x: (dot.x ?? 0) + reach * Math.SQRT1_2, y: (dot.y ?? 0) - reach * Math.SQRT1_2, r: 8 / k };
}

/** A link is written in a page, so a line has to have one at an end. */
function canJoin(a: Dot, b: Dot): boolean {
  return a.key !== b.key && (a.node.ref === "page" || b.node.ref === "page");
}

/** How far a point is from a line segment. */
function fromSegment(point: { x: number; y: number }, a: Dot, b: Dot): number {
  const ax = a.x ?? 0;
  const ay = a.y ?? 0;
  const dx = (b.x ?? 0) - ax;
  const dy = (b.y ?? 0) - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / length));
  return Math.hypot(point.x - (ax + t * dx), point.y - (ay + t * dy));
}

export function MapCanvas({
  graph,
  height,
  focus = null,
  search = "",
  label,
  onOpen,
  onPositions,
  onLink,
  onPickLine,
  refit = 0,
  look = MAP_LOOK,
}: {
  graph: MapGraph;
  /** Pixels, or any CSS length - the full Map fills what it is given. */
  height: number | string;
  /** A local map's own dot: ringed, and always labelled. */
  focus?: string | null;
  /** Dots whose name does not contain this fade back. */
  search?: string;
  label: string;
  onOpen: (node: MapNode) => void;
  /** Given, positions are kept after the map settles or a dot is moved. */
  onPositions?: (positions: MapPosition[]) => void;
  /** Given, a dot can be dragged onto another to link them. */
  onLink?: (from: MapNode, to: MapNode) => void;
  /** Given, a line written in a page can be clicked; `at` is where, in the map's own box. */
  onPickLine?: (ends: { source: MapNode; target: MapNode }, at: { x: number; y: number }) => void;
  /** Bumped to zoom back out to the whole map. */
  refit?: number;
  /** Forces and looks, from the Display panel. */
  look?: MapLook;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // What a frame reads. Refs, so pointer events and the simulation can change
  // them without a React render in between.
  const state = useRef({
    dots: [] as Dot[],
    lines: [] as Line[],
    near: new Map<string, Set<string>>(),
    camera: { x: 0, y: 0, k: 1 } as Camera,
    fitting: true,
    hover: null as string | null,
    /** The dot the fade is about: the hovered one, kept while the fade goes back out. */
    lit: null as string | null,
    /** 0 is nothing faded, 1 is everything but the lit dot's neighbourhood faded. */
    fade: 0,
    search: "",
    focus: null as string | null,
    look: MAP_LOOK,
    width: 0,
    height: 0,
    colours: null as null | Record<string, string>,
    frame: 0,
    byKey: new Map<string, Dot>(),
    /** A link being dragged out, drawn as a dashed line. */
    linking: null as Linking | null,
    /** The written line under the pointer, lit so it reads as clickable. */
    hoverLine: null as Line | null,
    /** A dot is being moved or the map panned: no + while that happens. */
    pressed: false,
    canLink: false,
    canPick: false,
  });

  const openRef = useRef(onOpen);
  const keepRef = useRef(onPositions);
  const linkRef = useRef(onLink);
  const pickRef = useRef(onPickLine);
  openRef.current = onOpen;
  keepRef.current = onPositions;
  linkRef.current = onLink;
  pickRef.current = onPickLine;
  state.current.canLink = onLink !== undefined;
  state.current.canPick = onPickLine !== undefined;

  state.current.search = search;
  state.current.focus = focus;
  state.current.look = look;

  const simulation = useRef<Simulation<Dot, Line> | null>(null);
  const draw = useRef<() => void>(() => undefined);

  /* ---- Drawing ---------------------------------------------------------- */

  useEffect(() => {
    const element = canvas.current;
    const holder = wrap.current;
    if (!element || !holder) return;
    const context = element.getContext("2d");
    if (!context) return;
    const s = state.current;

    const colours = () => {
      if (s.colours) return s.colours;
      const style = getComputedStyle(element);
      const read = (name: string) => style.getPropertyValue(name).trim();
      const out: Record<string, string> = {
        line: read("--border-strong"),
        lit: read("--accent"),
        ink: read("--ink"),
        quiet: read("--ink-2"),
        halo: read("--surface"),
      };
      for (const [kind, token] of Object.entries(KIND_TOKEN)) out[kind] = read(token);
      s.colours = out;
      return out;
    };

    /** Eases the camera towards the whole map; true while it still has a way to go. */
    const fit = (): boolean => {
      if (!s.fitting || s.dots.length === 0) return false;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const dot of s.dots) {
        minX = Math.min(minX, (dot.x ?? 0) - dot.r);
        maxX = Math.max(maxX, (dot.x ?? 0) + dot.r);
        minY = Math.min(minY, (dot.y ?? 0) - dot.r);
        maxY = Math.max(maxY, (dot.y ?? 0) + dot.r);
      }
      // A few dots are shown at about their own size, not blown up to fill
      // the field: four dots at twice the size made labels shout.
      const pad = 48;
      const k = Math.min(1.25, (s.width - pad * 2) / Math.max(1, maxX - minX), (s.height - pad * 2) / Math.max(1, maxY - minY));
      const target = { k: Math.max(0.15, k), x: -((minX + maxX) / 2), y: -((minY + maxY) / 2) };
      const ease = reducedMotion() ? 1 : 0.18;
      const away =
        Math.abs(target.k - s.camera.k) * 200 + Math.abs(target.x - s.camera.x) + Math.abs(target.y - s.camera.y);
      s.camera = {
        k: s.camera.k + (target.k - s.camera.k) * ease,
        x: s.camera.x + (target.x - s.camera.x) * ease,
        y: s.camera.y + (target.y - s.camera.y) * ease,
      };
      return away > 0.5;
    };

    /** Moves the fade a step towards where it is going; true while it is still on the way. */
    const fadeStep = (): boolean => {
      if (s.hover) s.lit = s.hover;
      const target = s.hover ? 1 : 0;
      if (reducedMotion()) s.fade = target;
      else s.fade += (target - s.fade) * 0.22;
      if (Math.abs(target - s.fade) < 0.01) {
        s.fade = target;
        if (target === 0) s.lit = null;
        return false;
      }
      return true;
    };

    const paint = () => {
      s.frame = 0;
      const ratio = window.devicePixelRatio || 1;
      const palette = colours();
      const moving = fit();
      const fading = fadeStep();
      const { k, x, y } = s.camera;
      const look = s.look;

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, element.width, element.height);
      context.setTransform(ratio * k, 0, 0, ratio * k, ratio * (s.width / 2 + x * k), ratio * (s.height / 2 + y * k));

      const lit = s.lit;
      const neighbours = lit ? s.near.get(lit) : null;
      const searching = s.search.trim().length > 0;
      const linking = s.linking;
      const inLight = (key: string) =>
        !lit || key === lit || neighbours?.has(key) === true || key === linking?.to?.key;
      const alphaOf = (dot: Dot) => {
        const byHover = inLight(dot.key) ? 1 : 1 - (1 - FADED) * s.fade;
        const bySearch = searching && !matching(dot.node, s.search) ? 0.18 : 1;
        return Math.min(byHover, bySearch);
      };

      // Lines under the dots: a hairline, lit in the accent when they touch what is looked at.
      for (const line of s.lines) {
        const a = line.source as Dot;
        const b = line.target as Dot;
        const picked = line === s.hoverLine;
        const on = picked || (lit !== null && (a.key === lit || b.key === lit));
        const base = searching ? 0.14 : 0.5;
        context.globalAlpha = picked ? 1 : on ? 0.35 + 0.6 * s.fade : base * (1 - (1 - FADED) * s.fade);
        context.strokeStyle = on ? (palette["lit"] ?? "") : (palette["line"] ?? "");
        context.lineWidth = ((picked ? 2.8 : on ? 1.8 : 1) * look.lines) / k;
        const ax = a.x ?? 0;
        const ay = a.y ?? 0;
        const bx = b.x ?? 0;
        const by = b.y ?? 0;
        context.beginPath();
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
        context.stroke();
        if (look.arrows) {
          // Which way it was written: a small head just short of the far dot.
          const angle = Math.atan2(by - ay, bx - ax);
          const tipX = bx - Math.cos(angle) * (b.r + 2 / k);
          const tipY = by - Math.sin(angle) * (b.r + 2 / k);
          const size = (5 * look.lines) / k;
          context.fillStyle = context.strokeStyle;
          context.beginPath();
          context.moveTo(tipX, tipY);
          context.lineTo(tipX - Math.cos(angle - 0.45) * size, tipY - Math.sin(angle - 0.45) * size);
          context.lineTo(tipX - Math.cos(angle + 0.45) * size, tipY - Math.sin(angle + 0.45) * size);
          context.closePath();
          context.fill();
        }
      }

      for (const dot of s.dots) {
        const isLit = dot.key === lit;
        context.globalAlpha = alphaOf(dot);
        context.fillStyle = isLit && s.fade > 0.5 ? (palette["lit"] ?? "") : (palette[dot.node.kind] ?? "");
        context.beginPath();
        context.arc(dot.x ?? 0, dot.y ?? 0, dot.r, 0, Math.PI * 2);
        context.fill();
        if (dot.fx != null || dot.key === s.focus || isLit) {
          context.lineWidth = (dot.key === s.focus || isLit ? 2.5 : 1.5) / k;
          context.strokeStyle = dot.key === s.focus || isLit ? (palette["lit"] ?? "") : (palette["quiet"] ?? "");
          context.beginPath();
          context.arc(dot.x ?? 0, dot.y ?? 0, dot.r + 2.5 / k, 0, Math.PI * 2);
          context.stroke();
        }
      }

      // The link being drawn: dashed from the dot's edge to the pointer, or to
      // the dot it would join, which is ringed - quietly when it cannot be.
      if (linking) {
        const from = linking.from;
        const to = linking.to;
        const fx = from.x ?? 0;
        const fy = from.y ?? 0;
        const ex = to ? (to.x ?? 0) : linking.x;
        const ey = to ? (to.y ?? 0) : linking.y;
        const angle = Math.atan2(ey - fy, ex - fx);
        const ok = to === null || canJoin(from, to);
        const short = to ? to.r + 4 / k : 0;
        context.globalAlpha = 1;
        context.strokeStyle = ok ? (palette["lit"] ?? "") : (palette["quiet"] ?? "");
        context.lineWidth = 2 / k;
        context.setLineDash([6 / k, 4 / k]);
        context.beginPath();
        context.moveTo(fx + Math.cos(angle) * from.r, fy + Math.sin(angle) * from.r);
        context.lineTo(ex - Math.cos(angle) * short, ey - Math.sin(angle) * short);
        context.stroke();
        context.setLineDash([]);
        if (to) {
          context.lineWidth = 2.5 / k;
          context.beginPath();
          context.arc(ex, ey, short, 0, Math.PI * 2);
          context.stroke();
        }
      }

      // Labels grow in as you zoom past the chosen point; the busiest dots and
      // whatever is looked at are labelled sooner. They are world-sized, as in
      // Obsidian, but never smaller on screen than can be read.
      context.textAlign = "center";
      context.textBaseline = "top";
      const zoomIn = Math.max(0, Math.min(1, (k - look.labelsAt * 0.7) / (look.labelsAt * 0.35)));
      for (const dot of s.dots) {
        const looked =
          dot.key === lit ||
          dot.key === s.focus ||
          dot.key === linking?.to?.key ||
          (lit !== null && inLight(dot.key) && s.fade > 0.3);
        const found = searching && matching(dot.node, s.search);
        const busy = dot.node.degree >= 4 ? Math.max(zoomIn, 0.9) : zoomIn;
        const show = looked || found ? 1 : busy * (lit ? 1 - s.fade : 1);
        if (show < 0.04) continue;
        const size = Math.max(12, 11 / k);
        context.font = `${looked ? 700 : 600} ${size}px system-ui, sans-serif`;
        const text = dot.node.label.length > 36 ? `${dot.node.label.slice(0, 35)}…` : dot.node.label;
        const top = (dot.y ?? 0) + dot.r + 4 / k;
        context.globalAlpha = Math.min(show, alphaOf(dot) < 1 && !looked ? alphaOf(dot) + 0.1 : 1);
        context.lineWidth = 3 / k;
        context.strokeStyle = palette["halo"] ?? "";
        context.strokeText(text, dot.x ?? 0, top);
        context.fillStyle = looked ? (palette["ink"] ?? "") : (palette["quiet"] ?? "");
        context.fillText(text, dot.x ?? 0, top);
      }
      // The + on the dot under the pointer, to drag a link out of.
      const hovered = s.canLink && !linking && !s.pressed && s.hover ? s.byKey.get(s.hover) : undefined;
      if (hovered) {
        const grip = handleOf(hovered, k);
        context.globalAlpha = 1;
        context.fillStyle = palette["halo"] ?? "";
        context.strokeStyle = palette["lit"] ?? "";
        context.lineWidth = 1.5 / k;
        context.beginPath();
        context.arc(grip.x, grip.y, grip.r, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        const arm = 4 / k;
        context.beginPath();
        context.moveTo(grip.x - arm, grip.y);
        context.lineTo(grip.x + arm, grip.y);
        context.moveTo(grip.x, grip.y - arm);
        context.lineTo(grip.x, grip.y + arm);
        context.stroke();
      }

      context.globalAlpha = 1;
      if (moving || fading) draw.current();
    };

    draw.current = () => {
      if (s.frame === 0) s.frame = requestAnimationFrame(paint);
    };

    const size = () => {
      const ratio = window.devicePixelRatio || 1;
      s.width = holder.clientWidth;
      s.height = holder.clientHeight;
      element.width = Math.round(s.width * ratio);
      element.height = Math.round(s.height * ratio);
      draw.current();
    };
    size();
    const resize = new ResizeObserver(size);
    resize.observe(holder);

    // The theme can change under the map: forget the colours and draw again.
    const retheme = () => {
      s.colours = null;
      draw.current();
    };
    const themeWatch = new MutationObserver(retheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-accent"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", retheme);

    return () => {
      resize.disconnect();
      themeWatch.disconnect();
      scheme.removeEventListener("change", retheme);
      if (s.frame) cancelAnimationFrame(s.frame);
      s.frame = 0;
    };
  }, []);

  useEffect(() => {
    draw.current();
  }, [search, focus]);

  useEffect(() => {
    if (refit === 0) return;
    state.current.fitting = true;
    draw.current();
  }, [refit]);

  /* ---- Layout ----------------------------------------------------------- */

  useEffect(() => {
    const s = state.current;
    const previous = new Map(s.dots.map((dot) => [dot.key, dot]));
    const near = adjacency(graph);

    const dots: Dot[] = graph.nodes.map((node) => {
      const old = previous.get(node.key);
      const kept = remembered.get(node.key);
      const dot: Dot = { key: node.key, node, r: radiusOf(node.degree) * s.look.size };
      if (old) {
        dot.x = old.x;
        dot.y = old.y;
        dot.vx = old.vx;
        dot.vy = old.vy;
      } else if (node.x !== null && node.y !== null) {
        dot.x = node.x;
        dot.y = node.y;
      } else if (kept) {
        dot.x = kept.x;
        dot.y = kept.y;
      }
      if (node.pinned && node.x !== null && node.y !== null) {
        dot.fx = node.x;
        dot.fy = node.y;
      }
      return dot;
    });

    // A new dot starts beside something it is linked to, or on a spiral.
    const byKey = new Map(dots.map((dot) => [dot.key, dot]));
    dots.forEach((dot, index) => {
      if (dot.x !== undefined && dot.y !== undefined) return;
      const friend = [...(near.get(dot.key) ?? [])].map((key) => byKey.get(key)).find((other) => other?.x !== undefined);
      const angle = seedOf(dot.key) * Math.PI * 2;
      if (friend) {
        dot.x = (friend.x ?? 0) + Math.cos(angle) * 24;
        dot.y = (friend.y ?? 0) + Math.sin(angle) * 24;
      } else {
        const radius = 30 * Math.sqrt(index + 1);
        dot.x = Math.cos(angle) * radius;
        dot.y = Math.sin(angle) * radius;
      }
    });

    const lines: Line[] = graph.links.map((link) => ({
      source: link.source,
      target: link.target,
      written: link.written === true,
    }));
    const known = graph.nodes.filter((node) => node.x !== null).length;
    const settled = graph.nodes.length > 0 && known === graph.nodes.length && previous.size === 0;

    simulation.current?.stop();
    const look = s.look;
    const sim = forceSimulation<Dot, Line>(dots)
      .force(
        "link",
        forceLink<Dot, Line>(lines)
          .id((dot) => dot.key)
          .distance(look.distance)
          .strength(0.35),
      )
      .force("charge", forceManyBody<Dot>().strength(-look.repel).distanceMax(480))
      .force("x", forceX<Dot>(0).strength(look.centre))
      .force("y", forceY<Dot>(0).strength(look.centre))
      .force("collide", forceCollide<Dot>((dot) => dot.r + 3))
      .alphaDecay(0.03)
      .velocityDecay(0.35);

    s.dots = dots;
    s.lines = lines;
    s.near = near;
    s.byKey = byKey;
    s.hoverLine = null;
    simulation.current = sim;

    const keep = () => {
      for (const dot of dots) remembered.set(dot.key, { x: dot.x ?? 0, y: dot.y ?? 0 });
      keepRef.current?.(dots.map((dot) => ({ key: dot.key, x: dot.x ?? 0, y: dot.y ?? 0, pinned: dot.fx != null })));
    };

    if (reducedMotion()) {
      sim.stop();
      // Worked out before anything is shown: the map appears, settled.
      for (let i = 0; i < (settled ? 20 : 300); i += 1) sim.tick();
      draw.current();
      keep();
    } else {
      // A map that was left settled only breathes; a new one finds its shape.
      sim.alpha(settled ? 0.08 : previous.size > 0 ? 0.35 : 1);
      sim.on("tick", () => draw.current());
      sim.on("end", keep);
    }
    draw.current();

    return () => {
      sim.on("tick", null).on("end", null);
      sim.stop();
    };
  }, [graph]);

  // A change of forces or sizes is felt at once: the weave loosens or tightens and settles again.
  useEffect(() => {
    const s = state.current;
    const sim = simulation.current;
    if (!sim) return;
    for (const dot of s.dots) dot.r = radiusOf(dot.node.degree) * look.size;
    const link = sim.force("link") as ReturnType<typeof forceLink<Dot, Line>> | undefined;
    link?.distance(look.distance);
    (sim.force("charge") as ReturnType<typeof forceManyBody<Dot>> | undefined)?.strength(-look.repel);
    (sim.force("x") as ReturnType<typeof forceX<Dot>> | undefined)?.strength(look.centre);
    (sim.force("y") as ReturnType<typeof forceY<Dot>> | undefined)?.strength(look.centre);
    (sim.force("collide") as ReturnType<typeof forceCollide<Dot>> | undefined)?.radius((dot) => dot.r + 3);
    if (reducedMotion()) {
      for (let i = 0; i < 120; i += 1) sim.tick();
    } else {
      sim.alpha(0.4).restart();
    }
    draw.current();
  }, [look.distance, look.repel, look.centre, look.size]);

  useEffect(() => {
    draw.current();
  }, [look.lines, look.labelsAt, look.arrows]);

  /* ---- Pointer ---------------------------------------------------------- */

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const s = state.current;

    const world = (event: PointerEvent | WheelEvent | MouseEvent) => {
      const box = element.getBoundingClientRect();
      const { k, x, y } = s.camera;
      return {
        x: (event.clientX - box.left - s.width / 2) / k - x,
        y: (event.clientY - box.top - s.height / 2) / k - y,
      };
    };

    const hit = (point: { x: number; y: number }): Dot | null => {
      let best: Dot | null = null;
      let bestDistance = Infinity;
      for (const dot of s.dots) {
        const distance = Math.hypot((dot.x ?? 0) - point.x, (dot.y ?? 0) - point.y);
        if (distance < dot.r + 6 / s.camera.k && distance < bestDistance) {
          best = dot;
          bestDistance = distance;
        }
      }
      return best;
    };

    /** The hovered dot, when the pointer is on its +. */
    const onGrip = (point: { x: number; y: number }): Dot | null => {
      const dot = s.canLink && s.hover ? s.byKey.get(s.hover) : undefined;
      if (!dot) return null;
      const grip = handleOf(dot, s.camera.k);
      return Math.hypot(point.x - grip.x, point.y - grip.y) <= grip.r + 3 / s.camera.k ? dot : null;
    };

    /** The written line nearest the pointer, if one is close enough to mean it. */
    const nearLine = (point: { x: number; y: number }): Line | null => {
      if (!s.canPick) return null;
      let best: Line | null = null;
      let bestDistance = 5 / s.camera.k;
      for (const line of s.lines) {
        if (!line.written) continue;
        const distance = fromSegment(point, line.source as Dot, line.target as Dot);
        if (distance < bestDistance) {
          best = line;
          bestDistance = distance;
        }
      }
      return best;
    };

    let drag: null | {
      dot: Dot | null;
      /** A line pressed on: a click on it, not a pan, picks it. */
      line: Line | null;
      startX: number;
      startY: number;
      moved: boolean;
      wasPinned: boolean;
      camera: Camera;
    } = null;

    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      element.setPointerCapture(event.pointerId);
      const point = world(event);
      const grip = onGrip(point);
      const dot = grip ?? hit(point);
      if (dot && s.canLink && (grip || event.altKey)) {
        // Drawing a link, not moving the dot.
        s.linking = { from: dot, to: null, x: point.x, y: point.y };
        s.hover = dot.key;
        s.hoverLine = null;
        element.style.cursor = "crosshair";
        draw.current();
        return;
      }
      s.pressed = true;
      drag = {
        dot,
        line: dot ? null : s.hoverLine,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        wasPinned: dot?.fx != null,
        camera: { ...s.camera },
      };
      if (dot) {
        dot.fx = dot.x;
        dot.fy = dot.y;
      }
    };

    const move = (event: PointerEvent) => {
      if (s.linking) {
        const point = world(event);
        const under = hit(point);
        const to = under && under !== s.linking.from ? under : null;
        s.linking = { ...s.linking, to, x: point.x, y: point.y };
        element.style.cursor = to && !canJoin(s.linking.from, to) ? "not-allowed" : to ? "copy" : "crosshair";
        draw.current();
        return;
      }
      if (!drag) {
        const point = world(event);
        const grip = onGrip(point);
        const dot = grip ?? hit(point);
        const line = dot ? null : nearLine(point);
        const key = dot?.key ?? null;
        element.style.cursor = grip ? "crosshair" : dot || line ? "pointer" : "grab";
        if (key !== s.hover || line !== s.hoverLine) {
          s.hover = key;
          s.hoverLine = line;
          draw.current();
        }
        return;
      }
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      if (drag.dot) {
        // The dot follows the pointer and the weave follows the dot: the
        // simulation stays warm for as long as it is held.
        const point = world(event);
        drag.dot.fx = point.x;
        drag.dot.fy = point.y;
        s.hover = drag.dot.key;
        simulation.current?.alphaTarget(0.3).restart();
      } else {
        s.fitting = false;
        element.style.cursor = "grabbing";
        s.camera = { ...drag.camera, x: drag.camera.x + dx / s.camera.k, y: drag.camera.y + dy / s.camera.k };
      }
      draw.current();
    };

    const up = (event: PointerEvent) => {
      if (s.linking) {
        const { from, to } = s.linking;
        s.linking = null;
        element.style.cursor = "grab";
        draw.current();
        if (to && event.type === "pointerup") linkRef.current?.(from.node, to.node);
        return;
      }
      if (!drag) return;
      const { dot, line, moved, wasPinned } = drag;
      drag = null;
      s.pressed = false;
      element.style.cursor = "grab";
      simulation.current?.alphaTarget(0);
      if (!dot) {
        if (line && !moved && event.type === "pointerup") {
          const box = element.getBoundingClientRect();
          pickRef.current?.(
            { source: (line.source as Dot).node, target: (line.target as Dot).node },
            { x: event.clientX - box.left, y: event.clientY - box.top },
          );
        }
        return;
      }
      if (!moved) {
        // A click, not a drag: put the dot back as it was, and open it.
        if (!wasPinned) {
          dot.fx = null;
          dot.fy = null;
        }
        openRef.current(dot.node);
        return;
      }
      if (event.shiftKey || wasPinned) {
        // Shift when letting go - or a dot already pinned - stays where it was put.
        remembered.set(dot.key, { x: dot.fx ?? 0, y: dot.fy ?? 0 });
      } else {
        // Let go, and it springs back into the weave, as in Obsidian.
        dot.fx = null;
        dot.fy = null;
        simulation.current?.alpha(Math.max(simulation.current.alpha(), 0.2)).restart();
      }
      keepRef.current?.(
        s.dots.map((each) => ({ key: each.key, x: each.x ?? 0, y: each.y ?? 0, pinned: each.fx != null })),
      );
    };

    const leave = () => {
      if ((s.hover !== null || s.hoverLine !== null) && !drag && !s.linking) {
        s.hover = null;
        s.hoverLine = null;
        draw.current();
      }
    };

    // Escape lets go of a link half drawn.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !s.linking) return;
      event.stopPropagation();
      s.linking = null;
      element.style.cursor = "grab";
      draw.current();
    };

    // Double-click a pinned dot to let it go back to the physics.
    const release = (event: MouseEvent) => {
      const dot = hit(world(event));
      if (!dot || dot.fx == null) return;
      dot.fx = null;
      dot.fy = null;
      simulation.current?.alpha(0.3).restart();
    };

    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      s.fitting = false;
      const before = world(event);
      const k = Math.min(5, Math.max(0.1, s.camera.k * Math.exp(-event.deltaY * 0.0015)));
      s.camera.k = k;
      const after = world(event);
      s.camera.x += after.x - before.x;
      s.camera.y += after.y - before.y;
      draw.current();
    };

    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    element.addEventListener("pointerleave", leave);
    element.addEventListener("dblclick", release);
    element.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("keydown", escape, true);
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("dblclick", release);
      element.removeEventListener("wheel", wheel);
    };
  }, []);

  return (
    <div className="mapcanvas" ref={wrap} style={{ height }}>
      <canvas ref={canvas} className="mapcanvas__canvas" role="img" aria-label={label} />
    </div>
  );
}
