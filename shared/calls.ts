import { z } from "zod";
import { render } from "./render";
import type { Deal, Lead, PipelineStage } from "./domain";

/**
 * Calls: the script a founder reads from, what they record afterwards, and
 * the rules between the two. See PLAN.md, part three.
 *
 * A script is a brain page in Playbooks. Its text is ordinary Markdown with
 * headings the prompter recognises, so a founder edits it like any other page
 * and a script written by hand still works.
 */

/* ---- Scripts ------------------------------------------------------------- */

export const CALL_SCRIPT_TEMPLATE = "call-script";

export const CALL_TONES = ["warm", "professional", "direct", "consultative"] as const;
export type CallTone = (typeof CALL_TONES)[number];

export const CALL_TONE_LABEL: Record<CallTone, string> = {
  warm: "Warm",
  professional: "Professional",
  direct: "Direct",
  consultative: "Consultative",
};

export const CALL_TONE_HINT: Record<CallTone, string> = {
  warm: "Friendly and unhurried. For small places and people who pick up their own phone.",
  professional: "Polite and precise. For offices, principals and anyone with a gatekeeper.",
  direct: "Short and to the point. For busy people who would rather you got on with it.",
  consultative: "Mostly questions. For bigger decisions, where listening sells.",
};

export function isCallTone(value: unknown): value is CallTone {
  return typeof value === "string" && (CALL_TONES as readonly string[]).includes(value);
}

const OBJECTIONS_WARM = `## If they say…

### "I'm not interested."

That's completely fair. Can I ask what you use for [the problem] today? If it's working, I'll leave you be.

### "Just send me an email."

Happy to. So it's actually useful - should it cover [option A] or [option B]?

### "We already have something."

Good to hear. What do you like about it? And if you could change one thing, what would it be?

### "There's no budget."

Understood. Is that for now, or in general? When do you usually plan for things like this?

### "Call me later."

Of course. Would later this week work, or is next week better?

### "How did you get my number?"

[Where you found it]. Sorry if it's a bad moment - would you rather I emailed?
`;

