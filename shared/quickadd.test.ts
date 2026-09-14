import { describe, it, expect } from "vitest";
import { blockKindFor, parseQuick } from "./quickadd";

/**
 * One line into a task. Every expectation is worked out by hand against a
 * fixed clock: Thursday 10 September 2026, ten in the morning.
 */

const NOW = { today: "2026-09-10", now: 10 * 60 };
const parse = (text: string, answers = {}) => parseQuick(text, NOW, answers);
const ids = (text: string, answers = {}) => parse(text, answers).questions.map((q) => q.id);

describe("the phrasings it was asked for", () => {
  it("reads 'Task at 4pm, today, Datascience Assignment'", () => {
    const { task, questions } = parse("Task at 4pm, today, Datascience Assignment");
    expect(task).toMatchObject({
      title: "Datascience Assignment",
      day: "2026-09-10",
      time: "16:00",
      area: "college",
      kind: "todo",
    });
    expect(questions).toEqual([]);
  });

  it("reads the same thing in another order", () => {
    expect(parse("datascience assignment today 4pm").task).toMatchObject({
      title: "Datascience assignment",
      day: "2026-09-10",
      time: "16:00",
    });
  });

  it("takes a time with no day as today while it is still ahead", () => {
    const { task, questions } = parse("4pm datascience assignment");
    expect(task.day).toBe("2026-09-10");
    expect(questions).toEqual([]);
  });
});

describe("what it asks, and only then", () => {
  it("asks when a task has no day and no time", () => {
    const { task, questions } = parse("Datascience assignment");
    expect(task.day).toBeNull();
    expect(questions[0]?.id).toBe("day");
  });

  it("offers today, tomorrow, Friday and next week as answers", () => {
    const question = parse("Datascience assignment").questions[0];
    expect(question?.id === "day" && question.options.map((o) => o.day)).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-17",
    ]);
  });

  it("asks morning or evening for 'at 9', rather than guessing", () => {
    // A nine o'clock lecture and a nine o'clock evening are equally likely.
    const { task, questions } = parse("Datascience assignment at 9");
    expect(task.time).toBeNull();
    expect(questions.map((q) => q.id)).toEqual(["meridiem"]);
  });

  it("does not ask for 'at 4', because nobody plans four in the morning", () => {
    expect(parse("Assignment at 4").task.time).toBe("16:00");
    expect(ids("Assignment at 4")).toEqual([]);
  });

  it("settles once the question is answered", () => {
    const { task, questions } = parse("Datascience assignment at 9", { time: "21:00" });
    expect(task).toMatchObject({ time: "21:00", day: "2026-09-10" });
    expect(questions).toEqual([]);
  });

  it("asks when a time has already gone today", () => {
    const { questions } = parse("call Oakridge 8am");
    expect(questions.map((q) => q.id)).toEqual(["past"]);
    const answered = parse("call Oakridge 8am", { day: "2026-09-11" });
    expect(answered.task).toMatchObject({ day: "2026-09-11", time: "08:00" });
    expect(answered.questions).toEqual([]);
  });

  it("asks what time for a length with no time", () => {
    const { task, questions } = parse("study for 2h tomorrow");
    expect(task).toMatchObject({ minutes: 120, day: "2026-09-11", area: "college" });
    expect(questions.map((q) => q.id)).toEqual(["time"]);
  });

  it("accepts 'no time' as an answer to that", () => {
    const { task, questions } = parse("study for 2h tomorrow", { time: null });
    expect(task.time).toBeNull();
    expect(questions).toEqual([]);
  });

  it("asks what the task is when only the when was typed", () => {
    expect(ids("tomorrow 4pm")).toEqual(["title"]);
  });
});

