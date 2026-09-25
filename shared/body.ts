/**
 * Ember's body: where she is, how fast, which way up, and how squashed.
 *
 * One body, whatever she is doing - walking the bar, sitting on a card, held
 * by the scruff, flying across the window. Everything she does to move is
 * this function run sixty times a second, so a walk and a throw are the same
 * physics with different inputs, and there is nothing to hand over between
 * "the perch" and "the rest of the screen".
 *
 * **Cartoon physics, not real physics.** Gravity is heavy, bounces keep more
 * of their speed than anything real would, walls can be splatted on, and
 * two things are springs that overshoot on purpose:
 *
 *  - **Her squash.** Every landing flattens her, and a spring brings her
 *    back - too far, then back again - so she wobbles like a jelly without a
 *    single frame of it being drawn by hand.
 *  - **Her tilt.** She leans into her walk, tumbles when thrown, and when she
 *    lands the wrong way up she rocks back upright past vertical and settles,
 *    like a toy that cannot fall over.
 *
 * Pure, so the whole of how she moves is a thing a test can state.
 */

/** Her box, sixty-four square, and where her feet are in it. */
export const SIZE = 64;
const FEET = 60;

const GRAVITY = 2600;
/** Sideways speed lost to the air, per second. */
const AIR_DRAG = 0.35;
/** Walls give back this much of her speed. */
const WALL = 0.55;
/** Hit a wall faster than this and she does not bounce: she splats, and sticks. */
const SPLAT_FROM = 750;
/** And stays stuck this long. The pause is the joke. */
const STUCK_S = 0.55;
/** Land faster than this and she bounces rather than stops, keeping more speed than is fair. */
const BOUNCY_FROM = 520;
const SPRING_BACK = 0.62;
/** Walking: how quickly she gets up to speed and how quickly she stops. Stopping is quicker, and skids. */
const WALK_ACCEL = 900;
const WALK_BRAKE = 1400;

/** The squash spring: stiff and underdamped, so it overshoots twice before it settles. */
const SQUASH_K = 380;
const SQUASH_C = 9;
/** The tilt spring, in degrees: softer, so she rocks. */
const TILT_K = 140;
const TILT_C = 7;

const CHUCK_SPEED = 900;
const TOP_SPEED = 3200;

/** A card's top edge she can stand on. */
export type Ledge = { id: string; left: number; right: number; top: number };

export type Wall = "left" | "right" | "top";

export type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Degrees clockwise, not wrapped: a double somersault is 720. */
  angle: number;
  /** Degrees per second. */
  spin: number;
  /** Squash: 0 is her shape, below it flatter and wider, above it taller and thinner. */
  q: number;
  qv: number;
  /** The ledge she is standing on, or null in the air. */
  on: string | null;
  /** Flat against a wall, and for how much longer. */
  stuck: { wall: Wall; left: number } | null;
};

export type BodyEvent =
  | { kind: "landed"; ledge: Ledge; impact: number }
  | { kind: "bounced"; ledge: Ledge; impact: number }
  | { kind: "bonk"; wall: Wall; impact: number }
  | { kind: "splat"; wall: Wall; impact: number }
  | { kind: "unstuck"; wall: Wall }
  /** Walked to the end of what she is standing on. */
  | { kind: "edge"; side: "left" | "right" }
  /** What she was standing on is not there any more. */
  | { kind: "lost" }
  | { kind: "gone" };

/** What she wants to do with her legs: -1 left, 1 right, 0 stand; and how fast. */
type Intent = { walk: number; speed: number };

export type World = { width: number; height: number; ledges: readonly Ledge[] };

export function standing(x: number, ledge: Ledge): Body {
  return { x, y: ledge.top - FEET, vx: 0, vy: 0, angle: 0, spin: 0, q: 0, qv: 0, on: ledge.id, stuck: null };
}

/** Her width and height as shares of normal, from the squash. Roughly keeps her area, like a cartoon does. */
export function shape(q: number): { sx: number; sy: number } {
  const sy = Math.max(0.3, 1 + q);
  return { sx: Math.min(2, 1 / Math.sqrt(sy) + Math.max(0, -q) * 0.35), sy };
}

/** The nearest upright angle to where she is: she rights herself the short way round. */
function uprightOf(angle: number): number {
  return Math.round(angle / 360) * 360;
}

