import type { Db } from "../db/connection";
import { ACTIVITY_LABEL, type Activity } from "@shared/domain";
import { parseNoticed, parsePlaced, unfenced, unmarked, type Draft, type Noticed, type NoticedDraft, type ProposalSent, type SortDraft } from "@shared/propose";
import { RULE_PAGES, type Home } from "@shared/rules";
import { sortPlan } from "./howwework";
import { listActivities, listLeads } from "../repositories/leads";
import { asking, budgetOf, complete } from "./ask";
import { getPage } from "./brain";
import { buildDossier } from "./dossier";
import { briefOf, partsOf } from "./relevant";

/**
 * What the AI proposes (PLAN.md, part ten, phase 39): the company in brief,
 * a page tidied, and what the contacts' history shows. Each is a draft
 * handed back to the window. Nothing is written here, by design - what is
 * kept is kept by the person, through the channels that keep anything else.
 */

/** The most that goes to make one draft, whatever size is chosen: a draft needs the gist, not the company. */
const DRAFT_ROOM = 40_000;

const QUIET: readonly Activity["kind"][] = ["created", "imported", "import_undone", "field_change", "stage_change"];

function wrapped(documents: readonly { title: string; text: string }[]): string {
  return documents.map((document) => `<document title="${document.title}">\n${document.text}\n</document>`).join("\n\n");
}

/** What the recent history looks like, a line each: how the company is run, as it happened. */
function recently(db: Db, companyId: string, most: number): string {
  const rows = db
    .prepare(
      `SELECT a.kind, a.body, a.occurred_at, l.name FROM activities a JOIN leads l ON l.id = a.lead_id
        WHERE a.company_id = ? AND a.kind NOT IN ('created', 'imported', 'import_undone', 'field_change', 'stage_change')
        ORDER BY a.occurred_at DESC LIMIT ?`,
    )
    .all(companyId, most) as { kind: Activity["kind"]; body: string | null; occurred_at: string; name: string }[];
  return rows
    .map((row) => `- ${row.occurred_at.slice(0, 10)}, ${row.name} - ${ACTIVITY_LABEL[row.kind]}${row.body ? `: ${(row.body.split("\n")[0] ?? "").slice(0, 200)}` : ""}`)
    .join("\n");
}

/**
 * The company in brief, drafted from what is already written: the profile,
 * the plan, what it sells, who it sells to, what it has been told to
 * remember, and the last weeks of history. Ten lines, to be read, changed
 * and kept as the page that goes with every question.
 */
