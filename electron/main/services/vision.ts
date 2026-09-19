import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { TASK_AREAS, type TaskArea } from "@shared/domain";
import {
  PICTURE_LONG_SIDE,
  PICTURE_MAX_BYTES,
  PICTURE_TYPES,
  pictureTypeOf,
  visionInput,
  type PictureType,
  type VisionPicture,
  type VisionTile,
} from "@shared/vision";

/**
 * The vision board (PLAN.md, phase 17). Tiles are kept in the order they are
 * put; a picture arrives already made smaller and is checked by its bytes
 * before it is kept, whatever the window says it is.
 */

type TileRow = {
  id: string;
  company_id: string;
  words: string | null;
  picture: Buffer | null;
  picture_type: string | null;
  width: number | null;
  height: number | null;
  goal_id: string | null;
  goal_title: string | null;
  area: string | null;
  position: number;
};

function toTile(row: TileRow): VisionTile {
  return {
    id: row.id,
    words: row.words,
    picture: row.picture && row.picture_type ? `data:${row.picture_type};base64,${row.picture.toString("base64")}` : null,
    width: row.width,
    height: row.height,
    goal: row.goal_id && row.goal_title !== null ? { id: row.goal_id, title: row.goal_title } : null,
    area: TASK_AREAS.includes(row.area as TaskArea) ? (row.area as TaskArea) : null,
  };
}

export function listTiles(db: Db, companyId: string): VisionTile[] {
  return (
    db
      .prepare(
        `SELECT v.*, p.title AS goal_title FROM vision_tiles v
           LEFT JOIN brain_pages p ON p.id = v.goal_id
          WHERE v.company_id = ? ORDER BY v.position, v.created_at`,
      )
      .all(companyId) as TileRow[]
  ).map(toTile);
}

function rowOf(db: Db, id: string): { id: string; company_id: string; picture: Buffer | null } {
  const row = db.prepare(`SELECT id, company_id, picture FROM vision_tiles WHERE id = ?`).get(id) as
    | { id: string; company_id: string; picture: Buffer | null }
    | undefined;
  if (!row) throw new Error("That tile is no longer on the board.");
  return row;
}

/** A goal a tile is tied to has to be one of your goals, in the same company. */
function goalOf(db: Db, companyId: string, goalId: string | null): string | null {
  if (!goalId) return null;
  const row = db
    .prepare(`SELECT id FROM brain_pages WHERE id = ? AND company_id = ? AND section = 'goals' AND is_archived = 0`)
    .get(goalId, companyId) as { id: string } | undefined;
  if (!row) throw new Error("That goal is not one of yours any more.");
  return row.id;
}

/** The picture as it will be kept, or a reason it will not be. */
function checkedPicture(raw: unknown): { bytes: Buffer; type: PictureType; width: number; height: number } {
  const picture = raw as Partial<VisionPicture> | null;
  if (!picture || !(picture.bytes instanceof Uint8Array)) throw new Error("That picture did not arrive.");
  if (picture.bytes.byteLength === 0) throw new Error("That picture is empty.");
  if (picture.bytes.byteLength > PICTURE_MAX_BYTES) throw new Error("That picture is too large, even made smaller.");
  const type = pictureTypeOf(picture.bytes);
  if (!type || !PICTURE_TYPES.includes(type) || type !== picture.type) {
    throw new Error("That is not a picture Caulder can keep: a photo, a PNG or a WebP.");
  }
  const width = Number(picture.width);
  const height = Number(picture.height);
  const fits = (side: number) => Number.isInteger(side) && side >= 1 && side <= PICTURE_LONG_SIDE;
  if (!fits(width) || !fits(height)) throw new Error("That picture was not made smaller first.");
  return { bytes: Buffer.from(picture.bytes), type, width, height };
}

export function addTile(db: Db, companyId: string, rawInput: unknown, rawPicture: unknown, now: Date = new Date()): VisionTile[] {
  const input = visionInput.parse(rawInput ?? {});
  const picture = rawPicture == null ? null : checkedPicture(rawPicture);
  if (!picture && !input.words) throw new Error("A tile needs a picture or some words.");
  const goalId = goalOf(db, companyId, input.goalId);
  const at = now.toISOString();
  const next = db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM vision_tiles WHERE company_id = ?`).get(companyId) as {
    next: number;
  };
  db.prepare(
    `INSERT INTO vision_tiles (id, company_id, words, picture, picture_type, width, height, goal_id, area, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    companyId,
    input.words,
    picture?.bytes ?? null,
    picture?.type ?? null,
    picture?.width ?? null,
    picture?.height ?? null,
    goalId,
    input.area,
    next.next,
    at,
    at,
  );
  return listTiles(db, companyId);
}

/** The words, the goal and the area. A picture is changed by adding a new tile, not by editing this one. */
export function editTile(db: Db, id: string, rawInput: unknown, now: Date = new Date()): VisionTile[] {
  const row = rowOf(db, id);
  const input = visionInput.parse(rawInput ?? {});
  if (!row.picture && !input.words) throw new Error("A tile of words needs its words.");
  const goalId = goalOf(db, row.company_id, input.goalId);
  db.prepare(`UPDATE vision_tiles SET words = ?, goal_id = ?, area = ?, updated_at = ? WHERE id = ?`).run(
    input.words,
    goalId,
    input.area,
    now.toISOString(),
    id,
  );
  return listTiles(db, row.company_id);
}

/** Moves a tile to a place on the board, the rest closing up behind it. */
export function moveTile(db: Db, id: string, rawIndex: unknown): VisionTile[] {
  const row = rowOf(db, id);
  const index = Number(rawIndex);
  if (!Number.isInteger(index)) throw new Error("That is not a place on the board.");
  const order = (
    db.prepare(`SELECT id FROM vision_tiles WHERE company_id = ? ORDER BY position, created_at`).all(row.company_id) as { id: string }[]
  )
    .map((tile) => tile.id)
    .filter((tileId) => tileId !== id);
  order.splice(Math.max(0, Math.min(index, order.length)), 0, id);
  const place = db.prepare(`UPDATE vision_tiles SET position = ? WHERE id = ?`);
  db.transaction(() => order.forEach((tileId, position) => place.run(position, tileId)))();
  return listTiles(db, row.company_id);
}

export function removeTile(db: Db, id: string): VisionTile[] {
  const row = rowOf(db, id);
  db.prepare(`DELETE FROM vision_tiles WHERE id = ?`).run(id);
  return listTiles(db, row.company_id);
}
