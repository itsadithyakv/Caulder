import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { getSetting, setSetting } from "./settings";

/**
 * "This is me": the name this Caulder writes on every revision, so that with
 * two founders a page says who changed it, and an id the shared brain knows
 * this Caulder by. The id is made the first time it is asked for and never
 * changes; the name is whatever was last typed in Settings.
 */

type Me = { id: string; name: string | null };

export function readMe(db: Db): Me {
  let parsed: Partial<Me> = {};
  try {
    parsed = JSON.parse(getSetting(db, "thisIsMe") ?? "{}") as Partial<Me>;
  } catch {
    parsed = {};
  }
  const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : null;
  if (typeof parsed.id === "string" && parsed.id) return { id: parsed.id, name };
  const me = { id: randomUUID(), name };
  setSetting(db, "thisIsMe", JSON.stringify(me));
  return me;
}

export function writeMe(db: Db, name: unknown): Me {
  if (typeof name !== "string") throw new Error("Say your name.");
  const trimmed = name.trim().slice(0, 60);
  const me = { id: readMe(db).id, name: trimmed || null };
  setSetting(db, "thisIsMe", JSON.stringify(me));
  return me;
}