function springs(body: Body, dt: number, tiltTo: number): Pick<Body, "q" | "qv" | "angle" | "spin"> {
  const qa = -SQUASH_K * body.q - SQUASH_C * body.qv;
  const qv = body.qv + qa * dt;
  const q = Math.max(-0.7, Math.min(0.8, body.q + qv * dt));
  const ta = -TILT_K * (body.angle - tiltTo) - TILT_C * body.spin;
  const spin = body.spin + ta * dt;
  return { q, qv, angle: body.angle + spin * dt, spin };
}

/**
 * One frame. `dt` in seconds, capped so a stalled frame cannot throw her
 * through a card.
 */
export function step(now: Body, seconds: number, world: World, intent: Intent = { walk: 0, speed: 0 }): { body: Body; events: BodyEvent[] } {
  const dt = Math.max(0, Math.min(seconds, 1 / 30));
  const events: BodyEvent[] = [];

  // Flat against a wall: nothing moves but the clock, and her wobble.
  if (now.stuck) {
    const left = now.stuck.left - dt;
    if (left > 0) {
      const sprung = springs({ ...now, angle: 0, spin: 0 }, dt, 0);
      return { body: { ...now, ...sprung, angle: 0, spin: 0, stuck: { ...now.stuck, left } }, events };
    }
    // Peels off like a sticker and drops, turning away from the wall.
    const away = now.stuck.wall === "left" ? 1 : now.stuck.wall === "right" ? -1 : 0;
    events.push({ kind: "unstuck", wall: now.stuck.wall });
    return {
      body: { ...now, stuck: null, vx: away * 150, vy: now.stuck.wall === "top" ? 250 : 60, spin: away * 260, qv: now.qv + 4 },
      events,
    };
  }

  // Standing on something: walk, lean into it, keep her feet on it.
  if (now.on) {
    const ledge = world.ledges.find((one) => one.id === now.on);
    if (!ledge) {
      events.push({ kind: "lost" });
      return { body: { ...now, on: null, vy: 0 }, events };
    }
    const want = Math.max(-1, Math.min(1, intent.walk)) * intent.speed;
    const pull = Math.abs(want) > Math.abs(now.vx) && Math.sign(want) !== -Math.sign(now.vx) ? WALK_ACCEL : WALK_BRAKE;
    const change = Math.max(-pull * dt, Math.min(pull * dt, want - now.vx));
    let vx = now.vx + change;
    let x = now.x + vx * dt;
    const lo = ledge.left - SIZE / 2;
    const hi = ledge.right - SIZE / 2;
    if (x < lo) {
      x = lo;
      vx = 0;
      events.push({ kind: "edge", side: "left" });
    } else if (x > hi) {
      x = hi;
      vx = 0;
      events.push({ kind: "edge", side: "right" });
    }
    // Lean into the way she is going; lean back when braking hard.
    const lean = Math.max(-14, Math.min(14, vx * 0.05 - change / dt / 400));
    const sprung = springs(now, dt, uprightOf(now.angle) + lean);
    return { body: { ...now, ...sprung, x, vx, y: ledge.top - FEET, vy: 0 }, events };
  }

  // In the air.
  let vy = now.vy + GRAVITY * dt;
  let vx = now.vx * (1 - AIR_DRAG * dt);
  let x = now.x + vx * dt;
  let y = now.y + vy * dt;
  let spin = now.spin * (1 - 0.25 * dt);
  let qv = now.qv;

  if (x < 0 || x > world.width - SIZE) {
    const wall: Wall = x < 0 ? "left" : "right";
    const impact = Math.abs(vx);
    x = wall === "left" ? 0 : world.width - SIZE;
    if (impact >= SPLAT_FROM) {
      events.push({ kind: "splat", wall, impact });
      return {
        body: { ...now, x, y, vx: 0, vy: 0, spin: 0, angle: 0, q: 0, qv: 0, stuck: { wall, left: STUCK_S } },
        events,
      };
    }
    events.push({ kind: "bonk", wall, impact });
    vx = -vx * WALL;
    spin = -spin * 0.6 + (wall === "left" ? 120 : -120);
    qv -= impact / 220;
  }
  if (y < 0) {
    const impact = Math.abs(vy);
    y = 0;
    if (impact >= SPLAT_FROM) {
      events.push({ kind: "splat", wall: "top", impact });
      return {
        body: { ...now, x, y, vx: 0, vy: 0, spin: 0, angle: 180, q: 0, qv: 0, stuck: { wall: "top", left: STUCK_S } },
        events,
      };
    }
    events.push({ kind: "bonk", wall: "top", impact });
    vy = impact * WALL;
    qv -= impact / 220;
  }

  if (vy > 0) {
    const before = now.y + FEET;
    const after = y + FEET;
    const middle = x + SIZE / 2;
    const under = world.ledges
      .filter((ledge) => middle >= ledge.left && middle <= ledge.right && ledge.top >= before && ledge.top <= after)
      .sort((a, b) => a.top - b.top)[0];
    if (under) {
      const impact = vy;
      // Whatever way up she came down, she rights herself from here - the
      // short way round, rocking past it.
      const angle = uprightOf(now.angle) + ((((now.angle - uprightOf(now.angle)) % 360) + 540) % 360) - 180;
      const flattened = now.qv - Math.min(12, impact / 150);
      if (impact >= BOUNCY_FROM) {
        events.push({ kind: "bounced", ledge: under, impact });
        return {
          body: { ...now, x, y: under.top - FEET, vx: vx * 0.8, vy: -impact * SPRING_BACK, spin: spin * 0.7 + vx * 0.4, qv: flattened, angle },
          events,
        };
      }
      events.push({ kind: "landed", ledge: under, impact });
      return { body: { ...now, x, y: under.top - FEET, vx: vx * 0.3, vy: 0, spin: spin * 0.3, angle, qv: flattened, on: under.id }, events };
    }
  }

  if (y > world.height + SIZE) events.push({ kind: "gone" });

  // The squash spring runs in the air too, so a wobble started on a bounce
  // carries on through the next arc.
  const qa = -SQUASH_K * now.q - SQUASH_C * qv;
  qv += qa * dt;
  const q = Math.max(-0.7, Math.min(0.8, now.q + qv * dt));
  return { body: { ...now, x, y, vx, vy, angle: now.angle + spin * dt, spin, q, qv }, events };
}

