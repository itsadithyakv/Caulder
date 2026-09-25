import { z } from "zod";

/**
 * What the quick line is told about the workspace beyond names, so a line can
 * mean something already there: move it, cancel it, ask about it, or be
 * finished off in the words used for it before.
 *
 * Read once when the line comes to the front and again after each line kept
 * (services/lines.ts), never on a keystroke. Everything below is pure and
 * reads from it.
 */

/** A task still to do, with the hour it has on the Calendar when it has one. */
export type OpenTask = {
  id: string;
  title: string;
  dueOn: string;
  time: string | null;
  minutes: number | null;
  leadId: string | null;
  leadName: string | null;
};

/** An hour already taken on the Calendar, from today on. */
export type Busy = { day: string; startsAt: string; minutes: number; title: string; taskId: string | null };

/** Something typed before, and how often: what Tab offers to finish a line with. */
export type Said = { title: string; count: number; last: string };

/** An hour kept before, for what it was: what "your usual" is read from. */
export type Timed = { title: string; startsAt: string; minutes: number; day: string };

export type LineContext = { open: OpenTask[]; busy: Busy[]; said: Said[]; timed: Timed[] };

export const NO_CONTEXT: LineContext = { open: [], busy: [], said: [], timed: [] };

/**
 * The last thing the line made, so the next line can mean it: "actually 6pm",
 * "send him the deck", "also eggs". Only ever the one before, and only for as
 * long as the window is open.
 */
export type LastLine = {
  taskId: string | null;
  title: string;
  day: string | null;
  time: string | null;
  contact: { id: string; name: string } | null;
};

/** A task as it was before the line cancelled it, so Undo puts back the same thing. */
export const taskSnapshot = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["call", "email", "follow_up", "meeting", "todo"]),
  area: z.string().max(40).nullable(),
  priority: z.enum(["must", "should", "spare"]).nullable(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leadId: z.string().nullable(),
  notes: z.string().max(4000).nullable(),
  block: z
    .object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startsAt: z.string().regex(/^\d{2}:\d{2}$/), minutes: z.number().int().positive() })
    .nullable(),
  reminder: z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/).nullable() }).nullable(),
});
export type TaskSnapshot = z.infer<typeof taskSnapshot>;

export const moveInput = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  minutes: z.number().int().positive().max(24 * 60).nullable(),
});
export type MoveInput = z.infer<typeof moveInput>;

/** A question the line can answer from what is already kept (shared/questions.ts reads them). */
export const question = z.discriminatedUnion("ask", [
  z.object({ ask: z.literal("day"), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string().max(40) }),
  z.object({
    ask: z.literal("free"),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    label: z.string().max(40),
  }),
  z.object({ ask: z.literal("contact"), name: z.string().trim().min(1).max(80), want: z.enum(["phone", "email", "any"]) }),
  z.object({ ask: z.literal("when"), about: z.string().trim().min(1).max(80) }),
  z.object({
    ask: z.literal("spent"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    label: z.string().max(40),
    on: z.string().trim().max(80).nullable(),
  }),
  z.object({ ask: z.literal("find"), topic: z.string().trim().min(1).max(80) }),
  /** "Where did i park", "what's my blood group", "what does arjun like": answered from your memories. */
  z.object({ ask: z.literal("recall"), about: z.string().trim().min(1).max(120), label: z.string().max(80) }),
  z.object({ ask: z.literal("due"), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  /**
   * "Did i go to gym this week", "have i meditated today": answered from the
   * habits ticked, the hours on the calendar, the time on a hobby and the
   * tasks done - never by ticking anything.
   */
  z.object({
    ask: z.literal("did"),
    about: z.string().trim().min(1).max(80),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    label: z.string().max(40),
  }),
]);
export type Question = z.infer<typeof question>;

/** What the line says back: one sentence, and what it was read from. */
export type Answer = {
  say: string;
  items: { label: string; detail: string | null }[];
};
