import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { List, Maximize2, Pause, Pin, Play, Search, SlidersHorizontal, Unlink, Waypoints, X } from "lucide-react";
import {
  MAP_KINDS,
  MAP_KIND_LABEL,
  MAP_LOOK,
  adjacency,
  asOf,
  lookFrom,
  replaySteps,
  withKinds,
  withoutOrphans,
  type MapGraph,
  type MapKind,
  type MapLook,
  type MapNode,
  type MapPosition,
} from "@shared/map";
import { EmptyState } from "@/components/EmptyState";
import { ErrorLine } from "@/components/ErrorLine";
import { formatDate } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { useOpenRef } from "@/lib/navigate";
import { MapCanvas } from "./MapCanvas";

/**
 * The Map: everything the brain knows, as dots and lines (PLAN.md, phases 7
 * and 16), laid out the way Obsidian lays out a vault.
 *
 * The map fills its pane and the controls float over it: find and the kinds
 * - which are the legend, each a colour and a word, because colour alone is
 * not allowed to mean anything - at the top left; fit, the list and Display at
 * the top right; replay at the foot. Display holds the forces and the looks,
 * kept on this computer. The list view is the same map for the keyboard and
 * the screen reader: every dot, what it is, and what it is linked to.
 *
 * Links can be made here with the mouse as well as typed: drag from a dot's +
 * onto another dot, and the link is written at the foot of the page at one
 * end, where it reads and can be edited like any other. Click a line to take
 * it out. Each says what it did, with a way back.
 */

/** How long a word about a link stays, unless it is acted on. */
const NOTICE_MS = 9000;

type Notice = { text: string; bad?: boolean; action?: { label: string; run: () => void } };

/** Frames a replay takes, whatever the company's age. */
const REPLAY_FRAMES = 70;
const REPLAY_MS = 90;

const LOOK_KEY = "caulder.map.look";
const KINDS_KEY = "caulder.map.kinds";

/** Read from this computer's storage, forgivingly: anything wrong is the defaults. */
function stored<T>(key: string, read: (raw: unknown) => T, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? read(JSON.parse(raw)) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A private window or blocked storage: the map still works, it just forgets.
  }
}

const readKinds = (raw: unknown): Set<MapKind> =>
  new Set(Array.isArray(raw) ? raw.filter((kind): kind is MapKind => (MAP_KINDS as readonly string[]).includes(kind)) : MAP_KINDS);

