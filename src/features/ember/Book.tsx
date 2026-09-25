import type { RefObject } from "react";
import { DANCE_NAMES, DANCES } from "@shared/ember";
import { WARDROBE, lookOf } from "@shared/wardrobe";
import { WAYS_UP, type WayUp } from "@shared/ascent";
import { GARMENTS, pieceOf, type Garment, type Outfit } from "@shared/closet";
import {
  collected,
  keyOf,
  needsLabel,
  needsOf,
  upNext,
  warmthBand,
  type EmberStats,
  type Learnable,
  type Warmth,
} from "@shared/growth";

/**
 * Ember's book: everything she knows, everything she does not yet, and what
 * it takes to teach her.
 *
 * Opened by right-clicking her. The top is the part that does the work: how
 * warm your habits have kept her, and the next thing she learns with how far
 * off it is - a goal you can nearly touch is the one that gets you to tick
 * the box. Below, every dance, costume and way home, the locked ones greyed
 * with what unlocks them. Asking for a locked one gets a shake of the head.
 * And her clothes: tap a thing to put it on her or take it off, or let her
 * choose for herself again.
 */

const WAY_NAMES: Record<WayUp, string> = {
  rope: "The rope",
  web: "The web",
  magic: "Magic",
  spring: "The pogo spring",
  rocket: "The rocket",
};

const WARMTH_SAID: Record<Warmth, string> = {
  blazing: "Blazing",
  warm: "Warm",
  low: "Getting cold",
  embers: "Down to embers",
};

export function nameOf(item: Learnable): string {
  if (item.kind === "dance") return DANCE_NAMES[item.id];
  if (item.kind === "way") return WAY_NAMES[item.id];
  if (item.kind === "garment") return pieceOf(item.id).name;
  const who = lookOf(item.id).who;
  return who.charAt(0).toUpperCase() + who.slice(1);
}

export function Book({
  menu,
  at,
  stats,
  learned,
  onPlay,
  onLocked,
  outfit,
  chosen,
  favourite,
  onWear,
  onLetHerChoose,
}: {
  menu: RefObject<HTMLDivElement | null>;
  at: { x: number; y: number };
  stats: EmberStats | null;
  learned: ReadonlySet<string> | null;
  onPlay: (item: Learnable) => void;
  onLocked: (item: Learnable) => void;
  /** What she has on. */
  outfit: Outfit;
  /** Whether you dressed her, rather than her picking for herself. */
  chosen: boolean;
  /** The dance she likes best. */
  favourite: string | null;
  onWear: (garment: Garment) => void;
  onLetHerChoose: () => void;
}) {
  const knows = (item: Learnable) => !learned || learned.has(keyOf(item));
  const counts = learned ? collected(learned) : null;
  const band = stats ? warmthBand(stats.warmth) : null;
  const next = stats ? upNext(stats, 2) : [];

  const worn = new Set(Object.values(outfit));

  const item = (one: Learnable) => {
    const known = knows(one);
    const needs = needsLabel(needsOf(one));
    const on = one.kind === "garment" && worn.has(one.id);
    const loved = one.kind === "dance" && one.id === favourite;
    return (
      <button
        key={keyOf(one)}
        type="button"
        role={one.kind === "garment" ? "menuitemcheckbox" : "menuitem"}
        aria-checked={one.kind === "garment" ? on : undefined}
        data-on={on ? "yes" : undefined}
        // Locked is not disabled: asking for it is how you find out what it
        // takes, and she answers with a shake of the head. Its name says so.
        className={`ember-menu__item${known ? "" : " ember-menu__item--locked"}`}
        data-locked={known ? undefined : "yes"}
        title={known ? undefined : `Unlocks at: ${needs}`}
        onClick={() => (!known ? onLocked(one) : one.kind === "garment" ? onWear(one.id) : onPlay(one))}
      >
        <span>
          {nameOf(one)}
          {loved && <span className="ember-menu__loved"> ★ her favourite</span>}
        </span>
        {on && <span className="ember-menu__needs">wearing</span>}
        {!known && (
          <span className="ember-menu__needs">
            <span className="visually-hidden">, locked until </span>
            {needs}
          </span>
        )}
      </button>
    );
  };

  return (
    <div ref={menu} className="ember-menu" role="menu" aria-label="Ask Ember for a move" style={{ left: at.x, top: at.y }}>
      {stats && band && (
        <div className="ember-menu__state">
          <p className="ember-menu__warmth" data-warmth={band}>
            <strong>{WARMTH_SAID[band]}</strong>
            <span>
              {stats.habits === 0
                ? "Give her a habit to feed on: add one under Habits on Today."
                : `${stats.keptToday} of ${stats.habits} ${stats.habits === 1 ? "habit" : "habits"} fed to her today`}
            </span>
          </p>
          <p className="ember-menu__level">
            Level {stats.level}
            {stats.best > 0 && ` · best run ${stats.best} ${stats.best === 1 ? "day" : "days"}`}
          </p>
          {next.length > 0 && (
            <ul className="ember-menu__next" aria-label="What she learns next">
              {next.map((one) => (
                <li key={keyOf(one.item)}>
                  <strong>{nameOf(one.item)}</strong> - {needsLabel(one.needs).toLowerCase()},{" "}
                  {one.togo} {one.unit === "XP" ? "XP" : one.togo === 1 ? "day" : "days"} to go
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="ember-menu__title">
        Dance{counts && ` · ${counts.dance.have} of ${counts.dance.of}`}
      </p>
      <div className="ember-menu__grid">{DANCES.map((id) => item({ kind: "dance", id }))}</div>

      <p className="ember-menu__title">
        Be somebody{counts && ` · ${counts.costume.have} of ${counts.costume.of}`}
      </p>
      <div className="ember-menu__grid">{WARDROBE.map((look) => item({ kind: "costume", id: look.id }))}</div>

      <p className="ember-menu__title">
        Her clothes{counts && ` · ${counts.garment.have} of ${counts.garment.of}`}
      </p>
      <p className="ember-menu__hint">
        {chosen ? "You dressed her. " : "She picked these herself today. "}
        Tap a thing to put it on or take it off.
        {chosen && (
          <>
            {" "}
            <button type="button" className="ember-menu__link" onClick={onLetHerChoose}>
              Let her choose
            </button>
          </>
        )}
      </p>
      <div className="ember-menu__grid">{GARMENTS.map((piece) => item({ kind: "garment", id: piece.id }))}</div>

      <p className="ember-menu__title">
        Ways home{counts && ` · ${counts.way.have} of ${counts.way.of}`}
      </p>
      <p className="ember-menu__hint">What she does to get back up when you put her down somewhere below her line.</p>
      <div className="ember-menu__grid">{WAYS_UP.map((id) => item({ kind: "way", id }))}</div>
    </div>
  );
}
