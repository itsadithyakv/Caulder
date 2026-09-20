import { weekdayOf } from "./dates";

/**
 * What Caulder says when it is not reporting anything: hello, a clear day, and
 * an aside - a joke, a pun, a tip or a line that has lasted.
 *
 * Pure, like everything it sits beside. It is handed the hour, the day, what
 * has been said before and a seed; the window keeps the memory and rolls the
 * dice. Nothing here is random by itself, so all of it can be tested.
 *
 * It does not repeat itself until it has run out: a line not yet said is
 * always preferred, and when every line has been, the one said longest ago
 * comes round again. Picking blind from fifty lines repeats within nine.
 *
 * The quotes are old enough to be anybody's, and only ones whose author is not
 * in doubt: a famous line under the wrong name is worse than no line.
 */

type Line = (who: string) => string;

/** ", Adi" or nothing: every line reads whole without a name. */
const to = (who: string) => (who ? `, ${who}` : "");

const ANY_HOUR: Line[] = [
  (who) => `Welcome back${to(who)}.`,
  (who) => `Good to see you${to(who)}.`,
  (who) => (who ? `Hey ${who}.` : "Hey."),
  (who) => (who ? `${who} returns.` : "There you are."),
  (who) => `What are we doing today${to(who)}?`,
  (who) => `Ready when you are${to(who)}.`,
  (who) => (who ? `Look who it is. ${who}.` : "Look who it is."),
  (who) => `Hello again${to(who)}.`,
  (who) => (who ? `Ah, ${who}. Right on time.` : "Right on time."),
  (who) => `Let's make a dent${to(who)}.`,
  (who) => `What's the plan${to(who)}?`,
  (who) => `The usual${to(who)}?`,
  (who) => `Back for more${to(who)}?`,
  (who) => `Here we go${to(who)}.`,
  (who) => (who ? `${who}! Just the person I wanted to see.` : "Just the person I wanted to see."),
  (who) => `Reporting for duty${to(who)}.`,
  (who) => `Where were we${to(who)}?`,
  (who) => `Pick up where we left off${to(who)}?`,
  (who) => `All yours${to(who)}.`,
  (who) => `Nice to have you back${to(who)}.`,
  (who) => `What's on your mind${to(who)}?`,
  (who) => `Tell me everything${to(who)}.`,
  (who) => `One thing at a time${to(who)}.`,
  (who) => `Let's keep it simple${to(who)}.`,
  (who) => `You showed up${to(who)}. That's most of it.`,
  (who) => `Small steps${to(who)}.`,
  (who) => `Hi${to(who)}.`,
  (who) => `Howdy${to(who)}.`,
  (who) => `Ahoy${to(who)}.`,
  (who) => `Namaste${to(who)}.`,
  (who) => `Hola${to(who)}.`,
  (who) => `Deep breath${to(who)}. Let's go.`,
  (who) => `No rush${to(who)}.`,
  (who) => `Good to have you${to(who)}.`,
  (who) => `I kept your seat warm${to(who)}.`,
  (who) => `Everything's where you left it${to(who)}.`,
];

