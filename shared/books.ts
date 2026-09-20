/**
 * The reading shelf, from a sentence.
 *
 * "I am reading harry potter and the goblet of fire." "I want to read the
 * lord of the flies." "I want to read the percy jackson series." Each says a
 * book and where it stands - being read, to be read, read - and the shelf is
 * those three piles.
 *
 * A series is the books in it, so the well-known ones are written down here
 * and "the percy jackson series" puts all five on the pile, in order. No
 * lookup: Caulder asks nobody on the internet what somebody is reading. A
 * series this does not know goes on the shelf as one entry under its own
 * name, which is still the right pile.
 */

export type ShelfStatus = "to-read" | "reading" | "read";

type BookAsk = {
  status: ShelfStatus;
  /** One book - or every book of a series this knows, in reading order. */
  titles: string[];
  series: string | null;
};

const SERIES: Record<string, readonly string[]> = {
  "percy jackson": ["The Lightning Thief", "The Sea of Monsters", "The Titan's Curse", "The Battle of the Labyrinth", "The Last Olympian"],
  "harry potter": [
    "Harry Potter and the Philosopher's Stone", "Harry Potter and the Chamber of Secrets", "Harry Potter and the Prisoner of Azkaban",
    "Harry Potter and the Goblet of Fire", "Harry Potter and the Order of the Phoenix", "Harry Potter and the Half-Blood Prince",
    "Harry Potter and the Deathly Hallows",
  ],
  "lord of the rings": ["The Fellowship of the Ring", "The Two Towers", "The Return of the King"],
  "hunger games": ["The Hunger Games", "Catching Fire", "Mockingjay"],
  "red rising": ["Red Rising", "Golden Son", "Morning Star", "Iron Gold", "Dark Age", "Light Bringer"],
  narnia: [
    "The Lion, the Witch and the Wardrobe", "Prince Caspian", "The Voyage of the Dawn Treader", "The Silver Chair",
    "The Horse and His Boy", "The Magician's Nephew", "The Last Battle",
  ],
  dune: ["Dune", "Dune Messiah", "Children of Dune", "God Emperor of Dune", "Heretics of Dune", "Chapterhouse: Dune"],
  mistborn: ["The Final Empire", "The Well of Ascension", "The Hero of Ages"],
  "maze runner": ["The Maze Runner", "The Scorch Trials", "The Death Cure"],
  divergent: ["Divergent", "Insurgent", "Allegiant"],
  twilight: ["Twilight", "New Moon", "Eclipse", "Breaking Dawn"],
  "a song of ice and fire": ["A Game of Thrones", "A Clash of Kings", "A Storm of Swords", "A Feast for Crows", "A Dance with Dragons"],
  "game of thrones": ["A Game of Thrones", "A Clash of Kings", "A Storm of Swords", "A Feast for Crows", "A Dance with Dragons"],
  foundation: ["Foundation", "Foundation and Empire", "Second Foundation"],
  "stormlight archive": ["The Way of Kings", "Words of Radiance", "Oathbringer", "Rhythm of War", "Wind and Truth"],
  "three body problem": ["The Three-Body Problem", "The Dark Forest", "Death's End"],
  "his dark materials": ["Northern Lights", "The Subtle Knife", "The Amber Spyglass"],
  "hitchhiker's guide": [
    "The Hitchhiker's Guide to the Galaxy", "The Restaurant at the End of the Universe", "Life, the Universe and Everything",
    "So Long, and Thanks for All the Fish", "Mostly Harmless",
  ],
};

const TO_READ =
  /^\s*(?:(?:i\s+|i(?='))?(?:want|would\s+like|plan|am\s+planning|'d\s+like|'m\s+going)\s+to\s+read|(?:i\s+|i(?='))?(?:will|'ll|should)\s+read|to\s+read|tbr)\s*[:-]?\s+(.+?)\s*$|^\s*add\s+(.+?)\s+to\s+(?:my\s+|the\s+)?(?:reading\s+list|tbr|to\s+be\s+read|shelf|to\s+read(?:\s+list)?)\s*$/i;
const READING = /^\s*(?:(?:i\s+am|i'm|am|currently|now|just)\s+)*(?:started\s+)?reading\s+(.+?)\s*$/i;
const READ = /^\s*(?:i\s+)?(?:just\s+|finally\s+)?(?:finished|completed|done)\s+(?:with\s+)?reading\s+(.+?)\s*$/i;

/** What is said after the title and is not part of it. */
const TRAILING = /\s+(?:today|tonight|now|right\s+now|next|soon|this\s+(?:week|month|year|summer)|sometime|some\s+day|someday|again)\s*[.!]*$/i;
/** "Read chapter 4", "read up on pricing", "read the docs": reading, and not a book on a shelf. */
const NOT_A_BOOK = /^(?:chapter|chapters|ch\b|page|pages|up\b|about|more\b|the\s+(?:docs?|documentation|paper|article|report|contract|email|mail|brief|notes|news|manual|room)|some\b|a\s+(?:bit|lot)|it\b|this\b|that\b|through\b|over\b|\d)/i;

const SMALL = new Set(["a", "an", "the", "of", "and", "in", "on", "to", "for", "by", "with", "at", "from"]);

function titled(name: string): string {
  return name
    .split(/\s+/)
    .map((word, index) => (word !== word.toLowerCase() || (index > 0 && SMALL.has(word)) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** The book a line is about and which pile it goes on, or null when it is not about a book. */
export function readBook(line: string): BookAsk | null {
  const found: [ShelfStatus, RegExpExecArray | null][] = [["read", READ.exec(line)], ["to-read", TO_READ.exec(line)], ["reading", READING.exec(line)]];
  for (const [status, match] of found) {
    if (!match) continue;
    let name = (match[1] ?? match[2] ?? "").replace(TRAILING, "").replace(/^the\s+book\s+/i, "").replace(/[.!]+$/, "").trim();
    if (!name || NOT_A_BOOK.test(name) || name.split(/\s+/).length > 12) return null;
    // "By rick riordan" is who wrote it, and not part of what it is called.
    name = name.replace(/\s+by\s+[\p{L}.' -]+$/iu, "").trim();

    const series = /^(?:the\s+)?(.+?)\s+(?:series|books|saga|trilogy|collection)$/i.exec(name);
    if (series?.[1]) {
      const key = series[1].toLowerCase().replace(/^the\s+/, "");
      const known = SERIES[key];
      return { status, series: titled(series[1]), titles: known ? [...known] : [titled(name)] };
    }
    // A book of a series this knows, by any title it could be typed as.
    const lower = name.toLowerCase().replace(/^the\s+/, "");
    for (const [key, books] of Object.entries(SERIES)) {
      const book = books.find((each) => each.toLowerCase().replace(/^the\s+/, "") === lower);
      if (book) return { status, series: titled(key), titles: [book] };
    }
    return { status, series: null, titles: [titled(name)] };
  }
  return null;
}