describe("days", () => {
  it.each([
    ["report tomorrow", "2026-09-11"],
    ["report tmrw", "2026-09-11"],
    ["report day after tomorrow", "2026-09-12"],
    ["report tonight", "2026-09-10"],
    ["report next week", "2026-09-17"],
    ["report in 3 days", "2026-09-13"],
    ["report in two weeks", "2026-09-24"],
    ["report friday", "2026-09-11"],
    ["report thursday", "2026-09-10"],
    ["report next monday", "2026-09-14"],
    ["report on the 15th", "2026-09-15"],
    ["report on the 5th", "2026-10-05"],
    ["report 15 sep", "2026-09-15"],
    ["report sep 15", "2026-09-15"],
    ["report 15/9", "2026-09-15"],
    ["report 3/2", "2027-02-03"],
    ["report 2026-12-01", "2026-12-01"],
  ])("'%s' is %s", (text, day) => {
    expect(parse(text).task.day).toBe(day);
  });

  it("refuses a day that does not exist rather than rolling it over", () => {
    expect(parse("report 31/9").task.day).toBeNull();
  });

  it("does not read the name Tom as tomorrow", () => {
    const { task } = parse("Call Tom friday");
    expect(task.title).toBe("Call Tom");
    expect(task.day).toBe("2026-09-11");
  });
});

describe("times and lengths", () => {
  it.each([
    ["report 4pm", "16:00"],
    ["report 4 pm", "16:00"],
    ["report 4:30pm", "16:30"],
    ["report 16:00", "16:00"],
    ["report at 16", "16:00"],
    ["report 11:30am", "11:30"],
    ["report noon", "12:00"],
  ])("'%s' is %s", (text, time) => {
    expect(parse(text).task.time).toBe(time);
  });

  it("reads a range as a start and a length", () => {
    expect(parse("revision 4-5pm").task).toMatchObject({ time: "16:00", minutes: 60 });
    expect(parse("gym 6-7am friday").task).toMatchObject({
      title: "Gym",
      time: "06:00",
      minutes: 60,
      day: "2026-09-11",
      area: "health",
    });
  });

  it("puts '11-1pm' at eleven in the morning, not eleven at night", () => {
    expect(parse("lab 11-1pm").task).toMatchObject({ time: "11:00", minutes: 120 });
  });

  it.each([
    ["for 45 min", 45],
    ["for an hour", 60],
    ["for half an hour", 30],
    ["for 1.5h", 90],
    ["90m", 90],
  ])("'%s' is %i minutes", (length, minutes) => {
    expect(parse(`study ${length} at 3pm`).task.minutes).toBe(minutes);
  });
});

describe("the title", () => {
  it("keeps the words inside it and drops the filler round the edges", () => {
    expect(parse("hand in the form tomorrow").task.title).toBe("Hand in the form");
    expect(parse("submit the form by the 15th").task.title).toBe("Submit the form");
  });

  it("drops a leading 'remind me to'", () => {
    expect(parse("remind me to pay rent on the 5th").task.title).toBe("Pay rent");
  });

  it("keeps the verb, which is also where the kind comes from", () => {
    const { task } = parse("meeting with Asha next monday 11am for 45 min");
    expect(task).toMatchObject({
      title: "Meeting with Asha",
      kind: "meeting",
      day: "2026-09-14",
      time: "11:00",
      minutes: 45,
    });
  });
});

describe("kind, area and priority", () => {
  it("reads an email to a professor as college, and urgent as has-to-happen", () => {
    expect(parse("email professor tomorrow urgent").task).toMatchObject({
      title: "Email professor",
      kind: "email",
      area: "college",
      priority: "must",
    });
  });

  it("lets a tag decide the area outright", () => {
    expect(parse("draft linkedin post #company maybe friday").task).toMatchObject({
      title: "Draft linkedin post",
      area: "company",
      priority: "spare",
    });
  });

  it("reads a school word in company work as company", () => {
    // The company sells to schools: a demo for Class 10 is not homework.
    expect(parse("demo for class 10 friday 3pm").task.area).toBe("company");
  });

  it("leaves the area to the caller when nothing points anywhere", () => {
    expect(parse("sort out the thing tomorrow").task.area).toBeNull();
  });

  it("does not read 'run the numbers' as exercise", () => {
    expect(parse("run the numbers tomorrow").task.area).toBeNull();
  });
});