export function MapView({
  companyId,
  onOpenPage,
  onOpenContact,
}: {
  companyId: string;
  onOpenPage: (pageId: string) => void;
  onOpenContact: (leadId: string) => void;
}) {
  const [graph, setGraph] = useState<MapGraph | null>(null);
  const [allContacts, setAllContacts] = useState(false);
  const [kinds, setKinds] = useState<Set<MapKind>>(() => stored(KINDS_KEY, readKinds, new Set(MAP_KINDS)));
  const [look, setLook] = useState<MapLook>(() => stored(LOOK_KEY, lookFrom, MAP_LOOK));
  const [search, setSearch] = useState("");
  const [asList, setAsList] = useState(false);
  const [display, setDisplay] = useState(false);
  const [refit, setRefit] = useState(0);
  const [replay, setReplay] = useState<{ step: number; playing: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** A line clicked, and where: its two ends and a way to take it out. */
  const [picked, setPicked] = useState<{ source: MapNode; target: MapNode; x: number; y: number } | null>(null);
  const openRef = useOpenRef();

  const load = useCallback(() => {
    window.caulder.brain
      .map(companyId, allContacts)
      .then(setGraph)
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, [companyId, allContacts]);

  useEffect(load, [load]);
  useEffect(() => store(LOOK_KEY, look), [look]);
  useEffect(() => store(KINDS_KEY, [...kinds]), [kinds]);

  const filtered = useMemo(() => {
    if (!graph) return null;
    const some = withKinds(graph, kinds);
    return look.orphans ? some : withoutOrphans(some);
  }, [graph, kinds, look.orphans]);
  const steps = useMemo(() => (filtered ? replaySteps(filtered) : []), [filtered]);

  const shown = useMemo(() => {
    if (!filtered) return null;
    if (!replay || steps.length === 0) return filtered;
    return asOf(filtered, steps[Math.min(replay.step, steps.length - 1)] ?? "");
  }, [filtered, replay, steps]);

  // Replay moves on by itself while playing, and stops at the end.
  useEffect(() => {
    if (!replay?.playing) return;
    const stride = Math.max(1, Math.ceil(steps.length / REPLAY_FRAMES));
    const timer = setInterval(() => {
      setReplay((current) => {
        if (!current) return current;
        const step = current.step + stride;
        return step >= steps.length - 1 ? { step: steps.length - 1, playing: false } : { ...current, step };
      });
    }, REPLAY_MS);
    return () => clearInterval(timer);
  }, [replay?.playing, steps.length]);

  // Positions are kept a moment after the map stops moving, and never mid-replay.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keep = useCallback(
    (positions: MapPosition[]) => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        void window.caulder.brain.keepPositions(companyId, positions).catch(() => undefined);
      }, 400);
    },
    [companyId],
  );
  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);

  function open(node: MapNode) {
    if (node.ref === "page") onOpenPage(node.id);
    else if (node.ref === "contact") onOpenContact(node.id);
    else openRef({ kind: node.ref, id: node.id });
  }

  async function letGo() {
    try {
      await window.caulder.brain.letGo(companyId);
      load();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  // A notice goes by itself after a while.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  async function link(from: MapNode, to: MapNode) {
    setPicked(null);
    try {
      const outcome = await window.caulder.brain.connect(companyId, from.key, to.key);
      const other = from.ref === "page" && from.id === outcome.pageId ? to : from;
      setNotice(
        outcome.already
          ? { text: `${from.label} and ${to.label} are already linked.` }
          : {
              text: `Linked ${outcome.pageTitle} to ${other.label}, at the foot of the page.`,
              action: { label: "Undo", run: () => void unlink(from, to, false) },
            },
      );
      load();
    } catch (cause) {
      setNotice({ text: messageOf(cause), bad: true });
    }
  }

  async function unlink(a: MapNode, b: MapNode, say = true) {
    setPicked(null);
    try {
      await window.caulder.brain.disconnect(companyId, a.key, b.key);
      setNotice(
        say
          ? {
              text: `Took the link between ${a.label} and ${b.label} out. The page's history has it as it was.`,
              action: { label: "Link again", run: () => void link(a, b) },
            }
          : null,
      );
      load();
    } catch (cause) {
      setNotice({ text: messageOf(cause), bad: true });
    }
  }

  function toggle(kind: MapKind) {
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  if (!graph || !shown) return <ErrorLine>{error}</ErrorLine>;

  const pinned = graph.nodes.some((node) => node.pinned);
  const moment = replay ? steps[Math.min(replay.step, steps.length - 1)] : null;
  const counts = new Map<MapKind, number>();
  for (const node of graph.nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);

  return (
    <div className="mapview">
      <section className="card mapview__card">
        {graph.nodes.length === 0 ? (
          <EmptyState
            icon={<Waypoints size={28} className="empty__icon" aria-hidden />}
            title="Nothing on the map yet"
            body="Write a page in the brain, and type [[ in it to link another page, a contact, a product or a person. Each is a dot; each link is a line."
          />
        ) : (
          <div
            className="mapview__stage"
            onPointerDownCapture={(event) => {
              // Anywhere else on the map puts a picked line down.
              if (picked && !(event.target as Element).closest(".mapview__pick")) setPicked(null);
            }}
          >
            {asList ? (
              <MapList graph={shown} onOpen={open} />
            ) : (
              <MapCanvas
                graph={shown}
                height="100%"
                search={search}
                refit={refit}
                look={look}
                label={`The map: ${shown.nodes.length} dots and ${shown.links.length} links. The list view reaches them with the keyboard.`}
                onOpen={open}
                {...(replay
                  ? {}
                  : {
                      onPositions: keep,
                      onLink: (from: MapNode, to: MapNode) => void link(from, to),
                      onPickLine: (ends: { source: MapNode; target: MapNode }, at: { x: number; y: number }) =>
                        setPicked({ ...ends, ...at }),
                    })}
              />
            )}

            {picked && !asList && (
              <div
                className="mapview__pick anim-menu"
                role="dialog"
                aria-label="A link"
                // Under the pointer, and kept inside the map near its edges.
                style={{
                  left: `clamp(170px, ${picked.x}px, calc(100% - 170px))`,
                  top: `min(${picked.y}px, calc(100% - 128px))`,
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setPicked(null);
                }}
              >
                <p className="mapview__pickEnds">
                  <span className={`mapdot mapdot--${picked.source.kind}`} aria-hidden />
                  <span className="mapview__pickName">{picked.source.label}</span>
                  <span className="mapview__pickAnd" aria-hidden>
                    &mdash;
                  </span>
                  <span className={`mapdot mapdot--${picked.target.kind}`} aria-hidden />
                  <span className="mapview__pickName">{picked.target.label}</span>
                </p>
                <div className="mapview__pickActions">
                  <button
                    type="button"
                    className="btn btn--sm btn--danger"
                    autoFocus
                    onClick={() => void unlink(picked.source, picked.target)}
                  >
                    <Unlink size={14} aria-hidden />
                    Take the link out
                  </button>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => setPicked(null)}>
                    Keep it
                  </button>
                </div>
              </div>
            )}

            {notice && (
              <div
                className={`mapview__notice anim-menu${notice.bad ? " mapview__notice--bad" : ""}${
                  steps.length > 1 ? " mapview__notice--raised" : ""
                }`}
                role={notice.bad ? "alert" : "status"}
              >
                <span>{notice.text}</span>
                {notice.action && (
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => {
                      const run = notice.action?.run;
                      setNotice(null);
                      run?.();
                    }}
                  >
                    {notice.action.label}
                  </button>
                )}
                <button type="button" className="btn btn--sm btn--ghost btn--icon" aria-label="Close" onClick={() => setNotice(null)}>
                  <X size={14} aria-hidden />
                </button>
              </div>
            )}

            {/* Find, and the kinds - which are the legend. */}
            <div className="mapview__float mapview__float--left">
              <div className="mapview__search">
                <Search size={15} className="mapview__searchIcon" aria-hidden />
                <input
                  className="input mapview__searchInput"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find on the map"
                  aria-label="Find on the map"
                  type="search"
                />
              </div>
              <div className="mapview__kinds" role="group" aria-label="Show on the map">
                {MAP_KINDS.filter((kind) => (counts.get(kind) ?? 0) > 0).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={`mapview__kind${kinds.has(kind) ? " mapview__kind--on" : ""}`}
                    aria-pressed={kinds.has(kind)}
                    onClick={() => toggle(kind)}
                  >
                    <span className={`mapdot mapdot--${kind}`} aria-hidden />
                    {MAP_KIND_LABEL[kind]}
                    <span className="mapview__kindCount">{counts.get(kind)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mapview__float mapview__float--right">
              {pinned && (
                <button type="button" className="btn btn--sm mapview__tool" onClick={() => void letGo()}>
                  <Pin size={14} aria-hidden />
                  Let go of pinned dots
                </button>
              )}
              <button type="button" className="btn btn--sm mapview__tool" onClick={() => setRefit((n) => n + 1)} title="Zoom to see everything">
                <Maximize2 size={14} aria-hidden />
                Fit
              </button>
              <button
                type="button"
                className="btn btn--sm mapview__tool"
                aria-pressed={asList}
                onClick={() => setAsList((on) => !on)}
              >
                <List size={14} aria-hidden />
                As a list
              </button>
              <button
                type="button"
                className="btn btn--sm mapview__tool"
                aria-expanded={display}
                aria-controls="map-display"
                onClick={() => setDisplay((on) => !on)}
              >
                <SlidersHorizontal size={14} aria-hidden />
                Display
              </button>
            </div>

            {display && (
              <DisplayPanel
                look={look}
                allContacts={allContacts}
                onLook={setLook}
                onAllContacts={setAllContacts}
                onClose={() => setDisplay(false)}
              />
            )}

            {steps.length > 1 && !asList && (
              <div className="mapview__float mapview__float--foot mapview__replay">
                <button
                  type="button"
                  className="btn btn--sm mapview__tool"
                  onClick={() =>
                    setReplay((current) =>
                      current?.playing
                        ? { ...current, playing: false }
                        : { step: current && current.step < steps.length - 1 ? current.step : 0, playing: true },
                    )
                  }
                >
                  {replay?.playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
                  {replay?.playing ? "Pause" : "Replay"}
                </button>
                <input
                  type="range"
                  className="mapview__slider"
                  min={0}
                  max={steps.length - 1}
                  value={replay ? replay.step : steps.length - 1}
                  aria-label="How far back"
                  aria-valuetext={moment ? formatDate(moment) : "Now"}
                  onChange={(event) => setReplay({ step: Number(event.target.value), playing: false })}
                />
                <span className="mapview__moment">{moment ? formatDate(moment) : "Now"}</span>
                {replay && (
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => setReplay(null)}>
                    Back to now
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <ErrorLine>{error}</ErrorLine>
        <p className="card__hint">
          <strong>To link two things</strong>, hover one and drag its <strong>+</strong> onto the other - or hold Alt
          and drag the dot itself. The link is written at the foot of the page. Click a line to take it out.
        </p>
        <p className="card__hint">
          Click a dot to open it; drag it and the rest follows, then settles - hold Shift as you let go to pin it there,
          and double-click a pinned dot to let it go. Scroll to zoom.
        </p>
      </section>
    </div>
  );
}

/** The forces and the looks, as Obsidian has them - kept on this computer. */
function DisplayPanel({
  look,
  allContacts,
  onLook,
  onAllContacts,
  onClose,
}: {
  look: MapLook;
  allContacts: boolean;
  onLook: (look: MapLook) => void;
  onAllContacts: (on: boolean) => void;
  onClose: () => void;
}) {
  const slider = (key: "repel" | "distance" | "centre" | "size" | "lines" | "labelsAt", label: string, min: number, max: number, step: number) => (
    <label className="mapdisplay__slider">
      <span className="mapdisplay__label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={look[key]}
        onChange={(event) => onLook({ ...look, [key]: Number(event.target.value) })}
      />
    </label>
  );
  const toggle = (checked: boolean, label: string, change: (on: boolean) => void) => (
    <label className="mapdisplay__toggle">
      <input type="checkbox" className="tickbox" checked={checked} onChange={(event) => change(event.target.checked)} />
      {label}
    </label>
  );

  return (
    <div id="map-display" className="mapdisplay anim-menu" role="group" aria-label="Display">
      <div className="mapdisplay__head">
        <span className="mapdisplay__title">Display</span>
        <button type="button" className="btn btn--sm btn--ghost" aria-label="Close Display" onClick={onClose}>
          <X size={14} aria-hidden />
        </button>
      </div>
      <p className="mapdisplay__group">Show</p>
      {toggle(look.orphans, "Dots with no lines", (on) => onLook({ ...look, orphans: on }))}
      {toggle(allContacts, "Every contact", onAllContacts)}
      {toggle(look.arrows, "Arrows, the way links were written", (on) => onLook({ ...look, arrows: on }))}
      <p className="mapdisplay__group">Looks</p>
      {slider("labelsAt", "Labels show from", 0.3, 3, 0.05)}
      {slider("size", "Dot size", 0.5, 2.5, 0.05)}
      {slider("lines", "Line thickness", 0.5, 3, 0.1)}
      <p className="mapdisplay__group">Forces</p>
      {slider("repel", "Push apart", 20, 600, 10)}
      {slider("distance", "Line length", 20, 200, 2)}
      {slider("centre", "Pull to the middle", 0, 0.3, 0.005)}
      <button type="button" className="btn btn--sm btn--ghost mapdisplay__reset" onClick={() => onLook(MAP_LOOK)}>
        Back to how it started
      </button>
    </div>
  );
}

/** The map as a list: every dot, biggest first, with what it links to. */
function MapList({ graph, onOpen }: { graph: MapGraph; onOpen: (node: MapNode) => void }) {
  const near = adjacency(graph);
  const byKey = new Map(graph.nodes.map((node) => [node.key, node]));
  const sorted = [...graph.nodes].sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label));
  return (
    <ul className="maplist" aria-label="Everything on the map">
      {sorted.map((node) => {
        const linked = [...(near.get(node.key) ?? [])].map((key) => byKey.get(key)?.label).filter(Boolean);
        return (
          <li key={node.key} className="maplist__row">
            <span className={`mapdot mapdot--${node.kind}`} aria-hidden />
            <button type="button" className="maplist__name" onClick={() => onOpen(node)}>
              {node.label}
            </button>
            <span className="maplist__kind">{MAP_KIND_LABEL[node.kind]}</span>
            <span className="maplist__links">
              {linked.length === 0 ? "Not linked yet" : `Linked to ${linked.join(", ")}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
