import { describe, expect, it } from "vitest";
import { isChuck, leap, nothingBelow, releaseSpeed, shape, standing, step, type Body, type BodyEvent, type Ledge, type World } from "./body";

const CARD: Ledge = { id: "card", left: 200, right: 600, top: 400 };
const WORLD: World = { width: 1000, height: 800, ledges: [CARD] };

function air(x: number, y: number, more: Partial<Body> = {}): Body {
  return { x, y, vx: 0, vy: 0, angle: 0, spin: 0, q: 0, qv: 0, on: null, stuck: null, ...more };
}

/** Runs frames until one of `kinds` happens, collecting everything on the way. */
function run(body: Body, world: World, frames: number, until: BodyEvent["kind"][] = [], intent = { walk: 0, speed: 0 }) {
  let now = body;
  const seen: BodyEvent[] = [];
  for (let n = 0; n < frames; n += 1) {
    const next = step(now, 1 / 60, world, intent);
    now = next.body;
    seen.push(...next.events);
    if (next.events.some((event) => until.includes(event.kind))) break;
  }
  return { body: now, seen };
}

describe("standing and walking", () => {
  it("stands with her feet on the card's top edge", () => {
    const body = standing(300, CARD);
    expect(body.y + 60).toBe(400);
    expect(step(body, 1 / 60, WORLD).body.y).toBe(body.y);
  });

  it("gets up to walking speed rather than starting at it, and leans into it", () => {
    const first = step(standing(300, CARD), 1 / 60, WORLD, { walk: 1, speed: 100 }).body;
    expect(first.vx).toBeGreaterThan(0);
    expect(first.vx).toBeLessThan(100);
    const walking = run(standing(300, CARD), WORLD, 60, [], { walk: 1, speed: 100 }).body;
    expect(walking.vx).toBeCloseTo(100, 0);
    expect(walking.angle).toBeGreaterThan(2);
  });

  it("stops at the end of the card rather than walking off it", () => {
    const result = run(standing(520, CARD), WORLD, 120, ["edge"], { walk: 1, speed: 200 });
    expect(result.seen.some((event) => event.kind === "edge")).toBe(true);
    expect(result.body.x + 32).toBeLessThanOrEqual(600);
    expect(result.body.on).toBe("card");
  });

  it("falls when what she is standing on goes", () => {
    const next = step(standing(300, CARD), 1 / 60, { ...WORLD, ledges: [] });
    expect(next.events).toEqual([{ kind: "lost" }]);
    expect(next.body.on).toBeNull();
  });

  it("rides a card that moves under her", () => {
    const moved = step(standing(300, CARD), 1 / 60, { ...WORLD, ledges: [{ ...CARD, top: 430 }] }).body;
    expect(moved.y + 60).toBe(430);
  });
});

describe("landing", () => {
  it("bounces off a card hit hard, keeping more speed than is fair, then settles on it", () => {
    const result = run(air(300, 0), WORLD, 600, ["landed"]);
    const bounces = result.seen.filter((event) => event.kind === "bounced");
    expect(bounces.length).toBeGreaterThanOrEqual(2);
    expect(result.body.on).toBe("card");
    expect(result.body.y + 60).toBe(400);
  });

  it("is flattened by the landing, and wobbles back past her shape before settling", () => {
    const hit = run(air(300, 330, { vy: 400 }), WORLD, 10, ["landed"]).body;
    expect(hit.qv).toBeLessThan(0);
    const squashes = run(hit, WORLD, 90).seen;
    expect(squashes).toEqual([]);
    let min = 0;
    let max = 0;
    let now = hit;
    for (let n = 0; n < 90; n += 1) {
      now = step(now, 1 / 60, WORLD).body;
      min = Math.min(min, now.q);
      max = Math.max(max, now.q);
    }
    expect(min).toBeLessThan(-0.1);
    expect(max).toBeGreaterThan(0.02);
    expect(Math.abs(now.q)).toBeLessThan(0.02);
  });

  it("rights herself the short way round after landing upside down, rocking past it", () => {
    const upside = run(air(300, 330, { vy: 400, angle: 200, spin: 0 }), WORLD, 10, ["landed"]).body;
    let now = upside;
    let crossed = false;
    for (let n = 0; n < 240; n += 1) {
      now = step(now, 1 / 60, WORLD).body;
      if (now.angle > 360) crossed = true;
    }
    expect(crossed).toBe(true);
    expect(Math.abs(now.angle - 360)).toBeLessThan(1);
  });

  it("keeps her shape in proportion: flatter is wider", () => {
    expect(shape(-0.5).sx).toBeGreaterThan(1.3);
    expect(shape(0.4).sx).toBeLessThan(1);
    expect(shape(0)).toEqual({ sx: 1, sy: 1 });
  });
});