describe("the block a timed task sets aside", () => {
  it.each([
    [{ kind: "call", area: "company" }, "meeting"],
    [{ kind: "todo", area: "college" }, "study"],
    [{ kind: "todo", area: "company" }, "focus"],
    [{ kind: "todo", area: "health" }, "personal"],
    [{ kind: "todo", area: null }, "personal"],
  ] as const)("%j is a %s block", (task, kind) => {
    expect(blockKindFor(task)).toBe(kind);
  });
});

/* ---- Typed the way people actually type ---------------------------------
 * Every row below was a line the parser got wrong before this pass - read
 * nothing, read the wrong thing, or left the when sitting in the title.
 * ------------------------------------------------------------------------ */

describe("days, however they are spelt", () => {
  it.each([
    ["report tommorrow", "2026-09-11"],
    ["report 2moro", "2026-09-11"],
    ["report tmw", "2026-09-11"],
    ["report TOMORROW", "2026-09-11"],
    ["report tonite", "2026-09-10"],
    ["report day after tmrw", "2026-09-12"],
    ["report this evening", "2026-09-10"],
    ["report later today", "2026-09-10"],
    ["report eod", "2026-09-10"],
    ["report by end of day", "2026-09-10"],
    ["report eow", "2026-09-11"],
    ["report end of the week", "2026-09-11"],
    ["report this weekend", "2026-09-12"],
    ["report next weekend", "2026-09-19"],
    ["report end of month", "2026-09-30"],
    ["report next month", "2026-10-10"],
    ["report in a fortnight", "2026-09-24"],
    ["report coming friday", "2026-09-11"],
    ["report friday next week", "2026-09-18"],
    ["report tue next week", "2026-09-15"],
    ["report oct. 1", "2026-10-01"],
    ["report sep 15, 2026", "2026-09-15"],
    ["report 15.09.2026", "2026-09-15"],
    ["report 15-09-2026", "2026-09-15"],
    ["report 5th oct", "2026-10-05"],
  ])("'%s' is %s", (text, day) => {
    const { task } = parse(text);
    expect(task.day).toBe(day);
    expect(task.title).toBe("Report");
  });

  it("reads 'before friday' as the day before, and never before today", () => {
    expect(parse("report before friday").task.day).toBe("2026-09-10");
    expect(parse("report before next monday").task.day).toBe("2026-09-13");
  });

  it("does not read a date with a year as a time", () => {
    // 15.09 on its own is 3:09 in the afternoon; with a year it is a date.
    expect(parse("report 15.09.2026").task.time).toBeNull();
  });

  it("leaves a 1st or 2nd that is not a date in the title", () => {
    expect(parse("1st year orientation friday").task).toMatchObject({
      title: "1st year orientation",
      day: "2026-09-11",
    });
    expect(parse("2nd round interview monday").task.title).toBe("2nd round interview");
  });
});

describe("slips of the keyboard", () => {
  it.each([
    ["report wensday", "2026-09-16", "Wednesday"],
    ["report firday", "2026-09-11", "Friday"],
    ["report teusday", "2026-09-15", "Tuesday"],
    ["report thrusday", "2026-09-10", "Thursday"],
  ])("reads '%s' as %s, and says so", (text, day, name) => {
    const { task, notes } = parse(text);
    expect(task.day).toBe(day);
    expect(task.title).toBe("Report");
    expect(notes.join(" ")).toContain(name);
  });

  it("reads a misspelt month beside a date", () => {
    const { task, notes } = parse("report 15 septmber");
    expect(task.day).toBe("2026-09-15");
    expect(notes[0]).toContain("September");
  });

  it("does not correct a capitalised name into a day", () => {
    // "Mondal" is one letter from Monday; typed with a capital it is a person.
    const { task } = parse("call Mondal");
    expect(task.title).toBe("Call Mondal");
    expect(task.day).toBeNull();
  });

  it("does not correct anything once a real day has been said", () => {
    expect(parse("call mondal tomorrow").task.title).toBe("Call mondal");
  });

  it("leaves a real word that happens to be near a day alone", () => {
    expect(parse("sundae with rhea saturday").task.title).toBe("Sundae with rhea");
    expect(parse("meet Frida friday").task.title).toBe("Meet Frida");
  });
});

