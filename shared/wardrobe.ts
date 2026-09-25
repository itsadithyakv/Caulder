/**
 * Ember's wardrobe: everybody she dresses up as, and the days she does it.
 *
 * Two ways a costume comes out. Most of the time it is her own idea - a
 * dressing-up stretch comes round in her pastimes, and she works through the
 * wardrobe in order. And on a day that belongs to somebody in it, she is that
 * person all day, the way a search page draws its logo for a birthday: Einstein
 * on the fourteenth of March, the Moon landing on the twentieth of July.
 *
 * **A dated costume says why it is on.** The hats used to follow the calendar
 * and that was taken out, because a hat that arrives for a reason you cannot
 * see reads as a bug. A doodle is the exception that proves it: the day comes
 * with a caption - who, and what happened on this date - so the reason is on
 * the screen next to her.
 *
 * Everything here is names and dates. What each costume looks like and the
 * move it comes with are drawn in the component, because they are pixels.
 */

export type EmberCostume =
  | "mj"
  | "zeus"
  | "superman"
  | "einstein"
  | "tyson"
  | "napoleon"
  | "batman"
  | "cleopatra"
  | "trump"
  | "newton"
  | "elvis"
  | "armstrong"
  | "brucelee"
  | "lincoln"
  | "freddie"
  | "shakespeare"
  | "bolt"
  | "beethoven"
  | "chaplin"
  | "caesar"
  | "bobross"
  | "curie"
  | "viking"
  | "pirate"
  | "wizard"
  | "detective"
  | "plumber"
  | "knight"
  | "frida"
  | "cowboy"
  | "hero"
  | "srk"
  | "rajini"
  | "sachin"
  | "dhoni"
  | "kalam"
  | "ronaldo";

type Look = {
  id: EmberCostume;
  /** Who she is being, as it would be said: "Albert Einstein", "a pirate". */
  who: string;
  /** Their day, month and day as `MM-DD`, if they have one. */
  on?: string;
  /** What that day is, for the caption. */
  because?: string;
  /** What she does in it, said in a few words, for the caption. */
  move: string;
};

/**
 * The whole wardrobe, in the order she gets round to it.
 *
 * Mixed on purpose - a pop star, a god, a superhero, a film star from
 * Mumbai, a physicist - so two dressing-ups in a row are never two of a
 * kind, and the wardrobe is the world's rather than one country's. Characters stand in as
 * "a pirate", "a boy wizard": the costume is the joke, and the joke is on
 * the person looking at a flame in a deerstalker, not on anybody's work.
 */