const PRESET_BODY: Record<CallTone, string> = {
  warm: `## Opening

Hi {{lead.greeting}}, this is {{me.name}} from {{company.name}}. Have I caught you at an okay moment? I'll keep it short.

## Why I'm calling

I work with places a lot like {{lead.name}}, and I wanted to hear how you handle [the problem you solve] at the moment. Not to sell you anything on this call.

## Questions to ask

- How do you handle [the problem] today?
- What's the most annoying part of it?
- Who else is involved when you decide on something like this?
- Have you tried to fix it before? What happened?
- If it were sorted, what would be different for you?

## The pitch

{{company.oneliner}}

What people like most is [the result customers mention first]. [A customer like them] started using it and [what changed, with a number].

${OBJECTIONS_WARM}
## Closing

Would a 20-minute chat be worth it, where I show you how it works for [a customer like them]? I have [day] or [day] - which is easier?

## Voicemail

Hi {{lead.greeting}}, it's {{me.name}} from {{company.name}}. I help places like {{lead.name}} with [the problem]. I'll try you again on [day], or you can reach me on [your number]. Thanks!
`,

  professional: `## Opening

Good [morning / afternoon], may I speak with {{lead.contact}}? … Thank you. My name is {{me.name}}, and I'm calling from {{company.name}}.

## Why I'm calling

We work with organisations like {{lead.name}} on [the problem you solve]. I'd like to understand how you currently manage it, and see whether a conversation would be useful. It will take two minutes.

## Questions to ask

- How is [the problem] handled at {{lead.name}} at present?
- Where does the current approach fall short?
- Who is responsible for decisions in this area?
- Is this something you are planning to review this [term / quarter / year]?
- What would a good outcome look like for you?

## The pitch

{{company.oneliner}}

Organisations such as [a reference customer] use it to [the result], typically [a measurable improvement] within [a timeframe].

## If they say…

### "We're not interested."

I understand. So that I don't contact you unnecessarily, may I ask how you handle [the problem] today?

### "Please send the details by email."

Certainly. To make it relevant, which matters more to you - [option A] or [option B]? And is this the right address?

### "We already have a provider."

That's good to know. How long have you been with them, and when does the arrangement come up for review?

### "There's no budget for this."

Understood. When is your budget usually set? I would be glad to share information ahead of that.

### "This isn't a good time."

Of course. When would be convenient for me to call back?

### "Who gave you my number?"

[Where you found it]. I apologise if the call is unwelcome; I can remove you from our list if you'd prefer.

## Closing

Would you be open to a 30-minute meeting where I can show you how this works for [a comparable organisation]? Would [day] at [time] suit you?

## Voicemail

Good [morning / afternoon], this is {{me.name}} from {{company.name}}, calling for {{lead.contact}} regarding [the problem]. I'll follow up by email, and you can reach me on [your number]. Thank you.
`,

  direct: `## Opening

Hi {{lead.greeting}}, {{me.name}} from {{company.name}}. This is a sales call - can I have thirty seconds, and you tell me if it's worth more?

## Why I'm calling

{{company.oneliner}} Places like {{lead.name}} use it to [the result].

## Questions to ask

- Is [the problem] something you deal with?
- What does it cost you today - time or money?
- Are you the person who decides on this?
- If it worked, when would you want it running?

## The pitch

[The result] in [a timeframe], for [the price or the price range]. [A customer like them] got [a number].

## If they say…

### "Not interested."

No problem. Is that because it's not a problem for you, or because the timing's wrong?

### "Send me an email."

Will do. Tell me the one thing it should answer and I'll keep it to that.

### "We use something else."

Fair. What would make you switch?

### "Too expensive."

Compared with what? [What the problem costs them] is usually more.

### "I'm busy."

Understood. Two minutes tomorrow at [time], or [time]?

## Closing

Let's book 15 minutes to show you. [Day] or [day]?

## Voicemail

{{me.name}} from {{company.name}}. [The result] for places like {{lead.name}}. I'll call again [day]; my number is [your number].
`,

  consultative: `## Opening

Hi {{lead.greeting}}, this is {{me.name}} from {{company.name}}. I'm talking to a few [people in their role] about [the problem], to learn how they handle it. Would you have five minutes?

## Why I'm calling

I'd rather understand your situation than pitch - if there's a fit, we can talk about it after.

## Questions to ask

- Walk me through how [the problem] is handled today, from start to finish.
- Where does it break down, or take longer than it should?
- What have you tried already? Why didn't it stick?
- How do you measure whether it's going well?
- What happens if nothing changes this year?
- Who else would care about fixing this?
- If you could wave a wand, what would it look like?

## The pitch

From what you've said, [their problem, in their words] is what matters most. {{company.oneliner}} For [a customer like them], that meant [the result].

## If they say…

### "I'm not interested."

That's fine - I'm mostly here to learn. What would have to be true for this to be worth looking at?

### "Send me something."

Glad to. Based on what you told me, I'll focus on [what they said mattered]. Does that sound right?

### "We've got it handled."

Sounds like it. What does "handled" look like - how much time does it take each [week / month]?

### "It's not a priority."

Understood. What is the priority this [term / quarter]? Is there a link?

### "I need to talk to others."

Makes sense. Who would they be, and what will they want to know?

## Closing

It sounds like [their problem] is worth a proper look. Shall we take 30 minutes with [the others involved] to go through it? [Day] or [day]?

## Voicemail

Hi {{lead.greeting}}, {{me.name}} from {{company.name}}. I'm speaking to [people in their role] about how they handle [the problem], and I'd value your view. I'll try again [day]; I'm on [your number].
`,
};

/** A new script from a tone: the page's title, text and fields. */
export function scriptPreset(tone: CallTone): { title: string; body: string; fields: { tone: CallTone } } {
  return {
    title: `${CALL_TONE_LABEL[tone]} call script`,
    body: PRESET_BODY[tone],
    fields: { tone },
  };
}

export type ScriptPartKind =
  | "opening"
  | "reason"
  | "questions"
  | "pitch"
  | "objections"
  | "close"
  | "voicemail"
  | "other";

export type Objection = { said: string; answer: string };

export type ScriptPart = {
  kind: ScriptPartKind;
  heading: string;
  /** The part's text, as Markdown. For questions, anything that is not a question. */
  text: string;
  questions: string[];
  objections: Objection[];
};

/** Which part a heading is, by what it says. Anything unknown is shown as written. */
function partKind(heading: string): ScriptPartKind {
  const words = heading.toLowerCase();
  if (/voicemail|message to leave/.test(words)) return "voicemail";
  if (/if they say|objection|push ?back/.test(words)) return "objections";
  if (/question|discovery|to ask/.test(words)) return "questions";
  if (/^(opening|open|intro|introduction|hello|greeting)/.test(words)) return "opening";
  if (/why (i'?m|we'?re) calling|reason|purpose/.test(words)) return "reason";
  if (/pitch|what we do|offer|value/.test(words)) return "pitch";
  if (/clos|next step|the ask|booking/.test(words)) return "close";
  return "other";
}

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.*)$/;

/**
 * A script's text as the prompter shows it: one part per `##` heading, in the
 * order written. Text before the first heading is a part of its own.
 */