describe("times, however they are said", () => {
  it.each([
    ["call mom @4", "16:00"],
    ["call mom @ 4pm", "16:00"],
    ["call mom 4 p.m.", "16:00"],
    ["call mom at 1630", "16:30"],
    ["call mom 1500 hrs", "15:00"],
    ["call mom 4 o'clock", "16:00"],
    ["call mom half past 4", "16:30"],
    ["call mom quarter past 4", "16:15"],
    ["call mom quarter to 5", "16:45"],
    ["call mom by 5", "17:00"],
    ["call mom friday 5", "17:00"],
    ["call mom at 9 in the evening", "21:00"],
    ["call mom 9 at night", "21:00"],
    ["call mom tonight at 9", "21:00"],
    ["call mom this evening at 7", "19:00"],
    ["dinner with dad at 8", "20:00"],
    ["breakfast with dad at 8", "08:00"],
    ["submit by 11:59pm tonight", "23:59"],
  ])("'%s' is %s", (text, time) => {
    expect(parse(text).task.time).toBe(time);
  });

  it("uses the morning the line mentions, even in the name of the thing", () => {
    // "Morning run" stays the title, and still makes "at 6" six in the morning.
    expect(parse("morning run tomorrow at 6").task).toMatchObject({ title: "Morning run", time: "06:00" });
  });

  it("takes the part of the day out of the title when it was the when", () => {
    expect(parse("call mom at 9 in the evening").task.title).toBe("Call mom");
    expect(parse("submit report tomorrow morning").task.title).toBe("Submit report");
  });

  it("counts 'in two hours' from now, rounded up to five minutes", () => {
    expect(parse("submit report in 2 hours").task).toMatchObject({ day: "2026-09-10", time: "12:00", minutes: null });
    expect(parseQuick("stretch in 30 mins", { today: "2026-09-10", now: 10 * 60 + 3 }).task.time).toBe("10:35");
  });

  it("carries 'in an hour' past midnight into tomorrow", () => {
    expect(parseQuick("sleep in an hour", { today: "2026-09-10", now: 23 * 60 + 30 }).task).toMatchObject({
      day: "2026-09-11",
      time: "00:30",
    });
  });

  it("asks morning or evening for a bare number after a day", () => {
    expect(ids("call mom tomorrow 7")).toEqual(["meridiem"]);
  });
});

describe("ranges and lengths", () => {
  it.each([
    ["study between 4 and 6", "16:00", 120],
    ["study from 4 till 6", "16:00", 120],
    ["study 14:00-16:00", "14:00", 120],
    ["study 10:30-12:00", "10:30", 90],
    ["study 14.30-15.30", "14:30", 60],
    ["study 10am-12", "10:00", 120],
    ["study tomorrow 12-2", "12:00", 120],
    ["work tomorrow 9 to 5", "09:00", 480],
    ["study 1h30 at 3pm", "15:00", 90],
    ["study 1h 30m at 3pm", "15:00", 90],
    ["study 1 hour 30 minutes at 3pm", "15:00", 90],
    ["study half hour at 3pm", "15:00", 30],
    ["study two hours at 3pm", "15:00", 120],
    ["study 1 and a half hours at 3pm", "15:00", 90],
    ["study a couple of hours at 3pm", "15:00", 120],
  ])("'%s' is %s for %i minutes", (text, time, minutes) => {
    expect(parse(text).task).toMatchObject({ time, minutes });
  });

  it("asks for a range that could be the morning or the evening", () => {
    const { task, questions } = parse("class 9-10:30 tomorrow");
    expect(questions.map((q) => q.id)).toEqual(["meridiem"]);
    expect(task.minutes).toBe(90);
    // Answering keeps the length.
    expect(parse("class 9-10:30 tomorrow", { time: "09:00" }).task).toMatchObject({ time: "09:00", minutes: 90 });
    // Dots for the colon ask the same, rather than reading a date inside it.
    expect(parse("study 10.30-11.30 friday").task).toMatchObject({ day: "2026-09-11", minutes: 60, time: null });
    expect(ids("study 10.30-11.30 friday")).toEqual(["meridiem"]);
  });
});

