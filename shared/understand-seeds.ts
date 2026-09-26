import type { LessonKind } from "./lessons";

/**
 * What each kind of line sounds like, for a machine that has nothing of its
 * own filed yet (PLAN.md, part five, phase 20). The model reads these once;
 * a new line near several of one kind leans that way. Once there are real
 * lines of the person's own, those count for more (shared/opinion.ts).
 *
 * Written the way the line is written to: short, lower case, some Hinglish
 * as it comes out after being turned round, some shorthand. None of them is
 * in the measuring stick (electron/main/understand/lines.eval.ts) - a seed
 * the test is also marked on would only be marking its own homework.
 */
export const SEEDS: Readonly<Record<LessonKind, readonly string[]>> = {
  task: [
    "renew the domain before it lapses",
    "fix the login bug on staging",
    "print the lab record",
    "return the library books",
    "get the laptop serviced",
    "update the pitch deck numbers",
    "pay the electricity bill",
    "reply to the investor email",
    "pick up the courier from reception",
    "submit the internship form",
    "book a slot for the driving test",
    "clean the room before mom comes",
    "send the proposal to the school",
    "prepare slides for the review",
    "recharge the metro card",
    "buy a new charger",
    "fill the scholarship application",
    "call the bank about the card",
  ],
  journal: [
    "such a long day, barely had time to breathe",
    "felt really proud after the demo went well",
    "slept badly again, head feels heavy",
    "lonely evening, missed home a lot",
    "honestly a good day, got a lot done",
    "anxious about results, cannot focus",
    "laughed so much with the hostel gang tonight",
    "bit burnt out, need a slow weekend",
    "today was calm, walked by the lake",
    "frustrated that the meeting went nowhere",
    "quiet sunday, read and napped",
    "mood was off all day for no reason",
    "happy that the team finally clicked",
    "tired but it was worth it",
  ],
  idea: [
    "a referral scheme where schools earn a free month",
    "maybe a whatsapp bot that sends the timetable",
    "we could sell a yearly plan at a discount",
    "a dashboard for parents to see attendance",
    "partner with tuition centres for distribution",
    "a podcast about student founders",
    "turn the onboarding into a short video",
    "an app that splits hostel expenses",
    "offer a free trial to the first ten colleges",
    "a newsletter with one tip a week",
    "run a hackathon with the coding club",
    "a template store for pitch decks",
  ],
  note: [
    "wifi at the library is down again",
    "the canteen closes early on saturdays",
    "meeting room b has a broken projector",
    "the printer on the second floor needs toner",
    "parking near the office is full after ten",
    "the bus pass counter moved to gate two",
    "exam hall seating list is on the notice board",
    "the cafe near college has good wifi",
    "server logs are in the ops folder",
    "the shared drive link changed",
    "gate closes at eleven on weekdays",
  ],
  memory: [
    "the first iphone came out in 2007",
    "octopuses have three hearts",
    "the chorus of that song is in a minor key",
    "the book ends with a twist about the father",
    "the recipe needs the dough to rest overnight",
    "that film was shot entirely on one camera",
    "the author wrote it while in prison",
    "the series has seven books in all",
    "venus spins the other way from earth",
    "the album was recorded in a single week",
    "that chord shape is a capo trick",
    "the human heart beats about a hundred thousand times a day",
    "mount everest gets a few millimetres taller each year",
    "cats cannot taste anything sweet",
    "the mona lisa has no eyebrows",
    "lightning is hotter than the surface of the sun",
    "the pacific is bigger than all the land put together",
    "honeybees can recognise human faces",
    "the oldest known tree is nearly five thousand years old",
  ],
};