export function parseScript(body: string): ScriptPart[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const sections: { heading: string; lines: string[] }[] = [{ heading: "", lines: [] }];

  for (const line of lines) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) sections.push({ heading: (heading[1] ?? "").trim(), lines: [] });
    else sections[sections.length - 1]?.lines.push(line);
  }

  const parts: ScriptPart[] = [];
  for (const section of sections) {
    const text = section.lines.join("\n").trim();
    if (section.heading === "" && text === "") continue;
    const kind = section.heading === "" ? "other" : partKind(section.heading);
    const part: ScriptPart = { kind, heading: section.heading, text, questions: [], objections: [] };

    if (kind === "questions") {
      const rest: string[] = [];
      for (const line of section.lines) {
        const item = LIST_ITEM.exec(line);
        const question = item?.[1]?.trim();
        if (question) part.questions.push(question);
        else rest.push(line);
      }
      part.text = rest.join("\n").trim();
    }

    if (kind === "objections") {
      const rest: string[] = [];
      let current: { said: string; answer: string[] } | null = null;
      const close = () => {
        if (current) part.objections.push({ said: current.said, answer: current.answer.join("\n").trim() });
      };
      for (const line of section.lines) {
        const said = /^###\s+(.*)$/.exec(line);
        if (said) {
          close();
          current = { said: unquote((said[1] ?? "").trim()), answer: [] };
        } else if (current) {
          current.answer.push(line);
        } else {
          rest.push(line);
        }
      }
      close();
      part.text = rest.join("\n").trim();
    }

    parts.push(part);
  }
  return parts;
}

