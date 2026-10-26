import type { Db } from "../db/connection";
import { BRAIN_SECTION_LIST, type BrainSectionId } from "@shared/brain";
import { hasTopic, needsOf, rareWords } from "@shared/relevant";
import { countryName, timezoneCity } from "@shared/countries";
import { unmarked, type BriefState } from "@shared/propose";
import { PRODUCT_KIND_LABEL, describeRecurrence } from "@shared/products";
import { listLeads } from "../repositories/leads";
import { pagesOf } from "../repositories/brain";
import { listProducts } from "../repositories/products";
import { searchEverything } from "../repositories/search";
import { today as todayIn } from "@shared/dates";
import { buildDossier, type DossierDocument } from "./dossier";
import { nearestTo, type Read } from "./understand";

/**
 * What goes with a question: the company in brief, and the parts of the
 * records the question is about (PLAN.md, part ten, phase 37).
 *
 * The dossier is still the one way the company is written out for an AI
 * (services/dossier.ts). This cuts it: only the contacts and pages the
 * question names or means, and only the parts its words point at
 * (shared/relevant.ts). A question about one contact used to cost the whole
 * company; it now costs a brief, that contact, and what it asked about.
 */

/** The page the company in brief is kept on, once somebody has written or kept one. */
export const BRIEF_PAGE = "Company in brief";

type Relevant = {
  documents: { title: string; text: string }[];
  /** What went, in the words the person is told it in. */
  parts: string[];
  /** How many contacts are written out in full, and how many are not. */
  contacts: number;
  leftOut: number;
  whole: boolean;
};

type Page = ReturnType<typeof pagesOf>[number];

const words = (text: string) => ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

/**
 * The company in a few lines: what it is, where, what it sells and for how
 * much. The page called "Company in brief" when there is one - written by
 * hand, or drafted by the AI and kept (services/propose.ts) - and otherwise
 * put together from the profile and the catalogue, which is plainer and
 * always true.
 */