describe("how much it matters", () => {
  it.each([
    ["pay rent not urgent friday", "spare"],
    ["pay rent no rush friday", "spare"],
    ["pay rent low prio friday", "spare"],
    ["pay rent optional friday", "spare"],
    ["pay rent high prio friday", "must"],
    ["pay rent urgently friday", "must"],
    ["pay rent critical friday", "must"],
    ["pay rent top priority friday", "must"],
    ["pay rent friday!!", "must"],
    ["urgent: submit report friday", "must"],
  ])("'%s' is %s", (text, priority) => {
    expect(parse(text).task.priority).toBe(priority);
  });

  it("never reads 'not urgent' as urgent", () => {
    // The trap: "urgent" is inside it.
    expect(parse("pay rent not urgent friday").task).toMatchObject({ title: "Pay rent", priority: "spare" });
  });

  it("takes one exclamation mark as punctuation, not as urgency", () => {
    expect(parse("pay rent friday!").task).toMatchObject({ title: "Pay rent", priority: null });
  });

  it("puts 'asap' on today when nothing else says when", () => {
    expect(parse("asap call client").task).toMatchObject({ day: "2026-09-10", priority: "must" });
  });
});

describe("what kind of thing it is", () => {
  it.each([
    ["calling dad sunday", "call"],
    ["phone dad sunday", "call"],
    ["emailing prof friday", "email"],
    ["zoom with rhea friday 3pm", "meeting"],
    ["coffee with asha friday 3pm", "meeting"],
    ["1:1 with asha friday 3pm", "meeting"],
    ["interview friday 3pm", "meeting"],
    ["cofounder sync monday 10am", "meeting"],
    ["f/u oakridge monday", "follow_up"],
    ["chase oakridge monday", "follow_up"],
    ["check in with oakridge monday", "follow_up"],
    ["pay the phone bill friday", "todo"],
    ["buy a ring friday", "todo"],
  ])("'%s' is %s", (text, kind) => {
    expect(parse(text).task.kind).toBe(kind);
  });
});

describe("which part of life it is", () => {
  it.each([
    ["hw due friday", "college"],
    ["prepare for midsem monday", "college"],
    ["viva friday", "college"],
    ["pset 3 friday", "college"],
    ["badminton friday 7pm", "health"],
    ["blood test friday 9am", "health"],
    ["standup 10am tomorrow", "company"],
    ["fundraising call friday 3pm", "company"],
    ["buy groceries saturday", "personal"],
    ["mom's birthday oct 3", "personal"],
  ])("'%s' is %s", (text, area) => {
    expect(parse(text).task.area).toBe(area);
  });

  it("reads the area only from words that were not the when", () => {
    // "Semester" is a college word, but here it says how long the gym runs.
    expect(parseQuick("gym every mon 6am for the semester", { ...NOW, termEnd: "2026-12-04" }).task.area).toBe("health");
  });

  it("lets a pick on the reading overrule the words", () => {
    expect(parse("hw due friday", { area: "company" }).task.area).toBe("company");
  });
});

