import { describe, expect, it } from "vitest";
import { deskFacts, deskGlance, deskHours, deskTasks, WIDGET_LEVELS, widgetLevel, widgetSpot, widgetWanted } from "./widget";

describe("which level to restore", () => {
  it("is in front when nobody has chosen", () => {
    expect(widgetLevel(null)).toBe("front");
  });

  it("restores the one that was chosen", () => {
    expect(widgetLevel("desktop")).toBe("desktop");
    expect(widgetLevel(" normal ")).toBe("normal");
  });

  // The settings row is a line in a SQLite file anybody can open. A level
  // nobody recognises should cost the widget its place, not its existence.
  it("falls back rather than refusing to appear", () => {
    expect(widgetLevel("wallpaper")).toBe("front");
    expect(widgetLevel("")).toBe("front");
  });
});

describe("whether it comes back at all", () => {
  it("stays away until it has been asked for", () => {
    expect(widgetWanted(null)).toBe(false);
  });

  it("comes back once it has been", () => {
    expect(widgetWanted("1")).toBe(true);
  });

  it("stays away once it has been sent away", () => {
    expect(widgetWanted("0")).toBe(false);
  });
});

describe("the spot it was left in", () => {
  it("is nothing at all before it has ever been moved", () => {
    expect(widgetSpot(null)).toBeNull();
  });

  it("reads a pair of numbers", () => {
    expect(widgetSpot('{"x":300,"y":120}')).toEqual({ x: 300, y: 120 });
  });

  it("rounds, because a window cannot sit on half a pixel", () => {
    expect(widgetSpot('{"x":1.6,"y":2.4}')).toEqual({ x: 2, y: 2 });
  });

  // Every one of these is a row somebody could have edited by hand, or a
  // shape an older version wrote. None of them is a reason to throw on launch.
  it("refuses anything that is not a pair of numbers", () => {
    expect(widgetSpot("not json at all")).toBeNull();
    expect(widgetSpot("{}")).toBeNull();
    expect(widgetSpot("null")).toBeNull();
    expect(widgetSpot('{"x":"300","y":120}')).toBeNull();
    expect(widgetSpot('{"x":null,"y":120}')).toBeNull();
  });
});

describe("what each level says about itself", () => {
  // The admission the whole card is built around. A level that takes the
  // widget out of reach has to say so before it is picked, not after.
  it("admits that the desktop level cannot be clicked", () => {
    const desktop = WIDGET_LEVELS.find((level) => level.id === "desktop");
    expect(desktop?.detail.toLowerCase()).toContain("cannot be clicked");
  });

  // A few words each, not a paragraph: the card is read at a glance.
  it("gives every level a name and a few words", () => {
    for (const level of WIDGET_LEVELS) {
      expect(level.title.length).toBeGreaterThan(0);
      expect(level.detail.length).toBeGreaterThan(0);
      expect(level.detail.length).toBeLessThanOrEqual(50);
    }
  });

  // Front first: it is the one somebody reading the card should land on, and
  // the one an unrecognised setting falls back to.
  it("offers the level everything works at first", () => {
    expect(WIDGET_LEVELS[0]?.id).toBe("front");
  });
});