export function briefOf(db: Db, companyId: string, now: Date = new Date()): BriefState {
  const pages = pagesOf(db, companyId).filter((page) => page.is_archived === 0);
  const kept = pages.find((page) => page.title.trim().toLowerCase() === BRIEF_PAGE.toLowerCase() && page.body.trim().length > 0);
  // Without the line that says who drafted it: a note on the page, not something to pay to send.
  if (kept) return { text: unmarked(kept.body).trim(), pageId: kept.id, written: true };

  const company = db.prepare(`SELECT name, currency, country, timezone FROM companies WHERE id = ?`).get(companyId) as
    | { name: string; currency: string; country: string | null; timezone: string }
    | undefined;
  if (!company) throw new Error("That company no longer exists.");
  const profile = pages.find((page) => page.template === "profile");
  const said = (key: string) => {
    const value = profile?.stored[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const products = listProducts(db, companyId, todayIn(company.timezone, now)).filter((product) => product.status !== "retired");
  const lines = [
    `${said("tradingName") ?? company.name}${said("oneLiner") ? `: ${said("oneLiner")}` : "."}`,
    [said("entityType"), company.country ? `in ${countryName(company.country, "en")}` : null, `money in ${company.currency}`, `${timezoneCity(company.timezone)} time`]
      .filter(Boolean)
      .join(", ")
      .replace(/^./, (first) => first.toUpperCase()) + ".",
    ...(products.length > 0
      ? [
          `Sells: ${products
            .slice(0, 8)
            .map(
              (product) =>
                `${product.name} (${PRODUCT_KIND_LABEL[product.kind].toLowerCase()}${
                  product.current ? `, ${company.currency} ${product.current.amount} ${describeRecurrence(product.current.recurrence)}` : ""
                })`,
            )
            .join("; ")}${products.length > 8 ? `; and ${products.length - 8} more` : ""}.`,
        ]
      : []),
  ];
  return { text: lines.join("\n"), pageId: null, written: false };
}

/** A document's `## ` parts, by heading. Fenced code is passed over, so a "## " inside one starts nothing. */
export function partsOf(text: string): { heading: string; text: string }[] {
  const parts: { heading: string; lines: string[] }[] = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^## (.+)$/.exec(line);
    if (heading) parts.push({ heading: (heading[1] ?? "").trim(), lines: [line] });
    else parts[parts.length - 1]?.lines.push(line);
  }
  return parts.map((part) => ({ heading: part.heading, text: part.lines.join("\n").trimEnd() }));
}

function size(documents: readonly { text: string }[]): number {
  return documents.reduce((sum, document) => sum + document.text.length, 0);
}

/** Cuts documents that still do not fit, and says so where each was cut. */
function fit<T extends { text: string }>(documents: T[], budget: number): T[] {
  const share = Math.floor(budget / Math.max(1, documents.length));
  return documents.map((document) =>
    document.text.length <= share
      ? document
      : { ...document, text: `${document.text.slice(0, share)}\n\n*(Cut here: the rest was too long to send.)*` },
  );
}

type Options = {
  /** The questions before this one, oldest first: "and the ones in Mysuru?" is about what the last one was. */
  earlier?: readonly string[];
  /** The most to send, in characters, and the most contacts in full when the whole company is cut to fit. */
  budget: { characters: number; contacts: number };
  /** The whole company, whatever the question: asked for with it, or chosen in Settings. */
  whole?: boolean;
  /** The model on this machine, when understanding is on: who and what the question means, beyond its words. */
  read?: Read | null;
  now?: Date;
};

/** The whole company, as it used to go with every question: cut to the contacts the question bears on only when it will not fit. */
async function wholeOf(db: Db, companyId: string, question: string, meant: readonly string[], options: Options): Promise<Relevant> {
  const now = options.now ?? new Date();
  const leads = listLeads(db, { companyId, sort: "recent", direction: "desc" });
  let documents: DossierDocument[] = buildDossier(db, companyId, { secrets: false }, now);
  let contacts = leads.length;
  if (size(documents) > options.budget.characters) {
    const chosen = new Set<string>(named(question, leads));
    for (const id of [...meant, ...leads.map((lead) => lead.id)]) {
      if (chosen.size >= options.budget.contacts) break;
      chosen.add(id);
    }
    documents = buildDossier(db, companyId, { secrets: false, contacts: chosen }, now);
    contacts = chosen.size;
  }
  if (size(documents) > options.budget.characters) documents = fit(documents, options.budget.characters);
  return {
    documents: documents.map((document) => ({ title: document.title, text: document.text })),
    parts: ["the whole company"],
    contacts,
    leftOut: leads.length - contacts,
    whole: true,
  };
}

type Lead = ReturnType<typeof listLeads>[number];

/** The contacts a question names: by the company's name, the person's, or the person's first name. */
function named(question: string, leads: readonly Lead[]): string[] {
  const asked = words(question);
  const found: string[] = [];
  for (const lead of leads) {
    const person = (lead.contactPerson ?? "").trim();
    const first = person.split(/\s+/)[0] ?? "";
    const says = [lead.name, person, first].filter((name) => name.length >= 3).some((name) => asked.includes(words(name)));
    if (says) found.push(lead.id);
  }
  return found;
}

export async function relevantTo(db: Db, companyId: string, question: string, options: Options): Promise<Relevant> {
  const now = options.now ?? new Date();
  // A follow-up that names nothing is about what the question before it was about.
  const before = options.earlier?.at(-1) ?? "";
  const leads = listLeads(db, { companyId, sort: "recent", direction: "desc" });
  const said = named(question, leads).length > 0 || hasTopic(question) || !before ? question : `${before}\n${question}`;
  // Somebody named, and nothing else asked about: them, and no more. Only a question
  // about nothing in particular gets what is open besides.
  const needs = !hasTopic(said) && named(said, leads).length > 0 ? { whole: false, parts: [], sections: [], besides: "none" as const } : needsOf(said);

  const near =async (kinds: ("contact" | "page" | "memory")[], most: number, floor: number) =>
    options.read ? await nearestTo(db, options.read, [companyId], said, { kinds, most, floor }).catch(() => []) : [];

  if (options.whole || needs.whole) {
    return wholeOf(db, companyId, said, (await near(["contact"], 20, 0.3)).map((hit) => hit.sourceId), options);
  }

  /* Who. */
  const chosen = new Set<string>(named(said, leads).slice(0, 8));
  const here = new Set(leads.map((lead) => lead.id));
  if (chosen.size === 0) {
    // Nobody named: who it means - "the school that wanted a pilot" names nobody.
    for (const hit of await near(["contact"], 3, 0.45)) if (here.has(hit.sourceId)) chosen.add(hit.sourceId);
  }
  if (needs.besides === "open") {
    const open = db
      .prepare(
        `SELECT DISTINCT d.lead_id AS id FROM deals d LEFT JOIN pipeline_stages s ON s.id = d.stage_id
          WHERE d.company_id = ? AND COALESCE(s.kind, 'open') = 'open' ORDER BY d.updated_at DESC LIMIT 8`,
      )
      .all(companyId) as { id: string }[];
    for (const row of open) chosen.add(row.id);
  } else if (needs.besides === "recent") {
    for (const lead of leads.slice(0, Math.min(15, options.budget.contacts))) chosen.add(lead.id);
  }

  /* What is written. */
  const everyPage = pagesOf(db, companyId).filter((page) => page.is_archived === 0);
  const brief = briefOf(db, companyId, now);
  const pages = new Map<string, Page>();
  const take = (page: Page | undefined) => {
    if (page && page.id !== brief.pageId) pages.set(page.id, page);
  };
  for (const page of everyPage) if (needs.sections.includes(page.section)) take(page);
  const asked = words(said);
  for (const page of everyPage) {
    const title = words(page.title);
    if (title.trim().length >= 4 && page.title.trim().toLowerCase() !== "untitled" && asked.includes(title)) take(page);
  }
  for (const hit of await near(["page", "memory"], 3, 0.4)) take(everyPage.find((page) => page.id === hit.sourceId));
  // A word nobody else uses - "timetable", "referral" - finds the page or the contact it is on.
  for (const word of rareWords(said)) {
    for (const hit of searchEverything(db, companyId, word, 3)) {
      if (hit.kind === "page") take(everyPage.find((page) => page.id === hit.id));
      else if (hit.leadId && here.has(hit.leadId) && chosen.size < 8) chosen.add(hit.leadId);
    }
  }

  /* The dossier, with only those in it, and only the parts asked about. */
  const documents = buildDossier(db, companyId, { secrets: false, contacts: chosen, pages: new Set(pages.keys()) }, now);
  const label = new Map<string, BrainSectionId>(BRAIN_SECTION_LIST.map((section) => [section.label, section.id]));
  const withPages = new Set([...pages.values()].map((page) => page.section));
  const wanted = new Set(needs.parts);
  const company = documents.find((document) => document.title === "The company");
  const glance = partsOf(company?.text ?? "").find((part) => part.heading === "At a glance");

  const out: Relevant["documents"] = [
    {
      title: "The company in brief",
      text: [brief.text, "", glance?.text.replace(/^## At a glance\n+/, "") ?? ""].join("\n").trim(),
    },
  ];
  const told: string[] = ["the company in brief"];
  for (const document of documents) {
    if (document.title === "Read me first") continue;
    for (const part of partsOf(document.text)) {
      if (part.heading === "At a glance") continue;
      const section = label.get(part.heading);
      if (part.heading === "Contacts") {
        if (chosen.size === 0) continue;
      } else if (section ? !(needs.sections.includes(section) || withPages.has(section)) : !wanted.has(part.heading)) {
        continue;
      }
      const text = part.text.replace(/^## .+\n+/, "").trim();
      // A section with nothing written in it says nothing worth paying to send.
      if (text === "" || text === "*Nothing written here yet.*") continue;
      out.push({ title: part.heading, text });
      if (part.heading !== "Contacts" && !section) told.push(part.heading);
    }
  }
  const people = leads.filter((lead) => chosen.has(lead.id)).map((lead) => lead.name);
  told.push(...(people.length <= 3 ? people : [`${people.length} contacts`]));
  const titles = [...pages.values()].map((page) => page.title);
  told.push(...(titles.length <= 3 ? titles.map((title) => `the page “${title}”`) : [`${titles.length} pages`]));

  return {
    documents: size(out) > options.budget.characters ? fit(out, options.budget.characters) : out,
    parts: told,
    contacts: chosen.size,
    leftOut: leads.length - chosen.size,
    whole: false,
  };
}