/**
 * A jump that lands on a spot: the launch speed for a lob from where she is
 * to `to`, peaking `over` pixels above the higher of the two. How she goes
 * home from a card - with a leap, not a teleport.
 */
export function leap(from: { x: number; y: number }, to: { x: number; y: number }, over = 120): { vx: number; vy: number } {
  const peak = Math.min(from.y, to.y) - over;
  const up = Math.sqrt(2 * GRAVITY * Math.max(1, from.y - peak));
  const down = Math.sqrt(2 * GRAVITY * Math.max(1, to.y - peak));
  const time = up / GRAVITY + down / GRAVITY;
  // Sideways speed bleeds off to air drag on the way, so she is launched
  // faster than distance over time, by exactly what the drag will take.
  const keeps = (1 - Math.exp(-AIR_DRAG * time)) / AIR_DRAG;
  return { vx: (to.x - from.x) / keeps, vy: -up };
}

/** The speed a pointer had when it let go; a hand that stopped first is a drop. */
export function releaseSpeed(samples: readonly { t: number; x: number; y: number }[], now?: number): { vx: number; vy: number } {
  const last = samples[samples.length - 1];
  if (!last) return { vx: 0, vy: 0 };
  if (now !== undefined && now - last.t > 60) return { vx: 0, vy: 0 };
  const recent = samples.filter((one) => last.t - one.t <= 80);
  const first = recent[0];
  if (!first || last.t - first.t < 8) return { vx: 0, vy: 0 };
  const dt = (last.t - first.t) / 1000;
  const cap = (n: number) => Math.max(-TOP_SPEED, Math.min(TOP_SPEED, n));
  return { vx: cap((last.x - first.x) / dt), vy: cap((last.y - first.y) / dt) };
}

export function isChuck(vx: number, vy: number): boolean {
  return Math.hypot(vx, vy) >= CHUCK_SPEED;
}

/** Nothing under her at all: the moment the wings come out. */
export function nothingBelow(body: Body, ledges: readonly Ledge[]): boolean {
  const middle = body.x + SIZE / 2;
  const feet = body.y + FEET;
  return !ledges.some((ledge) => middle >= ledge.left && middle <= ledge.right && ledge.top >= feet);
}
