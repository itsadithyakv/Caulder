import { describe, expect, it } from "vitest";
import { measuresOf, subjectOf } from "./subjects";

describe("the lines this was built for", () => {
  it("finds the bench press, and the numbers of the lift", () => {
    expect(subjectOf("i hit a pr today, 45kg on the bench press for 3 reps")).toEqual({
      topic: "Bench Press",
      kind: "exercise",
      fact: "PR: 45 kg × 3",
    });
  });

  it("finds lateral raises, with nothing to count", () => {
    expect(subjectOf("tried a new varient of lateral raises, my arms are burning")).toEqual({
      topic: "Lateral Raises",
      kind: "exercise",
      fact: null,
    });
  });

  it("finds the song by what it is called", () => {
    expect(
      subjectOf("i learnt a new song called riptide, the cords are quite difficult to learn, there are three of them and i had fun with it"),
    ).toEqual({ topic: "Riptide", kind: "song", fact: null });
  });
});

describe("an exercise", () => {
  it.each([
    ["did pull-ups today", "Pull Ups"],
    ["10 pullups before breakfast", "Pull Ups"],
    ["incline bench press felt heavy", "Incline Bench Press"],
    ["squatted... well, squats 5x5 at 80kg", "Squats"],
    ["romanian deadlifts are killing my hamstrings", "Romanian Deadlift"],
    ["deadlift day", "Deadlift"],
  ])("'%s' is about %s", (line, topic) => {
    expect(subjectOf(line)).toMatchObject({ topic, kind: "exercise" });
  });

  it.each([
    ["bench press 3x10 at 40 kg", "3 × 10 at 40 kg"],
    ["bench press 60kg", "60 kg"],
    ["deadlift 225 lbs for 5", "225 lb × 5"],
    ["new personal best on squats, 100 kg", "PR: 100 kg"],
    ["hit a pr on deadlift", "PR"],
    ["pull ups 12 reps", "× 12"],
  ])("reads the numbers of '%s'", (line, fact) => {
    expect(subjectOf(line)?.fact).toBe(fact);
  });

  it("does not take a length of time for a count", () => {
    expect(subjectOf("planks for 2 minutes")?.fact).toBeNull();
    expect(subjectOf("bench press for 40 min")?.fact).toBeNull();
  });
});

describe("a thing called something", () => {
  it.each([
    ["reading a book called Project Hail Mary by andy weir", "Project Hail Mary", "book"],
    ["watched a film called heat", "Heat", "film"],
    ["started a game called hollow knight, it is hard", "Hollow Knight", "game"],
    ["learning a song named 'wonderwall' on guitar", "Wonderwall", "song"],
    ["played hotel california on the guitar", "Hotel California", "song"],
  ])("'%s' is about %s", (line, topic, kind) => {
    expect(subjectOf(line)).toMatchObject({ topic, kind });
  });

  it("keeps a capital somebody chose", () => {
    expect(subjectOf("a song called Back in Black by AC/DC")?.topic).toBe("Back in Black");
  });

  it("is not a name when it runs on", () => {
    expect(subjectOf("a book called the one my sister will not stop talking about at dinner")).toBeNull();
  });
});

describe("most lines", () => {
  it.each(["call mom tomorrow", "felt great today", "went to the gym, felt good", "played guitar for an hour", "submit the press release"])(
    "'%s' is about nothing in particular",
    (line) => {
      expect(subjectOf(line)).toBeNull();
    },
  );
});

describe("a run, and the scale", () => {
  it("reads how far and how fast, from the lines this was built for", () => {
    expect(subjectOf("i went for a run today, 5kms. I rant at a 4.30 pace which burnt me out")).toEqual({
      topic: "Running",
      kind: "exercise",
      fact: "5 km · 4:30 /km",
    });
  });

  it.each([
    ["ran 10k this morning", "10 km"],
    ["easy run, 6.5 km at 5:45/km", "6.5 km · 5:45 /km"],
    ["jogged 3 miles", "3 mi"],
    ["went for a run", null],
  ])("reads '%s'", (line, fact) => {
    expect(subjectOf(line)).toMatchObject({ topic: "Running", fact });
  });

  it.each([
    ["I lost 5kg", "−5 kg"],
    ["gained 2kg since january", "+2 kg"],
    ["weighed in at 72.5 kg this morning", "72.5 kg"],
    ["im down 3 kilos", "−3 kg"],
    ["bodyweight 160 lbs", "160 lb"],
  ])("reads '%s' as %s", (line, fact) => {
    expect(subjectOf(line)).toEqual({ topic: "Body Weight", kind: "exercise", fact });
  });

  it("is the lift when the weight is a lift's", () => {
    expect(subjectOf("bench press is up 2 kg")?.topic).toBe("Bench Press");
  });

  it("does not make a run of running the numbers, or being late", () => {
    expect(subjectOf("run the numbers for q3")).toBeNull();
    expect(subjectOf("running late for the 5pm")).toBeNull();
    expect(subjectOf("lost my keys")).toBeNull();
  });
});