describe("walls", () => {
  it("splats flat on a wall hit hard, sticks, then peels off", () => {
    const hit = step(air(930, 100, { vx: 2000 }), 1 / 60, WORLD);
    expect(hit.events[0]).toMatchObject({ kind: "splat", wall: "right" });
    expect(hit.body.stuck?.wall).toBe("right");
    const stuck = run(hit.body, WORLD, 20).body;
    expect(stuck.x).toBe(hit.body.x);
    const peeled = run(hit.body, WORLD, 60, ["unstuck"]);
    expect(peeled.body.stuck).toBeNull();
    expect(peeled.body.vx).toBeLessThan(0);
  });

  it("bounces off a wall hit gently, and the hit turns her", () => {
    const hit = step(air(930, 100, { vx: 500 }), 1 / 60, WORLD);
    expect(hit.events[0]).toMatchObject({ kind: "bonk", wall: "right" });
    expect(hit.body.vx).toBeLessThan(0);
    expect(hit.body.spin).not.toBe(0);
  });

  it("splats upside down on the ceiling", () => {
    const hit = step(air(300, 5, { vy: -2000 }), 1 / 60, WORLD);
    expect(hit.events[0]).toMatchObject({ kind: "splat", wall: "top" });
    expect(hit.body.angle).toBe(180);
  });
});

describe("the air", () => {
  it("falls out of the window when there is nothing under her", () => {
    expect(nothingBelow(air(800, 100), [CARD])).toBe(true);
    expect(nothingBelow(air(300, 100), [CARD])).toBe(false);
    const result = run(air(800, 100), WORLD, 200, ["gone"]);
    expect(result.seen.at(-1)).toEqual({ kind: "gone" });
  });

  it("keeps tumbling through the air when thrown spinning", () => {
    const later = run(air(100, 100, { vx: 400, vy: -600, spin: 720 }), WORLD, 20).body;
    expect(later.angle).toBeGreaterThan(180);
  });

  it("leaps to a spot and lands on it", () => {
    const from = standing(250, CARD);
    const target = { id: "home", left: 600, right: 900, top: 300 };
    const world = { ...WORLD, ledges: [CARD, target] };
    const { vx, vy } = leap(from, { x: 700, y: target.top - 60 });
    const result = run({ ...from, on: null, vx, vy }, world, 300, ["landed", "bounced"]);
    const touched = result.seen.find((event) => event.kind === "landed" || event.kind === "bounced");
    expect(touched && "ledge" in touched ? touched.ledge.id : null).toBe("home");
    expect(Math.abs(result.body.x - 700)).toBeLessThan(12);
  });
});

describe("letting go of her", () => {
  it("reads a flick from its last moment, and a hand that stopped as a drop", () => {
    const moving = [
      { t: 0, x: 0, y: 0 },
      { t: 40, x: 40, y: -20 },
    ];
    expect(Math.round(releaseSpeed(moving, 40).vx)).toBe(1000);
    expect(releaseSpeed(moving, 300)).toEqual({ vx: 0, vy: 0 });
    expect(isChuck(1000, 0)).toBe(true);
    expect(isChuck(200, 100)).toBe(false);
  });
});
