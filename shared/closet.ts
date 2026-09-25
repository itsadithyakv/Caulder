/**
 * Ember's everyday clothes: what she wears when she is being herself.
 *
 * Costumes (shared/wardrobe.ts) are dressing up as somebody. This is her own
 * closet - a scarf, sneakers, a beanie, the odd party hat - and she is never
 * without something from it: a flame with nothing on read as undressed, not
 * as a flame. Her default is a knitted scarf and white sneakers, which keep
 * clear of her face and her flame and say "cosy" without a word.
 *
 * **She picks her own outfit each day**, from what she has, and on most days
 * adds one thing to the scarf and sneakers. You can dress her instead, from
 * her book; what you choose stays until you let her choose again. More of
 * the closet unlocks as your level goes up (shared/growth.ts).
 */

export type Slot = "head" | "face" | "neck" | "body" | "back" | "feet";

export type Garment =
  | "scarf"
  | "bowtie"
  | "bandana"
  | "sneakers"
  | "boots"
  | "redkicks"
  | "beanie"
  | "bow"
  | "flower"
  | "partyhat"
  | "sweatband"
  | "crown"
  | "shades"
  | "specs"
  | "hoodie"
  | "backpack";

type Piece = { id: Garment; slot: Slot; name: string };

export const GARMENTS: readonly Piece[] = [
  { id: "scarf", slot: "neck", name: "Knitted scarf" },
  { id: "bowtie", slot: "neck", name: "Bow tie" },
  { id: "bandana", slot: "neck", name: "Bandana" },
  { id: "sneakers", slot: "feet", name: "White sneakers" },
  { id: "boots", slot: "feet", name: "Boots" },
  { id: "redkicks", slot: "feet", name: "Red kicks" },
  { id: "beanie", slot: "head", name: "Beanie" },
  { id: "bow", slot: "head", name: "Bow" },
  { id: "flower", slot: "head", name: "A flower" },
  { id: "partyhat", slot: "head", name: "Party hat" },
  { id: "sweatband", slot: "head", name: "Sweatband" },
  { id: "crown", slot: "head", name: "Crown" },
  { id: "shades", slot: "face", name: "Shades" },
  { id: "specs", slot: "face", name: "Round specs" },
  { id: "hoodie", slot: "body", name: "Hoodie" },
  { id: "backpack", slot: "back", name: "Backpack" },
];

export type Outfit = Partial<Record<Slot, Garment>>;

/** What she wears when nothing else has been decided. */
export const DEFAULT_OUTFIT: Outfit = { neck: "scarf", feet: "sneakers" };

export function pieceOf(garment: Garment): Piece {
  return GARMENTS.find((piece) => piece.id === garment) ?? (GARMENTS[0] as Piece);
}

/** A small, steady number from a day, so her pick is the same all day and different tomorrow. */
function dayNumber(day: string): number {
  let hash = 7;
  for (const ch of day) hash = (hash * 31 + ch.charCodeAt(0)) % 100_003;
  return hash;
}

/**
 * Her own pick for a day: the scarf and sneakers, and on most days one more
 * thing from what she has - a hat, or shades. One thing, not a costume
 * change: she has a style, and it is a small one.
 */
export function herPick(day: string, has: (garment: Garment) => boolean): Outfit {
  const outfit: Outfit = { ...DEFAULT_OUTFIT };
  const extras = GARMENTS.filter((piece) => (piece.slot === "head" || piece.slot === "face") && has(piece.id));
  const roll = dayNumber(day);
  // Two days in five, just the scarf and sneakers.
  if (extras.length === 0 || roll % 5 < 2) return outfit;
  const extra = extras[roll % extras.length] as Piece;
  outfit[extra.slot] = extra.id;
  return outfit;
}

/** Puts something on, or takes it off if she is already wearing it. One thing per slot. */
export function wear(outfit: Outfit, garment: Garment): Outfit {
  const { slot } = pieceOf(garment);
  const next = { ...outfit };
  if (next[slot] === garment) delete next[slot];
  else next[slot] = garment;
  return next;
}

/** An outfit with anything she does not have taken off: a saved choice never outruns what is unlocked. */
export function tidy(outfit: Outfit, has: (garment: Garment) => boolean): Outfit {
  const next: Outfit = {};
  for (const [slot, garment] of Object.entries(outfit) as [Slot, Garment][]) {
    if (garment && pieceOf(garment).slot === slot && has(garment)) next[slot] = garment;
  }
  return next;
}
