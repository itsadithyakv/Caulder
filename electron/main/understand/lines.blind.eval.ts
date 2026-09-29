/**
 * A blind set for the measuring stick (eval.test.ts): lines written without
 * reading the rules, labelled with the answer a person would give, to see how
 * the rules and the model's second opinion do on lines neither was shaped by.
 *
 * Kinds are what the line would be filed as, from the ten readCapture gives.
 * A question put to the app is labelled `command`: it is answered, not filed.
 * `page` is where a memory belongs among the pages of the lived-in machine.
 */

type Measured = { line: string; kind: string; page?: string };

export const BLIND_LINES: readonly Measured[] = [
  // Tasks, with and without a time.
  { line: "ring the CA about advance tax before the 15th", kind: "task" },
  { line: "send the invoice to greenfield school", kind: "task" },
  { line: "standup with the interns 10:30 thursday", kind: "task" },
  { line: "pick up the laptop from the service centre", kind: "task" },
  { line: "prep questions for the investor call on tuesday", kind: "task" },
  { line: "back up the database every friday night", kind: "task" },
  { line: "submit the hackathon registration before oct 5", kind: "task" },
  { line: "kal 11 baje bank jaana hai", kind: "task" },
  { line: "update the pitch deck with september numbers", kind: "task" },
  { line: "get the bike puncture fixed sat evening", kind: "task" },
  { line: "draft the terms of service", kind: "task" },
  { line: "chase razorpay support on the stuck refund", kind: "task" },
  { line: "buy a birthday gift for didi", kind: "task" },
  { line: "physics lab record due wednesday", kind: "task" },
  { line: "change the stripe webhook url on prod", kind: "task" },
  { line: "8pm sync with ananya on hiring", kind: "task" },
  { line: "book a desk at the coworking space for next week", kind: "task" },
  { line: "return the library books", kind: "task" },
  { line: "must sort out the trademark filing before it lapses", kind: "task" },
  { line: "write 500 words of the blog post tonight", kind: "task" },

  // Memories: hobby know-how that belongs on a page, facts about people and places.
  { line: "cassius and darrow's rivalry drives the second book", kind: "memory", page: "Red Rising" },
  { line: "mustang's real name is virginia", kind: "memory", page: "Red Rising" },
  { line: "iron gold picks up ten years after morning star", kind: "memory", page: "Red Rising" },
  { line: "tune down half a step for the hendrix songs", kind: "memory", page: "Guitar" },
  { line: "strings go dull after about three months", kind: "memory", page: "Guitar" },
  { line: "romanian deadlifts should pull on the hamstrings, not the lower back", kind: "memory", page: "Gym" },
  { line: "deload every sixth week", kind: "memory", page: "Gym" },
  { line: "never put the moka pot on a high flame", kind: "memory", page: "Coffee" },
  { line: "filtered water, the tap water makes it taste flat", kind: "memory", page: "Coffee" },
  { line: "a burr grinder matters more than the machine", kind: "memory", page: "Coffee" },
  { line: "neha is vegetarian, no egg either", kind: "memory" },
  { line: "arjun's daughter is called meera", kind: "memory" },
  { line: "sanjay from the incubator did his mba at iim ahmedabad", kind: "memory" },
  { line: "rahul's office is on the fourth floor of tidel park", kind: "memory" },
  { line: "best dosa near campus is murugan idli, not saravana", kind: "memory" },
  { line: "my PAN card scan is in the docs folder on drive", kind: "memory" },
  { line: "we lived in kottayam till i was nine", kind: "memory" },
  { line: "hummingbirds can fly backwards", kind: "memory" },
  { line: "the kerala backwaters are fed by 44 rivers", kind: "memory" },
  { line: "appa and amma's anniversary is 14 june", kind: "memory" },

  // The journal, past days and a little Hinglish.
  { line: "yesterday was rough, couldn't focus at all", kind: "journal" },
  { line: "honestly thrilled, first paying customer!!", kind: "journal" },
  { line: "sunday was lazy and i loved every minute", kind: "journal" },
  { line: "bohot stress ho raha hai exams ko leke", kind: "journal" },
  { line: "dimaag kharab ho gaya aaj, kuch bhi kaam nahi kiya", kind: "journal" },
  { line: "why does every other startup seem to be doing better", kind: "journal" },
  { line: "last weekend at home reminded me why i'm doing this", kind: "journal" },
  { line: "slept ten hours and still exhausted", kind: "journal" },
  { line: "really wish i was back in kochi right now", kind: "journal" },
  { line: "the demo day nerves are real", kind: "journal" },
  { line: "cried a bit after the call with papa", kind: "journal" },
  { line: "felt really seen when ma'am praised the project", kind: "journal" },
  { line: "tuesday was a blur of meetings", kind: "journal" },
  { line: "ekdum fresh lag raha hai after the run", kind: "journal" },
  { line: "not sure i'm cut out for this", kind: "journal" },

  // Ideas, said many ways.
  { line: "what about a whatsapp bot that sends the day's homework", kind: "idea" },
  { line: "maybe a cheaper tier just for tuition teachers", kind: "idea" },
  { line: "thinking we could do a podcast with school principals", kind: "idea" },
  { line: "a browser new tab that counts down the days to exams", kind: "idea" },
  { line: "would be cool if the app could read handwritten notes", kind: "idea" },
  { line: "put qr codes on notebooks through the stationery shops", kind: "idea" },
  { line: "why not open source the timetable generator", kind: "idea" },
  { line: "one click export of report cards to pdf", kind: "idea" },
  { line: "shower thought: a badge for kids who never miss a class", kind: "idea" },
  { line: "we should try cold dming founders on linkedin", kind: "idea" },
  { line: "a marketplace for secondhand textbooks between seniors and juniors", kind: "idea" },
  { line: "concept - teachers record a 2 min recap, parents get it every evening", kind: "idea" },

  // Notes: observations, status, things to know, some with times in them.
  { line: "netbanking is under maintenance till 6pm", kind: "note" },
  { line: "the aws credits run out in november", kind: "note" },
  { line: "signups dipped after we removed google login", kind: "note" },
  { line: "the landing page takes 4 seconds on 3g", kind: "note" },
  { line: "mess does biryani only on fridays", kind: "note" },
  { line: "canteen opens at 7:30 on weekdays", kind: "note" },
  { line: "metro is shut from 11 to 5 on sunday for maintenance", kind: "note" },
  { line: "we have roughly three months of runway left", kind: "note" },
  { line: "the coworking aircon switches off at 2pm every day", kind: "note" },
  { line: "hr says offer letters go out after the 20th", kind: "note" },

  // Spends and commands.
  { line: "auto 80", kind: "command" },
  { line: "notion subscription 800", kind: "command" },
  { line: "swiggy 320 lunch", kind: "command" },
  { line: "take me to settings", kind: "command" },
  { line: "show the calendar", kind: "command" },

  // Contacts: a named contact, and details for someone new.
  { line: "rahul pinged, he's moving to bangalore next month", kind: "contact" },
  { line: "amma thinks i should talk to her friend who runs a school", kind: "contact" },
  { line: "karthik ph 9845012345", kind: "contact" },
  { line: "neha.k@lumen.vc - neha from lumen ventures", kind: "contact" },
  { line: "rahul mehta introduced me to his cto", kind: "contact" },

  // Questions put to the app.
  { line: "what do i have on friday?", kind: "command" },
  { line: "when did i last talk to rahul?", kind: "command" },
  { line: "how much did i spend on food this month", kind: "command" },
];