describe("the words around the task", () => {
  it.each([
    ["don't forget to submit report tomorrow"],
    ["dont forget to submit report tomorrow"],
    ["i need to submit report tomorrow"],
    ["gotta submit report tomorrow"],
    ["pls submit report tmrw"],
    ["submit report tomorrow please"],
    ["submit report (tomorrow 5pm)"],
    ['"submit report" tomorrow'],
    ["hey can you add a task to submit report tomorrow"],
    ["Submit report - tomorrow - urgent!!"],
  ])("'%s' is just 'Submit report'", (text) => {
    expect(parse(text).task.title).toBe("Submit report");
  });

  it("takes the shouting out of a line typed in capitals", () => {
    expect(parse("PAY RENT TMRW 5PM").task).toMatchObject({ title: "Pay rent", day: "2026-09-11", time: "17:00" });
  });

  it("keeps a capital a person chose", () => {
    expect(parse("Pay Rent Tomorrow").task.title).toBe("Pay Rent");
  });

  it("keeps 'note' when it is the verb", () => {
    expect(parse("note the date of the exam friday").task.title).toBe("Note the date of the exam");
  });
});

describe("numbers that are neither times nor dates", () => {
  it.each([
    ["talk about 4 things tomorrow", "Talk about 4 things"],
    ["reduce by 5 percent tomorrow", "Reduce by 5 percent"],
    ["read pages 10-20 tomorrow", "Read pages 10-20"],
    ["tomorrow 10-20 pages", "10-20 pages"],
    ["exercise 4.2 tomorrow", "Exercise 4.2"],
    ["pay 1500 rent tomorrow", "Pay 1500 rent"],
    ["call 9480004094 tomorrow", "Call 9480004094"],
  ])("'%s' keeps its number in '%s'", (text, title) => {
    const { task } = parse(text);
    expect(task.title).toBe(title);
    expect(task.time).toBeNull();
  });
});

describe("repeats", () => {
  const TERM = { ...NOW, termEnd: "2026-12-04" };
  const repeat = (text: string, answers = {}) => parseQuick(text, TERM, answers);

  it.each([
    ["gym every monday 6am", [1]],
    ["gym mon wed fri 6am", [1, 3, 5]],
    ["gym mon-fri 6am", [1, 2, 3, 4, 5]],
    ["gym every weekday at 7am", [1, 2, 3, 4, 5]],
    ["gym weekdays 6am", [1, 2, 3, 4, 5]],
    ["study weekends 10am", [6, 7]],
    ["gym daily 6am", [1, 2, 3, 4, 5, 6, 7]],
    ["yoga mondays and thursdays 7am", [1, 4]],
    ["lecture every tue and thu 9am", [2, 4]],
  ])("'%s' comes back on %j", (text, weekdays) => {
    const { task } = repeat(text);
    expect(task.repeat?.weekdays).toEqual(weekdays);
    expect(task.title).not.toMatch(/every|daily|weekday|mon|wed|fri/i);
  });

  it("starts on the first day it lands on that is still ahead", () => {
    // Thursday 10:00: a 6am Monday repeat starts next Monday; a 6am daily one
    // starts tomorrow, because this morning's has gone.
    expect(repeat("gym every monday 6am").task.day).toBe("2026-09-14");
    expect(repeat("gym daily 6am").task.day).toBe("2026-09-11");
    expect(repeat("meds daily 9pm").task.day).toBe("2026-09-10");
  });

  it("asks until when, offering the end of term first", () => {
    const question = repeat("gym every monday 6am").questions[0];
    expect(question?.id).toBe("until");
    expect(question?.id === "until" && question.options.map((o) => o.label)).toEqual([
      "End of term",
      "4 weeks",
      "12 weeks",
      "End of the year",
    ]);
  });

  it.each([
    ["gym weekdays 6am until dec 20", "2026-12-20"],
    ["gym every mon 6am until 20/12", "2026-12-20"],
    ["lecture every tue and thu 9am until end of term", "2026-12-04"],
    ["gym every mon 6am for the semester", "2026-12-04"],
    ["standup every weekday 10am for 4 weeks", "2026-10-08"],
    ["gym every mon 6am for 2 months", "2026-11-13"],
  ])("'%s' runs until %s", (text, until) => {
    const { task, questions } = repeat(text);
    expect(task.repeat?.until).toBe(until);
    expect(questions).toEqual([]);
  });

  it("asks for a time, or offers just the next one as a task", () => {
    const { questions } = repeat("yoga on mondays");
    expect(questions[0]?.id).toBe("time");
    expect(questions[0]?.id === "time" && questions[0].options.at(-1)).toEqual({
      label: "Only the next one, as a task",
      time: null,
    });

    const next = repeat("yoga on mondays", { time: null });
    expect(next.task).toMatchObject({ repeat: null, day: "2026-09-14", time: null });
    expect(next.questions).toEqual([]);
  });

  it("offers evening times for 'every sunday evening'", () => {
    const question = repeat("call mom every sunday evening").questions[0];
    expect(question?.id === "time" && question.options.map((o) => o.label)).toEqual([
      "6 PM", "7 PM", "9 PM", "Only the next one, as a task",
    ]);
  });

  it("says plainly what it cannot repeat, and adds the next one instead", () => {
    const monthly = parse("pay rent every month on the 1st");
    expect(monthly.task).toMatchObject({ title: "Pay rent", day: "2026-10-01", repeat: null });
    expect(monthly.notes[0]).toMatch(/days of the week/);

    const other = parse("team sync every other friday 4pm");
    expect(other.task).toMatchObject({ title: "Team sync", day: "2026-09-11", repeat: null });
    expect(other.notes[0]).toMatch(/Every other week/);
  });

  it("refuses a last day before the first, and asks again", () => {
    const { task, questions, notes } = repeat("gym every monday 6am until friday");
    expect(task.repeat?.until).toBeNull();
    expect(questions[0]?.id).toBe("until");
    expect(notes[0]).toMatch(/before the first/);
  });
});

