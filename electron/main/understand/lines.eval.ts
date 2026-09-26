import type { LessonKind } from "@shared/lessons";

/**
 * The measuring stick (PLAN.md, part five, phase 20): lines with the answer a
 * person would give, for scoring the rules alone against the rules with the
 * model's second opinion (eval.test.ts).
 *
 * Most are lines the rules already read rightly - the first thing measured is
 * that the model moves none of them - and the rest are the kinds of line the
 * rules only guess at: facts, ideas and feelings said with no word to mark
 * them. `page` is where a memory belongs among the pages of the lived-in
 * machine below, when it belongs on one.
 *
 * Kinds are what the line would be filed as, from the ten readCapture gives.
 * None of these is a seed (shared/understand-seeds.ts).
 */

type Measured = { line: string; kind: string; page?: string };

export const LINES: readonly Measured[] = [
  // Tasks: the rules are sure of most, and nothing must talk them out of it.
  { line: "gotta call rahul tmrw 5", kind: "task" },
  { line: "kal subah 6 baje uthna hai", kind: "task" },
  { line: "submit dbms assignment by friday", kind: "task" },
  { line: "buy milk", kind: "task" },
  { line: "pay rent on the 1st", kind: "task" },
  { line: "book train tickets for diwali", kind: "task" },
  { line: "renew passport next month", kind: "task" },
  { line: "email the deck to priya", kind: "task" },
  { line: "laundry tonight", kind: "task" },
  { line: "dentist at 4 tomorrow", kind: "task" },
  { line: "gym mon wed fri 6am", kind: "task" },
  { line: "revise chapter 4 before the test", kind: "task" },
  { line: "order a new phone case", kind: "task" },
  { line: "mummy ko call karna hai", kind: "task" },
  { line: "need to finish the report by monday", kind: "task" },
  { line: "clean the desk tomorrow morning", kind: "task" },
  { line: "take the car for servicing on saturday", kind: "task" },
  { line: "get groceries after class", kind: "task" },
  { line: "reply to the college about the fee", kind: "task" },
  { line: "print the resume before the interview on 3rd", kind: "task" },

  // The journal.
  { line: "feeling low today, pitch went badly", kind: "journal" },
  { line: "aaj bahut thak gaya", kind: "journal" },
  { line: "mood off hai yaar", kind: "journal" },
  { line: "grateful for amma's food today", kind: "journal" },
  { line: "what a day, finally shipped it", kind: "journal" },
  { line: "couldn't sleep last night", kind: "journal" },
  { line: "i feel so behind on everything", kind: "journal" },
  { line: "today was weirdly peaceful", kind: "journal" },
  { line: "long day at college, zero energy left", kind: "journal" },
  { line: "had fun at the fest", kind: "journal" },
  { line: "kinda nervous about tomorrow's viva", kind: "journal" },
  { line: "proud of how the team handled the client", kind: "journal" },
  { line: "rainy evening, chai and a book, perfect", kind: "journal" },
  { line: "missed the gym again, annoyed with myself", kind: "journal" },

  // Things to remember: life facts the rules are sure of, and facts they are not.
  { line: "my blood group is O+", kind: "memory" },
  { line: "passport is in the blue folder", kind: "memory" },
  { line: "priya's bday is 12 march", kind: "memory" },
  { line: "i'm allergic to peanuts", kind: "memory" },
  { line: "honey never spoils", kind: "memory" },
  { line: "the eiffel tower grows 15cm in summer", kind: "memory" },
  { line: "sharks are older than trees", kind: "memory" },
  { line: "bananas are berries but strawberries aren't", kind: "memory" },
  { line: "a group of crows is called a murder", kind: "memory" },
  { line: "the great wall isn't visible from space", kind: "memory" },
  { line: "wombat poop is cube shaped", kind: "memory" },
  { line: "light from the sun takes eight minutes to reach us", kind: "memory" },
  { line: "the capital of australia is canberra", kind: "memory" },
  { line: "golden son ending hit hard", kind: "memory", page: "Red Rising" },
  { line: "darrow is the best protagonist ever", kind: "memory", page: "Red Rising" },
  { line: "the reaper's sword is a razor that turns rigid", kind: "memory", page: "Red Rising" },
  { line: "capo on the second fret for that song", kind: "memory", page: "Guitar" },
  { line: "the barre on the f chord needs the side of the finger", kind: "memory", page: "Guitar" },
  { line: "keep the bar close on the deadlift", kind: "memory", page: "Gym" },
  { line: "rest two minutes between heavy sets", kind: "memory", page: "Gym" },
  { line: "ethiopian beans taste fruity", kind: "memory", page: "Coffee" },
  { line: "grind finer when the pour over runs fast", kind: "memory", page: "Coffee" },

  // Ideas.
  { line: "could partner with coaching centres", kind: "idea" },
  { line: "app that reminds teachers to fill attendance", kind: "idea" },
  { line: "what if we charge per school", kind: "idea" },
  { line: "maybe we should run a campus ambassador program", kind: "idea" },
  { line: "how about a free pilot for the first three schools", kind: "idea" },
  { line: "a telegram channel for exam notes", kind: "idea" },
  { line: "sell merch at the fest", kind: "idea" },
  { line: "a plugin that summarises lectures", kind: "idea" },
  { line: "parents could get a weekly report on whatsapp", kind: "idea" },
  { line: "bundle the app with a teacher training session", kind: "idea" },
  { line: "a leaderboard for the most active classes", kind: "idea" },
  { line: "white label it for coaching institutes", kind: "idea" },

  // Notes: things true about the world now, kept for later.
  { line: "the server never responds", kind: "note" },
  { line: "the drive takes 2 hours", kind: "note" },
  { line: "office wifi password changed", kind: "note" },
  { line: "the xerox shop closes at 8", kind: "note" },
  { line: "hostel mess menu changes on monday", kind: "note" },
  { line: "room 204 projector is broken", kind: "note" },
  { line: "the new timetable is on the notice board", kind: "note" },
  { line: "the atm near the gate is out of cash", kind: "note" },
  { line: "the lift in block c is under repair", kind: "note" },
  { line: "the vendor portal logs out every ten minutes", kind: "note" },

  // Money, commands, contacts and private lines: the rules are sure, and nothing is asked.
  { line: "uber 340", kind: "command" },
  { line: "zomato 450 last night", kind: "command" },
  { line: "go to money", kind: "command" },
  { line: "spent 1200 on the domain", kind: "command" },
  { line: "spoke to rahul, they want a demo", kind: "contact" },
  { line: "met amma at the temple", kind: "contact" },
  { line: "private: i still think about her", kind: "private" },
  { line: "journal: good day overall", kind: "journal" },
  { line: "idea: a referral leaderboard", kind: "idea" },
  { line: "did 45 min guitar", kind: "hobby" },
  { line: "finished the deck", kind: "done" },
];

