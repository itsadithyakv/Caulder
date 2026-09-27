/**
 * A second measuring stick (PLAN.md, part five, phase 20): lines the
 * thresholds in shared/opinion.ts were never set by, for seeing whether what
 * the model gained on lines.eval.ts holds on lines it has not met.
 *
 * Written before anything was run on them, and labelled with the answer a
 * person would give - not what the rules or the model happen to do. None is
 * in lines.eval.ts or a seed (shared/understand-seeds.ts), or a light
 * rewording of one. `page` is where a memory belongs among the pages of the
 * lived-in machine in lines.eval.ts (Red Rising, Guitar, Gym, Coffee).
 *
 * Read on the same machines as the first stick (eval.test.ts): contacts Rahul
 * Mehta and Amma, hobbies Guitar, Gym and Reading, one open task.
 */

type Measured = { line: string; kind: string; page?: string };

export const FRESH_LINES: readonly Measured[] = [
  // Tasks: some with a day or an hour and no verb, some with neither.
  { line: "investor call thursday 3pm", kind: "task" },
  { line: "team sync at 10 tomorrow", kind: "task" },
  { line: "parent teacher meeting saturday 11am", kind: "task" },
  { line: "flight to delhi on 2 oct", kind: "task" },
  { line: "haircut", kind: "task" },
  { line: "passport photos", kind: "task" },
  { line: "groceries this weekend", kind: "task" },
  { line: "kal tak invoice bhejna hai", kind: "task" },
  { line: "rahul ko demo dikhana hai friday", kind: "task" },
  { line: "call amma tonight", kind: "task" },
  { line: "find out if the seminar hall is free on the 14th", kind: "task" },
  { line: "follow up with the orchids school about the pilot", kind: "task" },
  { line: "set up the new laptop", kind: "task" },
  { line: "file gst return before the 20th", kind: "task" },
  { line: "lab exam on monday morning", kind: "task" },
  { line: "remember to carry the id card tomorrow", kind: "task" },
  { line: "dont forget the charger", kind: "task" },
  { line: "get the logo files from the designer", kind: "task" },
  { line: "water the plants", kind: "task" },
  { line: "pitch practice with the cofounder at 7", kind: "task" },

  // The journal.
  { line: "nailed the investor call!!", kind: "journal" },
  { line: "slept four hours, running on chai", kind: "journal" },
  { line: "sad that neha is leaving the team", kind: "journal" },
  { line: "so bored of studying for this exam", kind: "journal" },
  { line: "weekend with the cousins was lovely", kind: "journal" },
  { line: "stressed about the placement drive", kind: "journal" },
  { line: "aaj ka din accha tha", kind: "journal" },
  { line: "neend nahi aa rahi", kind: "journal" },
  { line: "yesterday's demo went better than expected", kind: "journal" },
  { line: "long walk after dinner, thought a lot about where this is going", kind: "journal" },
  { line: "a bit lonely in the hostel tonight", kind: "journal" },
  { line: "that rejection email stung", kind: "journal" },
  { line: "felt like an impostor in the mentor meeting", kind: "journal" },
  { line: "best chai of my life at the station", kind: "journal" },

  // Things to remember: about you and yours, and facts about the world.
  { line: "my shoe size is 9 uk", kind: "memory" },
  { line: "spare house key is with the neighbour aunty", kind: "memory" },
  { line: "car insurance is with hdfc ergo, renews in april", kind: "memory" },
  { line: "papa's bp tablet is amlodipine 5", kind: "memory" },
  { line: "my first car was a red alto", kind: "memory" },
  { line: "the first computer bug was an actual moth", kind: "memory" },
  { line: "koalas sleep around twenty hours a day", kind: "memory" },
  { line: "the platypus glows under uv light", kind: "memory" },
  { line: "india has twenty two scheduled languages", kind: "memory" },
  { line: "a jiffy is an actual unit of time", kind: "memory" },
  { line: "the dot over an i is called a tittle", kind: "memory" },
  { line: "cleopatra lived closer to the moon landing than to the pyramids", kind: "memory" },

  // Memories that belong on one of the lived-in machine's pages, without naming it.
  { line: "mustang figured out the whole game before darrow did", kind: "memory", page: "Red Rising" },
  { line: "sevro and the howlers are the best part of the series", kind: "memory", page: "Red Rising" },
  { line: "the institute chapters are brutal", kind: "memory", page: "Red Rising" },
  { line: "palm muting sounds cleaner near the bridge", kind: "memory", page: "Guitar" },
  { line: "e minor pentatonic box one is the easiest to start with", kind: "memory", page: "Guitar" },
  { line: "fingertips stop hurting after a couple of weeks", kind: "memory", page: "Guitar" },
  { line: "incline press hits the upper chest more", kind: "memory", page: "Gym" },
  { line: "creatine takes a few weeks to show results", kind: "memory", page: "Gym" },
  { line: "brace the core before unracking the bar", kind: "memory", page: "Gym" },
  { line: "light roasts want hotter water", kind: "memory", page: "Coffee" },
  { line: "bloom for thirty seconds before the main pour", kind: "memory", page: "Coffee" },
  { line: "the aeropress upside down gives a heavier cup", kind: "memory", page: "Coffee" },

  // Ideas, a few said as a question.
  { line: "a chrome extension that blocks youtube during study hours", kind: "idea" },
  { line: "record every demo and clip the good bits for instagram", kind: "idea" },
  { line: "an alumni mentorship marketplace", kind: "idea" },
  { line: "offline mode for schools with bad internet", kind: "idea" },
  { line: "gamify homework with streaks", kind: "idea" },
  { line: "should we move to annual billing?", kind: "idea" },
  { line: "teachers could mark attendance by voice", kind: "idea" },
  { line: "kya ho agar hum parents se directly charge karein", kind: "idea" },
  { line: "sell anonymised attendance trends to district offices", kind: "idea" },
  { line: "a monthly founder dinner for college startups", kind: "idea" },
  { line: "why not let students rate each lecture", kind: "idea" },

  // Notes: how things are, kept for later.
  { line: "the coworking space is shut on public holidays", kind: "note" },
  { line: "razorpay payouts take three working days", kind: "note" },
  { line: "the principal at st marys prefers calls after lunch", kind: "note" },
  { line: "hostel water is off till evening", kind: "note" },
  { line: "the gst portal crawls after 6pm", kind: "note" },
  { line: "trial accounts expire after 14 days", kind: "note" },
  { line: "the pitch competition allows five minutes and no slides", kind: "note" },
  { line: "the new intern starts on monday", kind: "note" },
  { line: "courier pickup is usually around noon", kind: "note" },

  // Money, going somewhere, contacts, time on a hobby, and what is nobody else's.
  { line: "chai and samosa 60", kind: "command" },
  { line: "paid 2500 for the hackathon entry", kind: "command" },
  { line: "got 5000 from the school for the pilot", kind: "command" },
  { line: "figma 1200 every month", kind: "command" },
  { line: "open the pipeline", kind: "command" },
  { line: "rahul said the board meets next week", kind: "contact" },
  { line: "had coffee with rahul, he is in for the pilot", kind: "contact" },
  { line: "amma called, the wedding is in december", kind: "contact" },
  { line: "practised guitar for half an hour", kind: "hobby" },
  { line: "my upi pin is 4471", kind: "private" },
  { line: "private: sometimes i want to quit all of this", kind: "private" },
];