/** The day in five parts. The small hours are their own: nobody up at three is having an evening. */
const PARTS: { from: number; lines: Line[] }[] = [
  {
    from: 0,
    lines: [
      (who) => `Still up${to(who)}?`,
      (who) => `Burning the midnight oil${to(who)}?`,
      (who) => `The quiet hours${to(who)}.`,
      (who) => `Can't sleep${to(who)}?`,
      (who) => `It's late${to(who)}. Be kind to tomorrow-you.`,
      (who) => `The world's asleep${to(who)}. You're not.`,
      (who) => `Midnight ideas are the best ones${to(who)}.`,
      (who) => `Go to bed${to(who)}. After this one thing.`,
    ],
  },
  {
    from: 5,
    lines: [
      (who) => `Morning${to(who)}.`,
      (who) => `Good morning${to(who)}.`,
      (who) => `Fresh page${to(who)}.`,
      (who) => `Up and at it${to(who)}.`,
      (who) => `Coffee first${to(who)}?`,
      (who) => `Rise and shine${to(who)}.`,
      (who) => `Early bird${to(who)}?`,
      (who) => `The day's wide open${to(who)}.`,
      (who) => `Sun's up${to(who)}.`,
      (who) => `Chai or coffee${to(who)}?`,
      (who) => `Let's win the morning${to(who)}.`,
      (who) => `First things first${to(who)}.`,
      (who) => `Top of the morning${to(who)}.`,
      (who) => `Slept well${to(who)}?`,
      (who) => `What's first${to(who)}?`,
    ],
  },
  {
    from: 12,
    lines: [
      (who) => `Afternoon${to(who)}.`,
      (who) => `Good afternoon${to(who)}.`,
      (who) => `Back at it${to(who)}?`,
      (who) => `How is the day going${to(who)}?`,
      (who) => `Had lunch${to(who)}?`,
      (who) => `Halfway there${to(who)}.`,
      (who) => `Second wind${to(who)}?`,
      (who) => `Post-lunch push${to(who)}.`,
      (who) => `Still going strong${to(who)}?`,
      (who) => `Keep it rolling${to(who)}.`,
      (who) => `How's the list looking${to(who)}?`,
      (who) => `Afternoon slump? Not you${to(who)}.`,
    ],
  },
  {
    from: 17,
    lines: [
      (who) => `Evening${to(who)}.`,
      (who) => `Good evening${to(who)}.`,
      (who) => `How did today go${to(who)}?`,
      (who) => `Golden hour${to(who)}.`,
      (who) => `Wrapping up${to(who)}?`,
      (who) => `Home stretch${to(who)}.`,
      (who) => `One more push${to(who)}?`,
      (who) => `What got done today${to(who)}?`,
      (who) => `Tea time${to(who)}?`,
      (who) => `Nearly there${to(who)}.`,
      (who) => `Sunset shift${to(who)}.`,
    ],
  },
  {
    from: 21,
    lines: [
      (who) => `Winding down${to(who)}?`,
      (who) => `Late one${to(who)}?`,
      (who) => `One last thing${to(who)}?`,
      (who) => `Night owl mode${to(who)}.`,
      (who) => `Tomorrow's problem${to(who)}?`,
      (who) => `Empty your head${to(who)}. Then bed.`,
      (who) => `Almost bedtime${to(who)}.`,
      (who) => `Quiet now${to(who)}. Good time to think.`,
      (who) => `Last call${to(who)}.`,
      (who) => `Jot it down and sleep on it${to(who)}.`,
    ],
  },
];

const BY_WEEKDAY: Record<number, Line[]> = {
  1: [(who) => `New week${to(who)}.`, (who) => `Monday. Let's go${to(who)}.`, (who) => `Mondays, eh${to(who)}?`, (who) => `Fresh week${to(who)}.`],
  2: [(who) => `Tuesday. Monday's behind you${to(who)}.`, (who) => `Happy Tuesday${to(who)}.`],
  3: [(who) => `Halfway through the week${to(who)}.`, (who) => `Midweek already${to(who)}.`],
  4: [(who) => `Almost Friday${to(who)}.`, (who) => `Thursday: Friday's understudy${to(who)}.`],
  5: [(who) => `Happy Friday${to(who)}.`, (who) => `Friday at last${to(who)}.`, (who) => `Finish strong${to(who)}.`, (who) => `Weekend's loading${to(who)}.`],
  6: [(who) => `Saturday session${to(who)}?`, (who) => `Weekend mode${to(who)}.`, (who) => `Saturday. No alarms${to(who)}.`],
  7: [(who) => `Easy Sunday${to(who)}?`, (who) => `Sunday reset${to(who)}.`, (who) => `Plan the week${to(who)}?`, (who) => `Slow Sunday${to(who)}.`],
};

/** Said only on the day they are true. */
const BY_DATE: Record<string, Line[]> = {
  "01-01": [(who) => `Happy new year${to(who)}.`],
  "12-31": [(who) => `Last day of the year${to(who)}.`],
};

const NEW_MONTH: Line[] = [(who) => `New month${to(who)}. Fresh start.`];
const BEHIND: Line[] = [(who) => `A few things slipped${to(who)}. No judgement.`, (who) => `Some catching up to do${to(who)}.`];
const NOTHING_ON: Line[] = [(who) => `Nothing on the list${to(who)}. Suspicious.`, (who) => `Clean slate${to(who)}.`];
const A_LOT_ON: Line[] = [(who) => `Busy one today${to(who)}.`, (who) => `Full plate${to(who)}. One bite at a time.`];

/** Which of the day's five parts an hour falls in. The window picks again when it changes. */
export function partOf(hour: number): number {
  let part = 0;
  PARTS.forEach((each, index) => {
    if (hour >= each.from) part = index;
  });
  return part;
}

type Moment = {
  /** 0 to 23, in the workspace's timezone. */
  hour: number;
  /** YYYY-MM-DD. */
  day: string;
  due?: number;
  late?: number;
  /** What has been said before, oldest first. */
  seen: string[];
  seed: number;
};

/**
 * Hello, in one short line: the hour's, the day's, what the list looks like,
 * or one for any time. `say` takes the name last, because the name arrives
 * late and the line should not change when it does.
 */