describe("what the widget says", () => {
  const block = (title: string, startsAt: string, minutes = 60) => ({ id: title, title, startsAt, minutes, kind: "focus", priority: null });
  type Day = Parameters<typeof deskGlance>[0];
  const day = (over: Record<string, unknown> = {}): Day =>
    ({ blocks: [], overdue: [], dueToday: [], replies: [], unpaid: [], reach: { today: 0, week: 0, next: [], waiting: 0 }, ...over }) as unknown as Day;
  const AT_TEN = 10 * 60;

  it("says nothing is on when nothing is", () => {
    expect(deskGlance(day(), AT_TEN)).toEqual({ say: "nothing" });
    expect(deskFacts(day())).toEqual([]);
  });

  it("puts a block about to start before everything, because it cannot wait", () => {
    const busy = day({
      blocks: [block("Call with Kettle", "10:08", 30)],
      replies: [{ leadName: "Priya Nair" }],
      overdue: [{ title: "Send the proposal" }],
    });
    expect(deskGlance(busy, AT_TEN)).toEqual({ say: "soon", title: "Call with Kettle", minutes: 8 });
    // Further off than ten minutes, the reply is the news.
    expect(deskGlance(busy, AT_TEN - 30)).toEqual({ say: "replied", name: "Priya Nair", others: 0 });
  });

  it("then a reply, then what is late, then what is on, next and due", () => {
    const replies = [{ leadName: "Priya Nair" }, { leadName: "Jonas Berg" }];
    const overdue = [{ title: "Send the proposal" }, { title: "Chase the invoice" }];
    const on = [block("Build the onboarding", "09:30", 90)];
    const next = [block("Proposal for Harbour", "15:00")];
    expect(deskGlance(day({ replies, overdue, blocks: on }), AT_TEN)).toEqual({ say: "replied", name: "Priya Nair", others: 1 });
    expect(deskGlance(day({ overdue, blocks: on }), AT_TEN)).toEqual({ say: "late", title: "Send the proposal", others: 1 });
    const due = [{ title: "Invoice Harbour" }, { title: "Book the venue" }];
    expect(deskGlance(day({ blocks: on, dueToday: due }), AT_TEN)).toEqual({ say: "now", title: "Build the onboarding", others: 0 });
    expect(deskGlance(day({ blocks: next, dueToday: due }), AT_TEN)).toEqual({ say: "next", title: "Proposal for Harbour", minutes: 300 });
    expect(deskGlance(day({ dueToday: due }), AT_TEN)).toEqual({ say: "due", title: "Invoice Harbour", others: 1 });
  });

  it("names the tasks to tick off, late first, four at most", () => {
    const overdue = ["a", "b"];
    const dueToday = ["c", "d", "e"];
    expect(deskTasks({ overdue, dueToday })).toEqual({
      tasks: [
        { task: "a", late: true },
        { task: "b", late: true },
        { task: "c", late: false },
        { task: "d", late: false },
      ],
      more: 1,
    });
    expect(deskTasks({ overdue: [], dueToday: [] })).toEqual({ tasks: [], more: 0 });
  });

  it("lists the rest of the company's day, most pressing first, and only what is so", () => {
    const facts = deskFacts(
      day({
        replies: [{ leadName: "Priya Nair" }, { leadName: "Jonas Berg" }],
        overdue: [{ title: "Send the proposal" }],
        unpaid: [1, 2],
        dueToday: [1],
        reach: { today: 3, week: 5, next: [], waiting: 4 },
      }),
    );
    // Late and due are listed by name above, so not here.
    expect(facts).toEqual([
      { about: "replied", name: "Priya Nair", others: 1 },
      { about: "unpaid", count: 2, urgent: true },
      { about: "waiting", count: 4 },
      { about: "reached", count: 3 },
    ]);
    // One of each at most, so a list can key on what it is about.
    expect(new Set(facts.map((each) => each.about)).size).toBe(facts.length);
    expect(deskFacts(day({ reach: { today: 0, week: 5, next: [], waiting: 0 } }))).toEqual([]);
  });

  it("lists what is left of the day, not the morning that is over", () => {
    const blocks = [block("Standup", "09:00", 15), block("Build", "09:30", 90), block("Lunch", "13:00"), block("Review", "16:00")];
    expect(deskHours(blocks, AT_TEN).map((each) => each.title)).toEqual(["Build", "Lunch", "Review"]);
    expect(deskHours(blocks, 18 * 60)).toEqual([]);
    const many = Array.from({ length: 8 }, (_, n) => block(`Block ${n}`, `${String(11 + n).padStart(2, "0")}:00`, 30));
    expect(deskHours(many, AT_TEN)).toHaveLength(4);
  });
});