/**
 * A machine that has been used for a while: the pages, memories, tasks,
 * notes and ideas the person has filed, which the model finds a line's
 * neighbours among. What each was filed as is its vote.
 */
export const LIVED_IN: readonly { text: string; kind: LessonKind | null; page?: string }[] = [
  { text: "Red Rising", kind: null, page: "Red Rising" },
  { text: "Red Rising: darrow carves his way into the golds", kind: "memory", page: "Red Rising" },
  { text: "Red Rising: the society is split into colours", kind: "memory", page: "Red Rising" },
  { text: "Guitar", kind: null, page: "Guitar" },
  { text: "Guitar: learnt the open chords, g c d", kind: "memory", page: "Guitar" },
  { text: "Guitar: strumming pattern down down up up down", kind: "memory", page: "Guitar" },
  { text: "Gym", kind: null, page: "Gym" },
  { text: "Gym: PR bench 60 kg for 5", kind: "memory", page: "Gym" },
  { text: "Gym: squat below parallel, knees out", kind: "memory", page: "Gym" },
  { text: "Coffee", kind: null, page: "Coffee" },
  { text: "Coffee: v60 at 93 degrees, 1 to 16", kind: "memory", page: "Coffee" },
  { text: "call the school principal about the pilot", kind: "task" },
  { text: "fix the landing page on mobile", kind: "task" },
  { text: "revise dbms unit 3", kind: "task" },
  { text: "library closes at 9 on sundays", kind: "note" },
  { text: "canteen card top up is at the counter", kind: "note" },
  { text: "a whatsapp group for parents of each class", kind: "idea" },
  { text: "discount for schools that refer another school", kind: "idea" },
];