export function greet({ hour, day, due = 0, late = 0, seen, seed }: Moment): { key: string; say: (name: string | null) => string } {
  const pool = [
    ...(PARTS[partOf(hour)]?.lines ?? []),
    ...(BY_WEEKDAY[weekdayOf(day)] ?? []),
    ...(BY_DATE[day.slice(5)] ?? []),
    ...(day.endsWith("-01") && day.slice(5) !== "01-01" ? NEW_MONTH : []),
    ...(late > 0 ? BEHIND : due === 0 ? NOTHING_ON : due >= 6 ? A_LOT_ON : []),
    ...ANY_HOUR,
  ];
  const line = fresh(pool, (each) => each(""), seen, seed);
  // The first name is all that is used; nobody is greeted by their surname.
  return { key: line(""), say: (name) => line((name ?? "").trim().split(/\s+/)[0] ?? "") };
}

type Saying = { says: string; by?: string };

/** Said in place of a count, when there is nothing to count. */
const CLEAR: string[] = [
  "Nothing due. The day is yours.",
  "A clear day. Make something, or don't.",
  "All caught up. Enjoy it while it lasts.",
  "Nothing waiting on you. Rare. Savour it.",
  "Inbox of life: zero.",
  "A blank day is not an empty one.",
  "Nothing due. Go outside.",
  "The list is empty. The kettle isn't.",
  "No tasks. No excuses needed.",
  "Free as a bird today.",
  "Nothing due. Call someone you like.",
  "An open day. Dangerous. Wonderful.",
  "Zero things. Infinite options.",
  "All clear. Pick up the guitar.",
];

export function clearDay(seen: string[], seed: number): { key: string; says: string } {
  const says = fresh(CLEAR, (each) => each, seen, seed);
  return { key: says, says };
}

/** The line under the day: mostly jokes, some of them good. */
const ASIDES: Saying[] = [
  { says: "Why did the scarecrow get promoted? He was outstanding in his field." },
  { says: "I'm reading a book about anti-gravity. It's impossible to put down." },
  { says: "I used to hate facial hair, but then it grew on me." },
  { says: "Why don't scientists trust atoms? They make up everything." },
  { says: "I would tell you a construction joke, but I'm still working on it." },
  { says: "What do you call a fake noodle? An impasta." },
  { says: "Why did the bicycle fall over? It was two-tired." },
  { says: "I only know 25 letters of the alphabet. I don't know y." },
  { says: "What do you call cheese that isn't yours? Nacho cheese." },
  { says: "Why can't you trust stairs? They're always up to something." },
  { says: "I'm on a seafood diet. I see food and I eat it." },
  { says: "How does a penguin build its house? Igloos it together." },
  { says: "Why did the coffee file a police report? It got mugged." },
  { says: "What's a calendar's favourite food? Dates." },
  { says: "Why was the calendar nervous? Its days were numbered." },
  { says: "I told my computer I needed a break. It went to sleep." },
  { says: "Why did the developer go broke? He used up all his cache." },
  { says: "There are 10 kinds of people: those who read binary and those who don't." },
  { says: "Why do programmers prefer dark mode? Because light attracts bugs." },
  { says: "A SQL query walks into a bar, goes up to two tables and asks: may I join you?" },
  { says: "Procrastinators unite! Tomorrow." },
  { says: "I have a joke about procrastination. I'll tell you later." },
  { says: "I have a joke about time travel, but you didn't like it." },
  { says: "Why did the maths book look sad? It had too many problems." },
  { says: "Parallel lines have so much in common. Shame they'll never meet." },
  { says: "What do you call a bear with no teeth? A gummy bear." },
  { says: "I locked myself out of the music room. Wrong key." },
  { says: "I'd tell you a chemistry joke, but I wouldn't get a reaction." },
  { says: "What did one wall say to the other? Meet you at the corner." },
  { says: "I started a running joke. It's going the distance." },
  { says: "Gym tip: the heaviest weight is the front door." },
  { says: "What did the ocean say to the beach? Nothing. It just waved." },
  { says: "Why did the tomato blush? It saw the salad dressing." },
  { says: "I ordered a chicken and an egg online. I'll let you know." },
  { says: "What do you call a belt made of watches? A waist of time." },
  { says: "My boss told me to have a good day. So I went home." },
  { says: "I asked the librarian for a book on paranoia. She whispered: it's right behind you." },
  { says: "What do you call a dinosaur with a great vocabulary? A thesaurus." },
  { says: "To whoever invented zero: thanks for nothing." },
  { says: "I'd make a pencil joke, but it's pointless." },
  { says: "Seven days without a pun makes one weak." },
  { says: "Bird watchers: always after cheep thrills." },
  { says: "Espresso yourself." },
  { says: "Decaf? No thanks. I've got things to do." },
  { says: "Chai is a hug in a cup." },
  { says: "Today's forecast: a strong chance of getting something done." },
  { says: "You can't spell “done” without “one”. Start with one." },
  { says: "What do you call a lazy kangaroo? A pouch potato." },
  { says: "I used to be a banker, but I lost interest." },
  { says: "Why did the golfer bring two pairs of trousers? In case he got a hole in one." },
  { says: "I got a job at a bakery because I kneaded dough." },
  { says: "What do you call a sleeping bull? A bulldozer." },

  { says: "Type it the way you'd text it. I'll work it out." },
  { says: "You can tell me what you did, not only what you will do." },
  { says: "Small things count. Log the push-ups." },
  { says: "Future you will thank present you." },
  { says: "One line now saves ten minutes of remembering later." },
  { says: "Done is a fine place to be." },

  { says: "Simplify, simplify.", by: "Thoreau" },
  { says: "Dwell on the beauty of life.", by: "Marcus Aurelius" },
  { says: "Waste no more time arguing what a good man should be. Be one.", by: "Marcus Aurelius" },
  { says: "Begin at once to live.", by: "Seneca" },
  { says: "The best way out is always through.", by: "Robert Frost" },
  { says: "Slow and steady wins the race.", by: "Aesop" },
  { says: "Make haste slowly.", by: "Augustus" },
  { says: "Know thyself.", by: "the temple at Delphi" },
  { says: "Fortune favours the bold.", by: "Virgil" },
  { says: "The unexamined life is not worth living.", by: "Socrates" },
  { says: "No man ever steps in the same river twice.", by: "Heraclitus" },
  { says: "A journey of a thousand miles begins with a single step.", by: "Lao Tzu" },
  { says: "He who has a why to live can bear almost any how.", by: "Nietzsche" },
  { says: "Little strokes fell great oaks.", by: "Benjamin Franklin" },
  { says: "Lost time is never found again.", by: "Benjamin Franklin" },
  { says: "To thine own self be true.", by: "Shakespeare" },
  { says: "The only way to have a friend is to be one.", by: "Emerson" },
  { says: "Arise, awake, and stop not till the goal is reached.", by: "Swami Vivekananda" },
  { says: "You have a right to the work, never to its fruits.", by: "the Bhagavad Gita" },
];

