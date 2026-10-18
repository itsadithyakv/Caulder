import { z } from "zod";

/**
 * The week (PLAN.md, part eight, phase 35): at the head of the Calendar's
 * week, what happened in it, what slipped, and three things for the week
 * after - read from what is kept, never filled in for it.
 *
 * Everything here is counted by the company's own day, over the week shown:
 * Monday to Sunday, and up to today when the week is this one.
 */

/** One of the week's three things: said, and done or not. */
export type WeekThing = { id: string; text: string; position: number; done: boolean };

export type WeekReview = {
  /** The Monday and the Sunday of the week shown. */
  from: string;
  to: string;
  /** The last day counted: today for this week, the Sunday for one gone by, nothing for one to come. */
  upTo: string | null;
  /** Tasks ticked off in it, the most recent first. */
  done: { count: number; titles: string[] };
  /** People reached (wrote, rang, met), and of them, who answered. */
  reached: { people: number; answered: number; names: string[] };
  /** Deals moved between stages, and those that closed won or lost. */
  deals: { moved: number; won: number; wonValue: number; lost: number };
  /** Invoiced - sent, by the day it is dated - and paid, by the day the money came. */
  money: { invoiced: number; paid: number; currency: string };
  /** Minutes set aside on the Calendar, and those not marked as skipped. */
  hours: { planned: number; kept: number };
  /** What is behind as of today - only for this week, since it is today's to say. */
  slipped: { overdue: number; quiet: number; unpaid: number; unpaidAmount: number } | null;
  /** The three for this week, and the three chosen for the next. */
  three: { thisWeek: WeekThing[]; nextWeek: WeekThing[] };
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "That is not a day.");

/** The three for a week, as typed: up to three, an empty one cleared. */
export const weekThingsInput = z.object({
  weekStart: day,
  texts: z.array(z.string().trim().max(200, "Keep each to under 200 characters.")).max(3, "Three, at most."),
});
export type WeekThingsInput = z.infer<typeof weekThingsInput>;
