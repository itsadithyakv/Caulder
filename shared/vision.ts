import { z } from "zod";
import { TASK_AREAS, type TaskArea } from "./domain";

/**
 * The vision board (PLAN.md, phase 17): pictures and words for what the year
 * is for, each tied to a goal or an area if wanted, in the order they were
 * put. Yours alone - never synced, never in the brain's files.
 */

export type VisionTile = {
  id: string;
  /** A caption under a picture, or the whole tile when there is none. */
  words: string | null;
  /** A data: URL, ready for an <img>; null for a tile of words. */
  picture: string | null;
  width: number | null;
  height: number | null;
  goal: { id: string; title: string } | null;
  area: TaskArea | null;
};

export const visionInput = z.object({
  words: z
    .string()
    .trim()
    .max(160, "Keep it under 160 characters.")
    .nullable()
    .default(null)
    .transform((value) => (value ? value : null)),
  goalId: z.string().uuid().nullable().default(null),
  area: z.enum(TASK_AREAS).nullable().default(null),
});

export type VisionInput = z.input<typeof visionInput>;

/** The picture types the window may send, each after it has been made smaller. */
export const PICTURE_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
export type PictureType = (typeof PICTURE_TYPES)[number];

/** A picture, made smaller in the window before it is sent. */
export type VisionPicture = { bytes: Uint8Array; type: PictureType; width: number; height: number };

/** The long side a picture is brought down to. A board tile is never shown larger. */
export const PICTURE_LONG_SIDE = 1400;
/** What a picture may weigh once made smaller: enough for a sharp photo, not for a film. */
export const PICTURE_MAX_BYTES = 1_500_000;

/** The file's first bytes say what it is, whatever it claims. */
export function pictureTypeOf(bytes: Uint8Array): PictureType | null {
  const at = (index: number) => bytes[index] ?? -1;
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** A picture's size brought within the long side, its shape kept. */
export function fitWithin(width: number, height: number, longSide = PICTURE_LONG_SIDE): { width: number; height: number } {
  const scale = Math.min(1, longSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
