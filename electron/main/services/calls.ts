import type { Db } from "../db/connection";
import { CALL_SCRIPT_TEMPLATE, type CallContext, type CallScript, isCallTone } from "@shared/calls";
import { findCompany, listStages } from "../repositories/companies";
import { findLead } from "../repositories/leads";
import { listDeals } from "../repositories/deals";
import { findSingle } from "../repositories/brain";
import { findScript, lastScriptId, listCalls, listScripts } from "../repositories/calls";
import { newPage } from "./brain";

/**
 * What the prompter needs to open, in one read: the contact, its deals and
 * last calls, the company's scripts and which one to start on, and the words
 * a script fills itself in with.
 */
export function callContext(db: Db, leadId: string): CallContext {
  const lead = findLead(db, leadId);
  if (!lead) throw new Error("That contact no longer exists.");
  const company = findCompany(db, lead.companyId);
  if (!company) throw new Error("That company no longer exists.");

  const profile = findSingle(db, company.id, "profile");
  const oneLiner = profile?.fields.oneLiner;

  return {
    lead,
    deals: listDeals(db, lead.id),
    calls: listCalls(db, lead.id, 5),
    scripts: listScripts(db, company.id),
    lastScriptId: lastScriptId(db, company.id),
    companyName: company.name,
    oneLiner: typeof oneLiner === "string" && oneLiner.trim().length > 0 ? oneLiner.trim() : null,
    stages: listStages(db, company.id),
  };
}

/** A new script from one of the tones, as a page in Playbooks. */
export function startScript(db: Db, companyId: string, tone: unknown, now: Date): CallScript {
  if (!isCallTone(tone)) throw new Error("Pick a tone for the script.");
  const page = newPage(db, companyId, "playbooks", CALL_SCRIPT_TEMPLATE, now, tone);
  const script = findScript(db, page.id);
  if (!script) throw new Error("The script vanished immediately after being made.");
  return script;
}
