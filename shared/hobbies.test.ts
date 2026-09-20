import { describe, expect, it } from "vitest";
import { buildBoard, kindOfHobby, type LogRow } from "./hobbies";

const row = (day: string, topic: string, metric: string, value: number, unit: string, reps: number | null = null, best = false): LogRow => ({
  day, topic, metric, value, unit, reps, best,
});

const LOGS: LogRow[] = [
  row("2026-02-01", "Bench Press", "weight", 40, "kg", 5),
  row("2026-03-10", "Bench Press", "weight", 45, "kg", 3, true),
  row("2026-03-02", "Push Ups", "reps", 20, "reps"),
  row("2026-03-20", "Push Ups", "reps", 35, "reps"),
  row("2026-01-02", "Body Weight", "bodyweight", 74, "kg"),
  row("2026-08-02", "Body Weight", "bodyweight", 70.5, "kg"),
  row("2026-03-11", "Running", "distance", 5, "km"),
  row("2026-03-11", "Running", "pace", 270, "s/km"),
  row("2026-06-01", "Running", "distance", 10, "km"),
  row("2026-04-01", "Spanish", "count", 15, "words"),
  row("2026-05-01", "Hiking", "distance", 8, "km"),
  row("2026-05-01", "Bird Watching", "count", 1, "sightings"),
  row("2026-05-09", "Reading", "pages", 30, "pages"),
];
const none = new Map<string, number>();
const board = (title: string, pages: { id: string; title: string }[] = [], minutes = none) =>
  buildBoard({ id: "h", title }, LOGS, minutes, pages, "2026-09-01", title === "Reading" ? { reading: 1, toRead: 5, read: 2 } : undefined);
const tile = (title: string, label: string) => board(title).tiles.find((each) => each.label === label)?.value;

describe("what kind of hobby it is", () => {
  it.each([
    ["Gym", "gym"], ["Running", "running"], ["Cycling", "cycling"], ["Guitar", "music"], ["Keyboard", "music"],
    ["Drawing", "drawing"], ["Reading", "reading"], ["Spanish", "language"], ["Bird watching", "outdoors"],
    ["Hiking and trekking", "outdoors"], ["Chess", "generic"],
  ])("%s is %s", (title, kind) => {
    expect(kindOfHobby(title)).toBe(kind);
  });
});

describe("a page for each", () => {
  it("a gym shows its lifts by their best, what was counted, and the scale - and nothing of the running", () => {
    const gym = board("Gym");
    expect(gym.tracks.map((track) => track.topic)).toEqual(["Bench Press", "Push Ups", "Body weight"]);
    expect(gym.tracks[0]?.says).toBe("best 45 kg × 3, up from 40");
    expect(gym.tracks[1]?.says).toBe("55 in all, the most in one go 35");
    expect(gym.tracks[2]?.says).toBe("down 3.5 kg since the first weigh-in");
    expect(tile("Gym", "Body weight")).toBe("70.5 kg");
    expect(tile("Gym", "Bests called")).toBe("1");
  });

  it("running shows how far and how fast, with pace drawn the right way up", () => {
    expect(tile("Running", "Distance")).toBe("15 km");
    expect(tile("Running", "Longest")).toBe("10 km");
    expect(tile("Running", "Fastest")).toBe("4:30 /km");
    expect(board("Running").tracks.find((track) => track.topic === "Running: pace")?.lowerIsBetter).toBe(true);
  });

  it("a language, the outdoors and reading each show their own", () => {
    expect(tile("Spanish", "Words learnt")).toBe("15");
    expect(tile("Hiking and bird watching", "Birds spotted")).toBe("1");
    expect(tile("Hiking and bird watching", "Hiking")).toBe("8 km");
    expect(tile("Reading", "To be read")).toBe("5");
    expect(tile("Reading", "Pages")).toBe("30");
  });

  it("a guitar counts the pages that hang off it, which are its songs", () => {
    const guitar = board("Guitar", [{ id: "p1", title: "Riptide" }, { id: "p2", title: "Wonderwall" }]);
    expect(guitar.tiles).toContainEqual({ label: "Songs and pieces", value: "2" });
    expect(guitar.pages.map((page) => page.title)).toEqual(["Riptide", "Wonderwall"]);
  });

  it("shows the hours it got, this month apart from the year", () => {
    const minutes = new Map([["2026-03-01", 60], ["2026-09-05", 90]]);
    const chess = board("Chess", [], minutes);
    expect(chess.tiles).toEqual([{ label: "This month", value: "1.5 h" }, { label: "This year", value: "2.5 h" }, { label: "Days", value: "2" }]);
  });

  it("is empty, with what to say to the line, for a hobby nothing has been said about", () => {
    const chess = board("Chess");
    expect(chess.tiles).toEqual([]);
    expect(chess.tracks).toEqual([]);
    expect(chess.hint).toContain("kept on its page");
  });
});
