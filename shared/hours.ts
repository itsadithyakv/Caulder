/** Time billed by the hour (PLAN.md, part thirteen, phase 57). Kept by electron/main/repositories/hours.ts. */

export type HoursToBill = {
  /** The blocks not yet on an invoice, oldest first. */
  blocks: { id: string; day: string; startsAt: string; minutes: number; title: string }[];
  minutes: number;
  /** What an hour is billed at for them; null when nobody has said. */
  rate: number | null;
  /** What it comes to before tax; null without a rate. */
  amount: number | null;
};