export function aside(seen: string[], seed: number): Saying & { key: string } {
  const said = fresh(ASIDES, (each) => each.says, seen, seed);
  return { ...said, key: said.says };
}

/**
 * What the quick window shows in its empty line: a task, the way somebody
 * would really type one. Each is an example of something the line reads -
 * a time, a day, a repeat, a short form, an area - so the placeholder teaches
 * by being different every time, where a paragraph of hints was not read once.
 * voice.test.ts reads every one of them, so none can promise what does not work.
 */
const TASKS: string[] = [
  "Datascience assignment at 4pm today",
  "call mum tmrw 7pm",
  "gym every mon wed fri 6am until dec",
  "mtg w rahul nxt wk",
  "dentist on the 23rd at 10am",
  "pay rent on the 1st",
  "read 20 pages tonight",
  "email kiran sir about the retest asap",
  "submit the report by fri, not urgent",
  "haircut sat 11am",
  "study for ml exam monday 5pm for 2h",
  "buy milk today",
  "renew passport next month",
  "water the plants every sunday 8am until dec",
  "guitar practice at 8pm for 30 min",
  "book train tickets b4 friday",
  "lunch with priya tomorrow 1pm",
  "send invoice to unifloe today",
];

export function taskExample(seen: string[], seed: number): { key: string; says: string } {
  const says = fresh(TASKS, (each) => each, seen, seed);
  return { key: says, says };
}

/** What has been said, with this added: most recent last, said twice kept once, and not for ever. */
export function remembered(seen: string[], key: string): string[] {
  return [...seen.filter((each) => each !== key), key].slice(-600);
}

/**
 * One from the pool that has not been said; failing that, the one said
 * longest ago. `seen` is oldest first, so that is the lowest index.
 */
function fresh<T>(pool: T[], keyOf: (each: T) => string, seen: string[], seed: number): T {
  const unsaid = pool.filter((each) => !seen.includes(keyOf(each)));
  if (unsaid.length > 0) return unsaid[Math.abs(Math.trunc(seed)) % unsaid.length] as T;
  return [...pool].sort((a, b) => seen.lastIndexOf(keyOf(a)) - seen.lastIndexOf(keyOf(b)))[0] as T;
}