export async function proposeBrief(db: Db, companyId: string, now: Date = new Date()): Promise<Draft> {
  const { connection, service, model, label } = asking(db, "have the brief drafted");
  const company = db.prepare(`SELECT name FROM companies WHERE id = ?`).get(companyId) as { name: string } | undefined;
  if (!company) throw new Error("That company no longer exists.");

  // Every page, nobody's history: what the company says it is.
  const dossier = buildDossier(db, companyId, { secrets: false, contacts: new Set() }, now);
  const wanted = new Set(["At a glance", "What we sell", "Company", "Plan", "Products and pricing", "Customers and market", "How we work", "Remembered"]);
  const seen = new Set<string>();
  const documents: { title: string; text: string }[] = [{ title: "What Caulder already says in brief", text: briefOf(db, companyId, now).text }];
  for (const document of dossier) {
    for (const part of partsOf(document.text)) {
      if (!wanted.has(part.heading) || seen.has(part.heading)) continue;
      seen.add(part.heading);
      documents.push({ title: part.heading, text: part.text.replace(/^## .+\n+/, "") });
    }
  }
  const history = recently(db, companyId, 40);
  if (history) documents.push({ title: "The last things that happened with contacts", text: history });

  const room = Math.min(DRAFT_ROOM, budgetOf(db, service).characters);
  const share = Math.floor(room / documents.length);
  const context = wrapped(documents.map((document) => ({ ...document, text: document.text.slice(0, share) })));
  const reply = await complete(
    connection,
    model,
    [
      `You write a brief of ${company.name}, for an AI assistant that will be given it with every question the founder asks. The founder will read it, change it and keep it.`,
      "From the documents, write at most ten short lines, each starting with \"- \": what the company is and does; who it sells to; what it sells and at what prices; how it bills and is paid; where it is and in what currency; and how the founder works - hours, habits, rules they keep - where the documents say.",
      "Only what the documents say. No advice, no adjectives, no headings, no introduction. If the documents say little, write fewer lines rather than guessing.",
    ].join("\n\n"),
    context,
    [],
    "Write the brief.",
  );
  const text = unfenced(reply.text);
  if (!text) throw new Error(`${service.label} sent back an empty draft. Try again, or another model.`);
  return { text, sent: sentOf(service.label, label, documents.map((document) => document.title), context.length, reply.usage) };
}

/**
 * One page, tidied: the same facts, said once, under clear headings. Only
 * the page is sent. What comes back is compared with what is there and kept
 * or thrown away whole.
 */
export async function proposeTidy(db: Db, companyId: string, pageId: string): Promise<Draft> {
  const { connection, service, model, label } = asking(db, "have a page tidied");
  const page = getPage(db, pageId);
  if (page.companyId !== companyId) throw new Error("That page belongs to another company.");
  const body = unmarked(page.body);
  if (body.trim().length < 40) throw new Error("There is too little on this page to tidy.");
  if (body.length > DRAFT_ROOM) throw new Error("This page is too long to send to be tidied in one go.");

  const reply = await complete(
    connection,
    model,
    [
      "You tidy one page of a company's own notes. Reply with the whole page in Markdown, tidied, and nothing else - no introduction and no code fence.",
      "Tidy means: clear headings; what is said twice said once; lists where there are lists; the same facts, in the founder's own words wherever they were clear. Do not add a fact, an opinion or advice, and do not remove a fact.",
      "Keep [[links]] exactly as written. Keep dated lines such as \"- ... _(2026-10-13)_\" as lines of their own, with their dates.",
      "If two statements contradict each other, keep both, and end the page with a section \"## To check\" that lists them.",
    ].join("\n\n"),
    "",
    [],
    `# ${page.title}\n\n${body}`,
  );
  const text = unmarked(unfenced(reply.text)).replace(new RegExp(`^#\\s+${page.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n+`, "i"), "");
  if (!text) throw new Error(`${service.label} sent back an empty page. Try again, or another model.`);
  return { text, sent: sentOf(service.label, label, [`the page “${page.title}”`], body.length, reply.usage) };
}

/**
 * What the contacts' history shows that no note says: "has paid late three
 * times", "answers only on WhatsApp". Offered with the entries each came
 * from, to be kept on the contact or not.
 */
export async function proposeNoticed(db: Db, companyId: string, now: Date = new Date()): Promise<NoticedDraft> {
  const { connection, service, model, label } = asking(db, "have the history read");
  // The ones with enough history for it to show anything, the most lately spoken to first.
  const leads = listLeads(db, { companyId, sort: "recent", direction: "desc" });
  const chosen = new Set<string>();
  for (const lead of leads) {
    if (chosen.size >= 25) break;
    if (listActivities(db, lead.id).filter((entry) => !QUIET.includes(entry.kind)).length >= 3) chosen.add(lead.id);
  }
  if (chosen.size === 0) throw new Error("No contact has enough history yet for it to show anything: three entries or more.");

  const sales = buildDossier(db, companyId, { secrets: false, contacts: chosen, pages: new Set() }, now).find(
    (document) => document.title === "Customers and sales",
  );
  const contacts = partsOf(sales?.text ?? "").find((part) => part.heading === "Contacts")?.text ?? "";
  const room = Math.min(DRAFT_ROOM * 2, budgetOf(db, service).characters);
  const context = wrapped([{ title: "Contacts and their history", text: contacts.slice(0, room) }]);
  const reply = await complete(
    connection,
    model,
    [
      "From the history of a company's contacts, say what it shows that is worth the founder keeping in mind and is not already in that contact's \"Keep in mind\" note: how they pay, how and when they answer, what they always ask for, what they go quiet after.",
      "Only what at least two entries show. At most eight, the most useful first. One plain sentence each, with no advice.",
      "Reply with one JSON object and nothing else: {\"facts\": [{\"about\": the contact's name exactly as its heading has it, \"fact\": the sentence, \"from\": [the entries it came from, each quoted briefly with its date]}]}. With nothing worth saying, reply {\"facts\": []}.",
    ].join("\n\n"),
    context,
    [],
    "What does the history show?",
    true,
  );
  const byName = new Map(leads.filter((lead) => chosen.has(lead.id)).map((lead) => [lead.name.trim().toLowerCase(), lead]));
  const facts: Noticed[] = parseNoticed(reply.text).flatMap((each) => {
    // Only about somebody who was sent: a name it made up is nobody's.
    const lead = byName.get(each.about.trim().toLowerCase());
    return lead ? [{ leadId: lead.id, about: lead.name, fact: each.fact, from: each.from }] : [];
  });
  return { facts, sent: sentOf(service.label, label, [`${chosen.size} contacts and their history`], context.length, reply.usage) };
}

/**
 * A page sorted, with the AI asked about the lines the rules on this
 * machine could not place (PLAN.md, part eleven, phase 41). Only those
 * lines go, with the subjects there are and the contacts' names. What comes
 * back is a list of moves to be said yes or no to: nothing is moved here.
 */
export async function proposeSort(db: Db, companyId: string, pageId: string): Promise<SortDraft> {
  const { connection, service, model, label } = asking(db, "have a page sorted");
  const plan = sortPlan(db, companyId, pageId);
  const open = plan.lines.map((line, at) => ({ line, at })).filter((each) => each.line.to === null).slice(0, 60);
  if (open.length === 0) return { ...plan, sent: null };

  const leads = listLeads(db, { companyId, sort: "recent", direction: "desc" }).slice(0, 80);
  const context = [
    `Subjects there are rules on: ${RULE_PAGES.join("; ")}.`,
    leads.length > 0 ? `Known contacts, as "company | person":\n${leads.map((lead) => `${lead.name} | ${lead.contactPerson ?? "-"}`).join("\n")}` : "There are no known contacts.",
  ].join("\n\n");
  const asked = open.map((each, n) => `${n + 1}. ${each.line.says}`).join("\n");
  const reply = await complete(
    connection,
    model,
    [
      `You sort lines from the page "${plan.title}" of a company's own notes. For each numbered line, say where it belongs.`,
      "rule - it is a rule the company keeps about how it works, a habit or a term it holds to: give the subject it is about, copied exactly from the subjects listed. contact - it is about one known contact: give the contact's company name exactly as listed. stay - anything else, and whenever you are not sure.",
      "Reply with one JSON object and nothing else: {\"lines\": [{\"n\": the line's number, \"to\": \"rule\" | \"contact\" | \"stay\", \"subject\": a subject or null, \"contact\": a company name or null}]}.",
    ].join("\n\n"),
    context,
    [],
    asked,
    true,
  );

  const byName = new Map(leads.map((lead) => [lead.name.trim().toLowerCase(), lead]));
  const lines = [...plan.lines];
  for (const each of parsePlaced(reply.text)) {
    const found = open[each.n - 1];
    if (!found) continue;
    let to: Home | null = null;
    if (each.to === "rule") {
      // Only to a subject there is: one it made up is nowhere to put anything.
      const subject = RULE_PAGES.find((page) => page.toLowerCase() === (each.subject ?? "").trim().toLowerCase());
      if (subject && subject.toLowerCase() !== plan.title.trim().toLowerCase()) to = { kind: "rule", subject };
    } else if (each.to === "contact") {
      const lead = byName.get((each.contact ?? "").split("|")[0]?.trim().toLowerCase() ?? "");
      if (lead) to = { kind: "contact", id: lead.id, name: lead.name };
    }
    if (to) lines[found.at] = { ...found.line, to, by: "ai" };
  }
  return {
    ...plan,
    lines,
    sent: sentOf(service.label, label, [`${open.length} lines of the page “${plan.title}”`, `${leads.length} contacts' names`], context.length + asked.length, reply.usage),
  };
}

function sentOf(service: string, model: string, parts: string[], characters: number, usage: ProposalSent["usage"]): ProposalSent {
  return { service, model, parts, characters, usage };
}
