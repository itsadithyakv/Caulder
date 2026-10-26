import { isDay, shiftDay } from "./dates";

type Day = string;

/**
 * Caulder is free, and kept going by those who want to (PLAN.md, part six).
 *
 * Like WinRAR: everything works, always, and now and then Caulder says who
 * made it and how to help. Never a window that blocks, never a feature held
 * back. The ways to help are ones that pay out in India - GitHub Sponsors
 * (no cut, cards from anywhere) and UPI; Stripe and Buy Me a Coffee do not.
 *
 * A way left empty here is not shown anywhere.
 */
export const SUPPORT = {
  /** GitHub Sponsors: live once the profile is enrolled there. */
  sponsors: "https://github.com/sponsors/itsadithyakv",
  /**
   * A UPI ID for anybody in India. Empty until one is chosen - and better one
   * made for this (name@bank) than one that is a phone number, since it is
   * shown to everybody.
   */
  upi: "",
  /** Where the code is, for a star. */
  repo: "https://github.com/itsadithyakv/Caulder",
  /** docs/privacy.md, published through GitHub Pages; the Store's privacy URL too. */
  privacy: "https://itsadithyakv.github.io/Caulder/privacy.html",
} as const;

/** The first ask comes a month after Caulder is first opened. */
const FIRST_ASK_DAYS = 30;
/** *Not now* asks again in three months. */
const ASK_AGAIN_DAYS = 90;

/** What is kept in the `supportAsk` setting: the day to ask on, or `never`. */
const NEVER = "never";

export type SupportAnswer = "later" | "never";

/**
 * Whether to ask today, from what is stored. Never stored means Caulder has
 * just been opened for the first time (or before this was built), so the
 * day to ask on is set a month out and nothing is asked yet.
 */
export function supportAsk(stored: string | null | undefined, today: Day): { ask: boolean; store: string | null } {
  if (stored === NEVER) return { ask: false, store: null };
  if (isDay(stored)) return { ask: stored <= today, store: null };
  return { ask: false, store: shiftDay(today, FIRST_ASK_DAYS) };
}

/** What to store after an answer: *Not now* moves the day on; *I have* and *Don't ask again* end it. */
export function answerSupport(answer: SupportAnswer, today: Day): string {
  return answer === "later" ? shiftDay(today, ASK_AGAIN_DAYS) : NEVER;
}
