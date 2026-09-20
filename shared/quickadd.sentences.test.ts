import { describe, it, expect } from "vitest";
import { parseQuick } from "./quickadd";

/**
 * A line that says more than one thing: the task in its first sentence, the
 * rest kept as its note, and a second task when the rest asks for one. Same
 * fixed clock as quickadd.test.ts - Thursday 10 September 2026, ten in the
 * morning.
 */

const NOW = { today: "2026-09-10", now: 10 * 60 };
const parse = (text: string, answers = {}) => parseQuick(text, NOW, answers);

describe("the two lines this was built for", () => {
  it("reads an exam, and keeps what has to be done for it as the note", () => {
    const { task, questions } = parse(
      "I have an exam on monday on the subject DSA. Coursework has to be downloaded from google class rooms",
    );
    expect(task).toMatchObject({
      title: "Exam on DSA",
      day: "2026-09-14",
      area: "college",
      notes: "Coursework has to be downloaded from google class rooms",
      followUp: null,
    });
    expect(questions).toEqual([]);
  });

  it("reads the study, the note, and the reminder two days before it", () => {
    const { task, questions } = parse(
      "Study for ml exam on 23rd of this month, kiran sir requires permission for the retest so i need to remind him 2 days prior.",
    );
    expect(task).toMatchObject({ title: "Study for ml exam", day: "2026-09-23", area: "college" });
    expect(task.notes).toBe("kiran sir requires permission for the retest so i need to remind him 2 days prior.");
    expect(task.followUp).toMatchObject({ title: "Remind kiran sir", day: "2026-09-21", kind: "todo" });
    expect(task.followUp?.notes).toContain("Study for ml exam");
    expect(questions).toEqual([]);
  });
});

describe("where the task ends and the rest begins", () => {
  it.each([
    // A list is one thing, and keeps its commas.
    ["buy milk, eggs, bread tmrw", "Buy milk, eggs, bread"],
    // A comma before the time is still the when.
    ["call mom tmrw, 5pm", "Call mom"],
    // A full stop that ends a short form, not a sentence.
    ["email prof. sharma tmrw about the extension", "Email prof sharma about the extension"],
    ["submit the form fri. morning", "Submit the form"],
    // Too little after the comma to be a clause of its own.
    ["renew passport friday, urgent", "Renew passport"],
  ])("keeps '%s' as one task", (text, title) => {
    const { task } = parse(text);
    expect(task.title).toBe(title);
    expect(task.notes).toBeNull();
  });

  it("splits at a sentence, and at a comma only when a clause follows it", () => {
    expect(parse("meet at 4.30 pm. bring laptop").task).toMatchObject({ title: "Meet", time: "16:30", notes: "bring laptop" });
    expect(parse("submit report friday, it has to include the q3 numbers").task).toMatchObject({
      title: "Submit report",
      notes: "it has to include the q3 numbers",
    });
  });

  it("takes the when from the rest when the task itself said none", () => {
    expect(parse("Exam on DSA. Its on monday at 10am").task).toMatchObject({
      title: "Exam on DSA",
      day: "2026-09-14",
      time: "10:00",
      notes: "Its on monday at 10am",
    });
  });

  it("takes how much it matters from the rest too", () => {
    expect(parse("submit the form friday. this one is very important").task.priority).toBe("must");
  });

  it("still asks what it does not know", () => {
    const { questions } = parse("Exam on DSA. Coursework has to be downloaded first");
    expect(questions.map((question) => question.id)).toEqual(["day"]);
  });
});

describe("a second task, hung off the first one's day", () => {
  it.each([
    ["submit report friday, remind me a day before", "Reminder: Submit report", "2026-09-10"],
    ["viva on the 25th. need to call prof sharma a week before", "Call prof sharma", "2026-09-18"],
    ["project demo on 30th. Book the hall the day before", "Book the hall", "2026-09-29"],
    ["exam on 24th, anita ma'am wants the form so i must email her 3 days in advance", "Email anita ma'am", "2026-09-21"],
  ])("reads '%s'", (text, title, day) => {
    expect(parse(text).task.followUp).toMatchObject({ title, day });
  });

  it("reads the kind of the second task from its own verb", () => {
    expect(parse("viva on the 25th. need to call prof sharma a week before").task.followUp?.kind).toBe("call");
  });

  it("never puts it before today", () => {
    expect(parse("submit report tomorrow, remind me 3 days before").task.followUp?.day).toBe("2026-09-10");
  });

  it("follows the first task's day once that has been answered", () => {
    const asked = parse("finish the essay. remind me 2 days before");
    expect(asked.task.followUp).toBeNull();
    expect(parse("finish the essay. remind me 2 days before", { day: "2026-09-20" }).task.followUp?.day).toBe("2026-09-18");
  });

  it("leaves the pronoun when nobody was named", () => {
    expect(parse("exam on 24th. need to remind him 2 days before").task.followUp?.title).toBe("Remind him");
  });
});

describe("academics", () => {
  it.each([
    ["there's a quiz on friday for the course DBMS", "Quiz for DBMS", "college"],
    ["i have to submit the lab record by friday", "Submit the lab record", "college"],
    ["retest for maths next wk", "Retest for maths", "college"],
    ["download notes from google classroom tmrw", "Download notes from google classroom", "college"],
    ["collect hall ticket monday", "Collect hall ticket", "college"],
  ])("reads '%s'", (text, title, area) => {
    expect(parse(text).task).toMatchObject({ title, area });
  });
});
