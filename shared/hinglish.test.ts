import { describe, expect, it } from "vitest";
import { hinglish, isHinglish, pastOf } from "./hinglish";
import { readCapture } from "./capture";
import { parseQuick } from "./quickadd";

/** Wednesday 23 September 2026, two in the afternoon. */
const CLOCK = { today: "2026-09-23", now: 14 * 60 };
const KNOWN = {
  contacts: [{ id: "c1", name: "Rahul Verma", person: null }],
  hobbies: [{ id: "h1", title: "Guitar" }],
  habits: [{ id: "b1", name: "Drink water" }, { id: "b2", name: "Meditate" }],
  tasks: [{ id: "t1", title: "Gym" }],
};
const read = (line: string) => readCapture(line, KNOWN, CLOCK);
const task = (line: string) => parseQuick(line, CLOCK).task;

describe("Hinglish, said in English", () => {
  it.each([
    // What to do: the verb goes first, and when goes last.
    ["kal subah gym jaana hai", "need to go to gym tomorrow morning"],
    ["doodh lana hai", "need to get milk"],
    ["sabzi leni hai", "need to get vegetables"],
    ["kapde dhone hai", "need to wash clothes"],
    ["ghar saaf karna hai", "need to clean the house"],
    ["mujhe kal assignment submit karna hai", "need to submit assignment tomorrow"],
    ["kaam khatam karna hai aaj", "need to finish work today"],
    ["presentation ki taiyari karni hai", "need to prepare presentation"],
    ["yoga karna hai", "need to do yoga"],
    ["mera phone charge karna hai", "need to charge my phone"],
    ["baal katwane jaana hai", "need to get a haircut"],
    ["kal pakka gym jaunga", "need to go to gym tomorrow"],
    // Who it is done to, with, for and about.
    ["mummy ko call karna hai", "need to call mummy"],
    ["rahul se milna hai kal", "need to meet rahul tomorrow"],
    ["report bhejni hai client ko", "need to send report to client"],
    ["kal chai pe milte hai rahul", "need to meet rahul for tea tomorrow"],
    ["kal mom ke saath shopping jaana hai", "need to go shopping with mom tomorrow"],
    ["didi ke liye gift lena hai", "need to get gift for didi"],
    ["rahul se baat karni hai project ke baare mein", "need to talk to rahul about project"],
    ["papa ko station chhodna hai kal subah", "need to drop off papa at station tomorrow morning"],
    ["netflix ka bill bharna hai", "need to pay netflix bill"],
    ["mummy ka birthday hai 15 ko", "mummy's birthday on the 15th"],
    // When, the Hindi way.
    ["jaldi uthna hai kal 6 baje", "need to wake up early tomorrow at 6"],
    ["sade 5 baje rahul se milna hai", "need to meet rahul at 5:30"],
    ["paune 9 baje class hai", "class at 8:45"],
    ["har somvar gym jaana hai", "need to go to gym every monday"],
    ["roz subah meditate karna hai", "need to meditate every morning"],
    ["bijli ka bill bharna hai 5 tarikh tak", "need to pay electricity bill by the 5th"],
    ["movie dekhni hai weekend pe", "need to watch movie this weekend"],
    ["yaad dila dena shaam ko doodh lana hai", "remind me to get milk this evening"],
    ["bhool mat jaana rent dena hai", "remind me to pay rent"],
    // Done, and not done.
    ["paani piya", "drank water"],
    ["aaj meditate kiya", "meditated today"],
    ["kal gym gaya tha", "went to gym yesterday"],
    ["aaj 3 ghante padhai ki", "studied for 3 hours today"],
    ["1 ghanta guitar practice kiya", "practiced guitar for 1 hour"],
    ["assignment ho gaya", "finished assignment"],
    ["mummy se baat ho gayi", "talked to mummy"],
    ["rahul ko call kar liya", "called rahul"],
    ["2 din mein project submit karna hai", "need to submit project in 2 days"],
    ["abhi rahul ko call karo", "need to call rahul now"],
    ["aaj office nahi gaya", "I didn't go to office today"],
    ["aaj kuch nahi kiya", "did nothing today"],
    // How it felt.
    ["aaj bahut thak gaya hu", "I'm feeling very tired today"],
    ["bahut khush hu aaj", "I'm feeling very happy today"],
    ["mood off hai aaj", "I'm feeling low today"],
    // Money lent and owed, in the words the money rules read.
    ["rahul ko 2000 udhaar diye", "lent rahul 2000"],
    ["rahul se 500 udhaar liye", "i owe rahul 500"],
    ["rahul se 500 lene hai", "get 500 back from rahul"],
    ["rahul ko 500 dene hai", "pay rahul 500"],
  ])("%s", (line, meant) => {
    expect(hinglish(line)).toBe(meant);
  });

  it("leaves English alone, names and all", () => {
    for (const line of [
      "meet Kal Penn tomorrow",
      "call abhi at 5",
      "trip to gaya next week",
      "lunch with Ho at 1",
      "buy a banana",
      "dena's party saturday",
      "book a table at ghar restaurant",
      "submit the main report",
      "pay the ko fee",
    ]) {
      expect(isHinglish(line), line).toBe(false);
      expect(hinglish(line)).toBe(line);
    }
  });

  it("says a verb done the English way", () => {
    expect(pastOf("go to")).toBe("went to");
    expect(pastOf("submit")).toBe("submitted");
    expect(pastOf("meditate")).toBe("meditated");
    expect(pastOf("study")).toBe("studied");
    expect(pastOf("wake up")).toBe("woke up");
  });
});

describe("Hinglish, read all the way through", () => {
  it("makes the task an English line would, with its day and hour", () => {
    expect(task("kal rahul ko call karna hai 5 baje")).toMatchObject({ title: "Call rahul", day: "2026-09-24", time: "17:00" });
    expect(task("jaldi uthna hai kal 6 baje")).toMatchObject({ title: "Wake up early", day: "2026-09-24", time: "06:00" });
    expect(task("parso dentist jaana hai")).toMatchObject({ title: "Go to dentist", day: "2026-09-25" });
    expect(task("bijli ka bill bharna hai 5 tarikh tak")).toMatchObject({ title: "Pay electricity bill", day: "2026-10-05" });
    expect(task("mujhe kal assignment submit karna hai")).toMatchObject({ title: "Submit assignment", area: "college" });
  });

  it("ticks a habit and finishes a task when it says it was done", () => {
    expect(read("paani piya").effects).toContainEqual({ do: "tick", habit: { id: "b1", name: "Drink water" } });
    expect(read("aaj gym gaya").effects).toContainEqual(expect.objectContaining({ do: "finish", task: { id: "t1", title: "Gym" } }));
  });

  it("keeps a feeling, and a day of not doing it, in the journal", () => {
    expect(read("aaj bahut thak gaya hu").kind).toBe("journal");
    expect(read("mood off hai aaj").kind).toBe("journal");
    const skipped = read("aaj gym nahi gaya");
    expect(skipped.kind).toBe("journal");
    expect(skipped.effects).toEqual([]);
  });
});