function unquote(text: string): string {
  return text.replace(/^["“”']+|["“”']+$/g, "").trim();
}

export type ScriptContext = {
  leadName: string;
  leadContact: string | null;
  leadCity: string | null;
  companyName: string;
  /** Who is calling, from the script's own field. */
  myName: string | null;
  /** The one-liner from the company profile. */
  oneLiner: string | null;
};

/**
 * A script's text with the call filled in.
 *
 * `{{me.name}}` and `{{company.oneliner}}` are only known here, so an email
 * template cannot pick them up by accident. Missing, each becomes a fill-in in
 * square brackets rather than nothing, so the gap shows while you read.
 * `{{lead.contact}}` does the same in a script, where "Good morning, may I
 * speak with ?" would be read out loud.
 */
export function fillScript(text: string, context: ScriptContext): string {
  const own = text
    .replace(/\{\{\s*me\.name\s*\}\}/g, context.myName?.trim() || "[your name]")
    .replace(/\{\{\s*company\.oneliner\s*\}\}/g, context.oneLiner?.trim() || "[what you do, in one line]")
    .replace(/\{\{\s*lead\.contact\s*\}\}/g, context.leadContact?.trim() || "[the person you want]");
  return render(own, context);
}

/**
 * Square-bracketed fill-ins as inline code, which the prompter draws as a
 * highlight. Tick boxes (`[ ]`, `[x]`), web links and `[[` links are left alone.
 */
export function markFillIns(text: string): string {
  return text.replace(/(^|[^[`])\[([^[\]\n`]{1,80})\](?![(\]])/g, (whole, before: string, inside: string) => {
    if (!/[A-Za-z]/.test(inside) || /^[xX]$/.test(inside.trim())) return whole;
    return `${before}\`[${inside}]\``;
  });
}

/* ---- What happened ------------------------------------------------------ */

export const CALL_OUTCOMES = ["no_answer", "busy", "voicemail", "wrong_number", "spoke"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  no_answer: "Didn't pick up",
  busy: "Busy, call back",
  voicemail: "Left a voicemail",
  wrong_number: "Wrong number",
  spoke: "Spoke to them",
};

export const INTEREST_LEVELS = [1, 2, 3, 4, 5] as const;
export type Interest = (typeof INTEREST_LEVELS)[number];

export const INTEREST_LABEL: Record<Interest, string> = {
  1: "Not interested",
  2: "Unlikely",
  3: "Maybe",
  4: "Interested",
  5: "Keen",
};

export function isInterest(value: unknown): value is Interest {
  return typeof value === "number" && (INTEREST_LEVELS as readonly number[]).includes(value);
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

export const callAnswer = z.object({
  question: z.string().trim().max(500),
  answer: z.string().trim().max(2000),
});
export type CallAnswer = z.infer<typeof callAnswer>;

export const callInput = z
  .object({
    leadId: z.string().min(1),
    /** Null puts it on the contact's main deal. */
    dealId: z.string().nullable().default(null),
    scriptId: z.string().nullable().default(null),
    /** The task this call was made from; it is ticked off. */
    taskId: z.string().nullable().default(null),
    outcome: z.enum(CALL_OUTCOMES),
    interest: z.number().int().min(1).max(5).nullable().default(null),
    notes: z.string().trim().max(8000).default(""),
    answers: z.array(callAnswer).max(40).default([]),
    /** The contact's standing notes after the call. Left out, they stay as they are. */
    keepInMind: z.string().trim().max(4000).nullable().optional(),
    next: z
      .object({ title: z.string().trim().min(1, "Say what happens next.").max(200), dueOn: day })
      .nullable()
      .default(null),
    /** Where the deal goes. Left out, it stays where it is. */
    stageId: z.string().nullable().optional(),
    lossReason: z.string().trim().max(200).nullable().default(null),
    startedAt: z.string().nullable().default(null),
    seconds: z.number().int().min(0).max(86_400).nullable().default(null),
  })
  // How interested somebody was only means something if you spoke to them.
  .transform((input) => ({
    ...input,
    interest: input.outcome === "spoke" ? input.interest : null,
    answers: input.answers.filter((pair) => pair.answer.length > 0),
  }));

export type CallInput = z.input<typeof callInput>;

/** The answers typed beside the questions, as the notes carry them. */
function answersText(answers: readonly CallAnswer[]): string {
  return answers
    .filter((pair) => pair.answer.trim().length > 0)
    .map((pair) => `${pair.question}\n→ ${pair.answer.trim()}`)
    .join("\n\n");
}

function minutes(seconds: number | null): string | null {
  if (seconds === null || seconds < 30) return null;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

/** The line the history shows for a call, and the text search finds it by. */
export function callSummary(call: {
  outcome: CallOutcome;
  interest: number | null;
  notes: string;
  answers: readonly CallAnswer[];
  seconds: number | null;
}): string {
  const head = [
    CALL_OUTCOME_LABEL[call.outcome],
    call.outcome === "spoke" && isInterest(call.interest)
      ? `${INTEREST_LABEL[call.interest]} (${call.interest} of 5)`
      : null,
    call.outcome === "spoke" ? minutes(call.seconds) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [head, call.notes.trim(), answersText(call.answers)].filter((part) => part.length > 0).join("\n\n");
}

/** What a call suggests doing next, before anybody changes it. */
export function suggestNext(outcome: CallOutcome, interest: number | null, name: string): { title: string; days: number } | null {
  switch (outcome) {
    case "no_answer":
    case "voicemail":
      return { title: `Call ${name} again`, days: 1 };
    case "busy":
      return { title: `Call ${name} back`, days: 1 };
    case "wrong_number":
      return { title: `Find the right number for ${name}`, days: 1 };
    case "spoke":
      if (interest === 1) return null;
      return { title: `Follow up with ${name}`, days: interest !== null && interest >= 4 ? 2 : 7 };
  }
}

type StageLike = Pick<PipelineStage, "id" | "name" | "kind" | "position">;

/**
 * Where a call suggests the deal goes.
 *
 * Only speaking to somebody moves a deal: a missed call is an attempt, not
 * news. Having spoken, a deal still in the first stage moves at least one on;
 * interest moves it to a stage called something like "Interested" when there
 * is one further along; no interest suggests the first lost stage. A deal
 * that is already won or lost is left alone, and nothing moves backwards.
 */
export function suggestStage(
  stages: readonly StageLike[],
  currentId: string | null,
  outcome: CallOutcome,
  interest: number | null,
): string | null {
  if (outcome !== "spoke") return currentId;
  const current = stages.find((stage) => stage.id === currentId) ?? null;
  if (current && current.kind !== "open") return currentId;

  if (interest === 1) {
    const lost = [...stages].sort((a, b) => a.position - b.position).find((stage) => stage.kind === "lost");
    return lost?.id ?? currentId;
  }

  const open = stages.filter((stage) => stage.kind === "open").sort((a, b) => a.position - b.position);
  const at = current ? open.findIndex((stage) => stage.id === current.id) : -1;
  let target = at >= 1 ? open[at] : (open[1] ?? open[0]);
  if (interest !== null && interest >= 4 && target) {
    const named = open.findIndex((stage) => /interest/i.test(stage.name));
    if (named > open.indexOf(target)) target = open[named];
  }
  return target?.id ?? currentId;
}

/* ---- What the prompter reads -------------------------------------------- */

export type CallScript = {
  id: string;
  title: string;
  tone: CallTone | null;
  /** Who is calling, as the script says it. */
  caller: string | null;
  body: string;
  updatedAt: string;
};

export type CallRecord = {
  id: string;
  leadId: string;
  dealId: string | null;
  dealTitle: string | null;
  scriptId: string | null;
  outcome: CallOutcome;
  interest: Interest | null;
  notes: string;
  answers: CallAnswer[];
  seconds: number | null;
  createdAt: string;
};

export type CallContext = {
  lead: Lead;
  deals: Deal[];
  /** The last few, newest first. */
  calls: CallRecord[];
  scripts: CallScript[];
  /** The script used last in this company, to start on. */
  lastScriptId: string | null;
  companyName: string;
  oneLiner: string | null;
  stages: PipelineStage[];
};