describe("your own words", () => {
  const words = [
    { word: "Datascience", area: "college" },
    { word: "CS301", area: "college" },
    { word: "machine learning", area: "college" },
    { word: "Oakridge", area: "company" },
    { word: "lab", area: "health" },
    { word: "machine learning lab", area: "company" },
    { word: "c++", area: "college" },
  ];
  const mine = (text: string) => parseQuick(text, { ...NOW, words }).task;

  it("puts a course name in College without a college word beside it", () => {
    // The gap this exists for: "assignment" found College, "reading" does not.
    expect(mine("Datascience reading tomorrow").area).toBe("college");
  });

  it("keeps the word in the title - it decides the area, nothing else", () => {
    expect(mine("Datascience reading tomorrow").title).toBe("Datascience reading");
  });

  it("ignores case, and matches a phrase across the space in it", () => {
    expect(mine("revise MACHINE   LEARNING friday").area).toBe("college");
  });

  it("matches a course code as itself", () => {
    expect(mine("cs301 problem set friday").area).toBe("college");
  });

  it("does not match inside another word", () => {
    // "lab" is a health word here only to prove it; "collaborate" must not
    // wake it.
    expect(mine("collaborate with Rhea friday").area).toBeNull();
  });

  it("finds a word that ends in a symbol", () => {
    expect(mine("c++ practice friday").area).toBe("college");
  });

  it("beats the built-in list", () => {
    // "demo" is a built-in company word; the person has said Oakridge is the
    // company too, and nothing here disagrees. But a word of theirs that
    // points elsewhere must win over the general list.
    const taught = [{ word: "demo", area: "college" }];
    expect(parseQuick("demo friday", { ...NOW, words: taught }).task.area).toBe("college");
  });

  it("lets the longer phrase win when two of yours match", () => {
    expect(mine("machine learning lab report friday").area).toBe("company");
  });

  it("still loses to a tag, which is the most direct thing a person can say", () => {
    expect(mine("Datascience reading #health friday").area).toBe("health");
  });

  it("is harmless when there are none", () => {
    expect(parseQuick("Datascience reading friday", { ...NOW, words: [] }).task.area).toBeNull();
  });
});