export const WARDROBE: readonly Look[] = [
  { id: "mj", who: "Michael Jackson", on: "08-29", because: "born 29 August 1958", move: "the moonwalk and the kick" },
  { id: "zeus", who: "Zeus", move: "a thunderbolt, then his own robe" },
  { id: "superman", who: "Superman", on: "04-18", because: "first in print, 18 April 1938", move: "up, up and away" },
  { id: "srk", who: "Shah Rukh Khan", on: "11-02", because: "born 2 November 1965", move: "the arms, wide open" },
  { id: "einstein", who: "Albert Einstein", on: "03-14", because: "born 14 March 1879", move: "that photograph" },
  { id: "tyson", who: "Mike Tyson", on: "06-30", because: "born 30 June 1966", move: "a combination, and a pigeon" },
  { id: "rajini", who: "Rajinikanth", on: "12-12", because: "born 12 December 1950", move: "the sunglasses" },
  { id: "napoleon", who: "Napoleon", on: "08-15", because: "born 15 August 1769", move: "standing a little taller" },
  { id: "batman", who: "Batman", on: "03-30", because: "first in print, 30 March 1939", move: "the cape" },
  { id: "sachin", who: "Sachin Tendulkar", on: "04-24", because: "born 24 April 1973", move: "the straight drive" },
  { id: "cleopatra", who: "Cleopatra", move: "walking like an Egyptian" },
  { id: "trump", who: "Donald Trump", on: "06-14", because: "born 14 June 1946", move: "the dance" },
  { id: "kalam", who: "A. P. J. Abdul Kalam", on: "10-15", because: "born 15 October 1931", move: "a launch" },
  { id: "newton", who: "Isaac Newton", on: "01-04", because: "born 4 January 1643", move: "an apple, from above" },
  { id: "elvis", who: "Elvis Presley", on: "01-08", because: "born 8 January 1935", move: "the hips" },
  { id: "ronaldo", who: "Cristiano Ronaldo", on: "02-05", because: "born 5 February 1985", move: "the celebration" },
  { id: "armstrong", who: "Neil Armstrong", on: "07-20", because: "on the Moon, 20 July 1969", move: "a small step and a flag" },
  { id: "brucelee", who: "Bruce Lee", on: "11-27", because: "born 27 November 1940", move: "the flying kick" },
  { id: "dhoni", who: "MS Dhoni", on: "07-07", because: "born 7 July 1981", move: "the helicopter shot" },
  { id: "lincoln", who: "Abraham Lincoln", on: "02-12", because: "born 12 February 1809", move: "a very tall hat" },
  { id: "freddie", who: "Freddie Mercury", on: "09-05", because: "born 5 September 1946", move: "the fist in the air" },
  { id: "shakespeare", who: "William Shakespeare", on: "04-23", because: "born, by tradition, 23 April 1564", move: "a skull and a question" },
  { id: "bolt", who: "Usain Bolt", on: "08-21", because: "born 21 August 1986", move: "the sprint and the pose" },
  { id: "beethoven", who: "Beethoven", on: "12-17", because: "baptised 17 December 1770", move: "the Fifth, conducted" },
  { id: "chaplin", who: "Charlie Chaplin", on: "04-16", because: "born 16 April 1889", move: "the waddle and the cane" },
  { id: "caesar", who: "Julius Caesar", on: "07-12", because: "born 12 July 100 BC", move: "thumbs up, thumbs down" },
  { id: "bobross", who: "Bob Ross", on: "10-29", because: "born 29 October 1942", move: "a happy little tree" },
  { id: "curie", who: "Marie Curie", on: "11-07", because: "born 7 November 1867", move: "something that glows" },
  { id: "viking", who: "a Viking", on: "10-09", because: "Leif Erikson Day", move: "the axe and the chant" },
  { id: "pirate", who: "a pirate", on: "09-19", because: "Talk Like a Pirate Day", move: "the cutlass" },
  { id: "wizard", who: "a boy wizard", on: "07-31", because: "a certain boy wizard's birthday", move: "a spell" },
  { id: "detective", who: "a great detective", on: "01-06", because: "Sherlock Holmes's birthday, by his readers' reckoning", move: "the magnifying glass" },
  { id: "plumber", who: "a plumber", on: "03-10", because: "MAR10 Day", move: "a jump at a block" },
  { id: "knight", who: "a space knight", on: "05-04", because: "the fourth of May", move: "the glowing sword" },
  { id: "frida", who: "Frida Kahlo", on: "07-06", because: "born 6 July 1907", move: "the flowers" },
  { id: "cowboy", who: "a cowboy", move: "the lasso" },
  { id: "hero", who: "a hero in green", on: "02-21", because: "his first adventure, 21 February 1986", move: "holding it up to the light" },
];

export function lookOf(id: EmberCostume): Look {
  return WARDROBE.find((look) => look.id === id) ?? (WARDROBE[0] as Look);
}

/**
 * Who she is being today, if today belongs to somebody in the wardrobe.
 * `day` is `YYYY-MM-DD` in the workspace's own day, like every other day in
 * the app - a doodle that turned over at midnight UTC would arrive in India
 * at half past five in the morning and leave at half past five the next.
 */
export function doodleOf(day: string): EmberCostume | null {
  const monthDay = /^\d{4}-(\d{2}-\d{2})$/.exec(day)?.[1];
  if (!monthDay) return null;
  return WARDROBE.find((look) => look.on === monthDay)?.id ?? null;
}

/** The `n`th time she dresses up, which costume comes out. */
export function costumeAt(n: number): EmberCostume {
  const at = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  return (WARDROBE[at % WARDROBE.length] as Look).id;
}

/**
 * What the caption says. A doodle says whose day it is; a costume of her own
 * says only who, because there is no occasion to explain and inventing one
 * would be the calendar-hat mistake again.
 */
export function captionOf(id: EmberCostume, doodle: boolean): string {
  const look = lookOf(id);
  const who = look.who.charAt(0).toUpperCase() + look.who.slice(1);
  return doodle && look.because ? `${who}, ${look.because}.` : `${who}: ${look.move}.`;
}
