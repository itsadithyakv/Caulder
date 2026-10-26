import type { Db } from "../db/connection";
import { isForAi, lineAsked, lineInput, linePrompt, parseAiLine, type AiLineResult } from "@shared/ailine";
import { isSecret } from "@shared/secretline";
import { distance } from "@shared/slips";
import { today as todayIn } from "@shared/dates";
import { listLeads } from "../repositories/leads";
import { askBrain, asking, complete } from "./ask";
import { briefOf } from "./relevant";
import { nearestTo, type Read } from "./understand";

/**
 * The quick line in AI mode (PLAN.md, part ten, phase 38): one line, read by
 * the AI that is connected, and what it says the line is handed back for the
 * window to show and - on Enter - to keep. Nothing is written here.
 *
 * What goes is small on purpose, because it goes with every line: the
 * company in a sentence or two, today's date, and the names the line might
 * mean - not the contacts' details, their history or anything else. A line
 * that is a question, or asks for something to be written, is answered
 * instead, with what the question needs (services/relevant.ts).
 */

/** The most names sent with a line. */
const NAMES = 24;
const PAGES = 30;

const wordsOf = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];

/** Whether a word in the line is, or is one slip from, a word in a name. */
function near(line: readonly string[], name: string): boolean {
  return wordsOf(name).some((word) => line.some((typed) => typed === word || (word.length >= 5 && typed[0] === word[0] && distance(typed, word) <= 1)));
}

export async function readLine(db: Db, companyId: string, raw: unknown, now: Date = new Date(), read: Read | null = null): Promise<AiLineResult> {
  const input = lineInput.parse(raw);
  const { connection, service, model, label } = asking(db, "use AI mode");
  // Never sent anywhere, whatever mode the line is in.
  if (isSecret(input.line)) {
    throw new Error(`This looks like a password or a number to keep safe, so it was not sent to ${service.label}. Put it in a sealed field on a brain page.`);
  }
  if (input.answers.length === 0 && isForAi(input.line)) {
    return { is: "answer", answer: await askBrain(db, companyId, { question: input.line }, now, read) };
  }

  const company = db.prepare(`SELECT name, timezone FROM companies WHERE id = ?`).get(companyId) as { name: string; timezone: string } | undefined;
  if (!company) throw new Error("That company no longer exists.");

  // The names it might mean: the ones its words are near, the ones it means, then the ones last spoken to.
  const leads = listLeads(db, { companyId, sort: "recent", direction: "desc" });
  const typed = wordsOf(lineAsked(input));
  const chosen = new Map<string, { name: string; person: string | null }>();
  const take = (lead: (typeof leads)[number] | undefined) => {
    if (lead && chosen.size < NAMES) chosen.set(lead.id, { name: lead.name, person: lead.contactPerson });
  };
  for (const lead of leads) if (near(typed, `${lead.name} ${lead.contactPerson ?? ""}`)) take(lead);
  if (read) {
    const meant = await nearestTo(db, read, [companyId], input.line, { kinds: ["contact"], most: 5, floor: 0.35 }).catch(() => []);
    for (const hit of meant) take(leads.find((lead) => lead.id === hit.sourceId));
  }
  for (const lead of leads.slice(0, 12)) take(lead);

  const pages = (
    db.prepare(`SELECT title FROM brain_pages WHERE company_id = ? AND is_archived = 0 ORDER BY updated_at DESC LIMIT ?`).all(companyId, PAGES) as {
      title: string;
    }[]
  )
    .map((page) => page.title.trim())
    .filter((title) => title.length > 0 && title.toLowerCase() !== "untitled");

  const system = linePrompt({
    company: company.name,
    brief: briefOf(db, companyId, now).text.slice(0, 600),
    today: todayIn(company.timezone, now),
    contacts: [...chosen.values()],
    pages,
  });
  const asked = lineAsked(input);
  const reply = await complete(connection, model, system, "", [], asked, true);
  const line = parseAiLine(reply.text);
  if (!line) throw new Error(`${service.label} did not say what that line is in a way Caulder can read. Press Enter to try again, or switch AI mode off to read it here.`);

  // It says the line is for it to answer: answered, with what the question needs.
  if (line.kind === "question") {
    return { is: "answer", answer: await askBrain(db, companyId, { question: input.line }, now, read) };
  }
  return {
    is: "reading",
    line,
    service: service.label,
    model: label,
    sent: { contacts: chosen.size, characters: system.length + asked.length },
    usage: reply.usage,
  };
}