describe("the numbers, as numbers", () => {
  it("counts what was done, from the line this was built for", () => {
    expect(measuresOf("I just did 20 push ups today")).toEqual([
      { topic: "Push Ups", metric: "reps", value: 20, unit: "reps", reps: null, best: false },
    ]);
    expect(subjectOf("I just did 20 push ups today")?.fact).toBe("× 20");
  });

  it("measures a lift, a run and the scale", () => {
    expect(measuresOf("i hit a pr today, 45kg on the bench press for 3 reps")).toEqual([
      { topic: "Bench Press", metric: "weight", value: 45, unit: "kg", reps: 3, best: true },
    ]);
    expect(measuresOf("squats 5x5 at 80kg")).toEqual([{ topic: "Squats", metric: "weight", value: 80, unit: "kg", reps: 25, best: false }]);
    expect(measuresOf("went for a run today, 5kms at a 4.30 pace")).toEqual([
      { topic: "Running", metric: "distance", value: 5, unit: "km", reps: null, best: false },
      { topic: "Running", metric: "pace", value: 270, unit: "s/km", reps: null, best: false },
    ]);
    expect(measuresOf("I lost 5kg")).toEqual([{ topic: "Body Weight", metric: "change", value: -5, unit: "kg", reps: null, best: false }]);
    expect(measuresOf("read 30 pages tonight")).toMatchObject([{ topic: "Reading", metric: "pages", value: 30 }]);
  });

  it("measures nothing in most lines", () => {
    expect(measuresOf("tried a new variant of lateral raises, my arms are burning")).toEqual([]);
    expect(measuresOf("call mom tomorrow")).toEqual([]);
    expect(measuresOf("learnt a song called riptide")).toEqual([]);
  });
});

describe("the other hobbies", () => {
  it.each([
    ["cycled 22 km this morning", "Cycling", "22 km"],
    ["went for a ride, 40k", "Cycling", "40 km"],
    ["hiked 8 km up to the fort", "Hiking", "8 km"],
    ["went on a trek", "Hiking", null],
    ["swam 1.5 km", "Swimming", "1.5 km"],
  ])("'%s' is %s", (line, topic, fact) => {
    expect(subjectOf(line)).toMatchObject({ topic, fact });
  });

  it("counts words learnt in a language, and birds seen", () => {
    expect(subjectOf("learnt 15 new words in spanish today")).toEqual({ topic: "Spanish", kind: "course", fact: "15 new words" });
    expect(measuresOf("learnt 15 new words in spanish today")).toEqual([
      { topic: "Spanish", metric: "count", value: 15, unit: "words", reps: null, best: false },
    ]);
    expect(subjectOf("did my japanese lesson on duolingo")).toMatchObject({ topic: "Japanese" });
    expect(subjectOf("spotted a white-throated kingfisher by the lake")).toEqual({
      topic: "Bird Watching",
      kind: "thing",
      fact: "Spotted: white-throated kingfisher",
    });
    expect(measuresOf("spotted a kingfisher")).toMatchObject([{ topic: "Bird Watching", metric: "count", unit: "sightings", value: 1 }]);
  });

  it("measures a ride the way it measures a run", () => {
    expect(measuresOf("cycled 22 km this morning")).toEqual([{ topic: "Cycling", metric: "distance", value: 22, unit: "km", reps: null, best: false }]);
  });

  it("leaves what only sounds like one alone", () => {
    expect(subjectOf("walk the dog")).toBeNull();
    expect(subjectOf("ride with priya to the office")).toBeNull();
    expect(subjectOf("saw the doctor")).toBeNull();
    expect(subjectOf("french fries for lunch")).toBeNull();
  });
});
