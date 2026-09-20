import { describe, expect, it } from "vitest";
import { readCapture, type Known } from "./capture";

/**
 * What is said about the things somebody does - a lift, a song - kept with the
 * thing, where it belongs. Thursday 10 September 2026, ten in the morning.
 */

const at = { today: "2026-09-10", now: 10 * 60 };

const known: Known = {
  contacts: [],
  hobbies: [
    { id: "gym", title: "Gym" },
    { id: "guitar", title: "Guitar" },
  ],
  habits: [{ id: "b-gym", name: "Gym" }],
  tasks: [{ id: "t-gym", title: "Gym" }],
  blocks: [],
  pages: [
    { id: "gym", title: "Gym", section: "hobbies" },
    { id: "guitar", title: "Guitar", section: "hobbies" },
    { id: "piano", title: "Piano", section: "hobbies" },
  ],
};

const read = (line: string, knows: Known = known) => readCapture(line, knows, at);

describe("the lines this was built for", () => {
  it("a PR starts a page for the lift under Gym, numbers first - and is a day at the gym", () => {
    const reading = read("i hit a pr today, 45kg on the bench press for 3 reps");
    expect(reading.kind).toBe("done");
    expect(reading.effects).toEqual([
      { do: "finish", task: { id: "t-gym", title: "Gym" } },
      { do: "tick", habit: { id: "b-gym", name: "Gym" } },
      {
        do: "memory",
        page: null,
        topic: "Bench Press",
        branch: { section: "hobbies", parent: { id: "gym", title: "Gym" } },
        fact: "PR: 45 kg × 3",
      },
      { do: "journal" },
    ]);
  });

  it("a new variant is kept with the exercise, and how it felt in the journal", () => {
    const reading = read("tried a new varient of lateral raises, my arms are burning");
    expect(reading.kind).toBe("done");
    expect(reading.effects).toContainEqual({
      do: "memory",
      page: null,
      topic: "Lateral Raises",
      branch: { section: "hobbies", parent: { id: "gym", title: "Gym" } },
      fact: null,
    });
    expect(reading.effects).toContainEqual({ do: "journal" });
  });

  it("a song learnt starts its page under Guitar, and the fun of it goes in the journal", () => {
    const reading = read(
      "i learnt a new song called riptide, the cords are quite difficult to learn, there are three of them and i had fun with it",
    );
    expect(reading.kind).toBe("done");
    expect(reading.effects).toEqual([
      { do: "memory", page: null, topic: "Riptide", branch: { section: "hobbies", parent: { id: "guitar", title: "Guitar" } }, fact: null },
      { do: "journal" },
    ]);
    // Kept whole, as it was said.
    expect(reading.text).toContain("there are three of them");
  });
});

describe("kept in one place", () => {
  const withPages: Known = {
    ...known,
    pages: [...(known.pages ?? []), { id: "bp", title: "Bench Press", section: "hobbies" }, { id: "lr", title: "Lateral Raises", section: "hobbies" }],
  };

  it("adds to the page there is, rather than starting a second", () => {
    expect(read("bench press 3x8 at 40kg, felt strong", withPages).effects).toContainEqual({
      do: "memory",
      page: { id: "bp", title: "Bench Press" },
      topic: null,
      branch: null,
      fact: "3 × 8 at 40 kg",
    });
  });

  it("knows a page by its name said another way", () => {
    expect(read("did a lateral raise dropset, was brutal", withPages).effects).toContainEqual(
      expect.objectContaining({ do: "memory", page: { id: "lr", title: "Lateral Raises" } }),
    );
  });

  it("files it under the lift, not under the gym the line also names", () => {
    const memory = read("went to the gym, squats 5x5 at 80kg", withPages).effects.find((effect) => effect.do === "memory");
    expect(memory).toMatchObject({ topic: "Squats", fact: "5 × 5 at 80 kg" });
  });

  it("hangs a song off the instrument the line names", () => {
    const memory = read("learnt a song called clocks on the piano, was fun").effects.find((effect) => effect.do === "memory");
    expect(memory).toMatchObject({ topic: "Clocks", branch: { parent: { id: "piano", title: "Piano" } } });
  });

  it("is a memory and nothing more when it is only the numbers", () => {
    expect(read("bench press 60kg")).toMatchObject({ kind: "memory", topic: "Bench Press", fact: "60 kg" });
  });

  it("does not make a day at the gym of a lift still to come", () => {
    expect(read("bench press tomorrow 6am").kind).toBe("task");
    expect(read("i need to learn a song called riptide").kind).toBe("task");
  });

  it("starts the page in Hobbies on its own when there is nothing to hang it off", () => {
    expect(read("hit a pr on deadlift, 100kg", { contacts: [], hobbies: [] }).effects).toContainEqual({
      do: "memory",
      page: null,
      topic: "Deadlift",
      branch: { section: "hobbies", parent: null },
      fact: "PR: 100 kg",
    });
  });
});

describe("a run, the scale, and a thing to make", () => {
  it("keeps a run with the running, numbers first - and the pace is not taken for a time", () => {
    const reading = read("i went for a run today, 5kms. I rant at a 4.30 pace which burnt me out");
    expect(reading.kind).toBe("done");
    expect(reading.effects).toContainEqual(expect.objectContaining({ do: "memory", topic: "Running", fact: "5 km · 4:30 /km" }));
    // Nothing put on the Calendar at half past four: that was how fast, not when.
    expect(reading.effects.some((effect) => effect.do === "block")).toBe(false);
  });

  it("keeps what the scale said under Body Weight", () => {
    expect(read("I lost 5kg this month")).toMatchObject({ topic: "Body Weight", fact: "−5 kg" });
    expect(read("gained 2kg, feeling strong").effects).toContainEqual(expect.objectContaining({ do: "memory", topic: "Body Weight", fact: "+2 kg" }));
  });

  it("catches something to make as an idea, its parts apart - not as an instruction to edit", () => {
    const reading = read("Edit on helicopter by asap rockey, grunge dark edit- here is the link of that for reference https://youtu.be/abc123");
    expect(reading).toMatchObject({
      kind: "idea",
      thought: { title: "Edit on helicopter by asap rockey", detail: "grunge dark edit", links: ["https://youtu.be/abc123"] },
    });
    // And the same words with a day on them are something to do.
    expect(read("edit the helicopter video tomorrow").kind).toBe("task");
  });
});
