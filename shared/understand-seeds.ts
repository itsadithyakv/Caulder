import type { LessonKind } from "./lessons";

/**
 * What each kind of line sounds like, for a machine that has nothing of its
 * own filed yet (PLAN.md, part five, phase 20). The model reads these once;
 * a new line near several of one kind leans that way. Once there are real
 * lines of the person's own, those count for more (shared/opinion.ts).
 *
 * Written the way the line is written to: short, lower case, some shorthand,
 * and about a company and the day around it - the line is the company's
 * since 10 October 2026 (PLAN.md, part seven), so there is no journal here.
 * None of them is in the measuring stick
 * (electron/main/understand/lines.company.eval.ts) - a seed the test is also
 * marked on would only be marking its own work.
 */
export const SEEDS: Readonly<Record<LessonKind, readonly string[]>> = {
  task: [
    "renew the domain before it lapses",
    "fix the login bug on staging",
    "update the pitch deck numbers",
    "pay the electricity bill",
    "reply to the investor email",
    "pick up the courier from reception",
    "submit the gst registration form",
    "send the proposal to the clinic",
    "prepare slides for the review",
    "chase the unpaid invoice",
    "book the meeting room for thursday",
    "draft the contract for the pilot",
    "file the quarterly return",
    "get the laptop serviced",
    "post the case study on linkedin",
    "print the signed contract",
    "call the bank about the card",
    "order new business cards",
  ],
  idea: [
    "a referral scheme where clients earn a free month",
    "maybe a whatsapp bot that sends the booking link",
    "we could sell a yearly plan at a discount",
    "a dashboard for owners to see bookings",
    "partner with accountants for referrals",
    "a podcast about one-person companies",
    "turn the onboarding into a short video",
    "offer a free trial to the first ten shops",
    "a newsletter with one tip a week",
    "run a workshop with the local business group",
    "a template store for pitch decks",
    "bundle setup and training into one price",
  ],
  note: [
    "wifi at the coworking space is down again",
    "meeting room b has a broken projector",
    "the staging server feels slow today",
    "something off with the signup numbers this week",
    "the demo felt rushed, tighten the middle",
    "landing page copy reads too long",
    "check whether the pilot data came through",
    "two people asked about a discount for charities",
    "the new intern seems quick with figma",
    "pricing page bounce looks high",
    "not sure the cold emails are landing",
  ],
  memory: [
    "the bank wants two signatures on anything over a lakh",
    "stripe settles to the account in two working days",
    "the accountant files by the tenth of each month",
    "the coworking space closes at nine on weekdays",
    "the busy season starts in october for most of our clients",
    "our hosting plan covers up to ten thousand users",
    "the print shop needs files as pdf with bleed",
    "gst on software services is eighteen percent",
    "the council needs a purchase order before paying",
    "harbour pays invoices on the fifth of the month",
    "the domain is registered with namecheap",
    "the office printer takes a3 paper",
    "trademark renewal comes round every ten years",
    "the grant portal only accepts applications in march",
    "our support inbox is checked twice a day",
    "the insurer needs thirty days notice to cancel",
  ],
};
