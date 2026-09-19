import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The dossier: the whole company as four documents, with what matters about
 * each contact, numbers masked unless asked for, and links written as names.
 */

vi.mock("./secrets", () => ({
  isSealed: (value: unknown) => typeof value === "object" && value !== null && "$secret" in value,
  sealSecret: (text: string) => ({ $secret: `sealed:${text}`, last4: text.slice(-4) }),
  openSecret: (sealed: { $secret: string }) => sealed.$secret.replace(/^sealed:/, ""),
}));

const { migrate } = await import("../db/migrations");
const { createCompany } = await import("../repositories/companies");
const { createLead } = await import("../repositories/leads");
const { createNote } = await import("../repositories/notes");
const { logCall } = await import("../repositories/calls");
const { saveInvoice, setInvoiceStatus } = await import("../repositories/money");
const { createTask } = await import("../repositories/tasks");
const { newPage, savePage } = await import("./brain");
const { recordBalance } = await import("./costs");
const { buildDossier, exportDossier } = await import("./dossier");
const { leadInput, taskInput } = await import("@shared/domain");

let db: Database.Database;
let companyId: string;
const now = new Date("2026-09-17T06:00:00.000Z");

function page(section: string, template: string, title: string, body: string, fields: Record<string, unknown> = {}, secrets = {}) {
  const made = newPage(db, companyId, section, template, now);
  return savePage(db, made.id, { title, body, fields, secrets, baseRevision: made.revision }, now);
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;

  page("company", "profile", "Company profile", "", { oneLiner: "Timetables that write themselves" }, { pan: "AAACU9876K" });
  const school = createLead(
    db,
    companyId,
    leadInput.parse({ name: "Oakridge", city: "Bengaluru", notes: "Call before 10am.", value: 50000 }),
  );
  createLead(db, companyId, leadInput.parse({ name: "Quiet Academy", city: "Mysuru" }));
  const script = page("playbooks", "call-script", "Schools script", "## Opening\n\nHello.\n\n### Deeper\n\nMore.", {
    tone: "warm",
  });
  page("decisions", "decision", "Annual billing only", `We chose it after [[Schools script|page:${script.id}]] with [[Oakridge|contact:${school.id}]].`);
  page("tools", "domain", "unifloe.in", "", { cost: 1200, renewsOn: "2027-07-14" });
  logCall(
    db,
    companyId,
    {
      leadId: school.id,
      outcome: "spoke",
      interest: 4,
      notes: "Wants a pilot.",
      answers: [{ question: "How many students?", answer: "900" }],
      scriptId: script.id,
    },
    now,
  );
  createTask(db, companyId, taskInput.parse({ leadId: school.id, title: "Send the pilot plan", kind: "email", dueOn: "2026-09-18" }));
  const invoice = saveInvoice(db, companyId, null, {
    leadId: school.id,
    issuedOn: "2026-09-01",
    dueOn: "2026-09-10",
    notes: null,
    lines: [{ description: "Workshop", quantity: 1, unitPrice: 15000 }],
  });
  setInvoiceStatus(db, companyId, invoice.id, "sent");
  recordBalance(db, companyId, { amount: 250000, asOf: "2026-09-15" }, now);
  createNote(db, companyId, "Ask the trust about a second campus", "2026-09-16");
});

describe("the dossier", () => {
  it("is four documents, each saying what it is", () => {
    const docs = buildDossier(db, companyId, { secrets: false }, now);
    expect(docs.map((doc) => doc.file)).toEqual([
      "00 Unifloe - read me first.md",
      "01 Unifloe - the company.md",
      "02 Unifloe - customers and sales.md",
      "03 Unifloe - people and running the company.md",
    ]);
    const [readme] = docs;
    expect(readme?.text).toContain("# Unifloe: read me first");
    expect(readme?.text).toContain("Money is in INR");
    expect(readme?.text).toContain("Open deals: 2, worth INR 50,000.");
  });

  it("carries the catalogue, with each price book and what it has brought in", async () => {
    const { newProduct, newPrice } = await import("./products");
    const workshop = newProduct(
      db,
      companyId,
      { name: "Attendance workshop", unit: "workshop", cost: 4000, notes: "## Who it is for\n\nPrincipals." },
      now,
    ).product;
    newPrice(db, workshop.id, { name: "List", amount: 15000 }, now);
    newPrice(db, workshop.id, { name: "Schools", amount: 12000, validFrom: "2026-09-01" }, now);
    const text = buildDossier(db, companyId, { secrets: false }, now)[1]!.text;
    expect(text).toContain("## What we sell");
    expect(text).toContain("| Attendance workshop | Service, per workshop | Selling | INR 12,000 one-off (Schools) | INR 4,000 | 67% | Nothing |");
    expect(text).toContain("- Schools: INR 12,000 one-off (from 2026-09-01)");
    expect(text).toContain("#### Who it is for");
  });

  it("carries the company, its money and its runway, with numbers masked", () => {
    const text = buildDossier(db, companyId, { secrets: false }, now)[1]!.text;
    expect(text).toContain("- **One-liner:** Timetables that write themselves");
    expect(text).toContain("•••• 876K");
    expect(text).not.toContain("AAACU9876K");
    expect(text).toContain("| unifloe.in | Domain | Yearly | INR 1,200 | INR 100 | 2027-07-14 |");
    expect(text).toContain("INR 2,50,000 in the bank on 2026-09-15");
    expect(text).toMatch(/\| INV-0001 \| Oakridge \| Oakridge \| 2026-09-01 \| 2026-09-10 \(overdue\) \| INR 15,000 \|/);

    const full = buildDossier(db, companyId, { secrets: true }, now)[1]!.text;
    expect(full).toContain("AAACU9876K");
  });

  it("tells each contact's story, and lists the quiet ones briefly", () => {
    const text = buildDossier(db, companyId, { secrets: false }, now)[2]!.text;
    const oakridge = text.slice(text.indexOf("### Oakridge"), text.indexOf("### Everyone else"));
    expect(oakridge).toContain("- **City:** Bengaluru");
    expect(oakridge).toContain("> Call before 10am.");
    expect(oakridge).toContain("- Oakridge - New, INR 50,000");
    expect(oakridge).toContain("**Calls:** 1 from the prompter, 1 answered; interest when last spoken to: Interested (4 of 5).");
    expect(oakridge).toContain("- INV-0001, 2026-09-01: INR 15,000, Sent");
    expect(oakridge).toContain("- 2026-09-18: Send the pilot plan (Email)");
    expect(oakridge).toContain("Call: Spoke to them · Interested (4 of 5)");
    expect(oakridge).toContain("  How many students?");
    // Quiet Academy has nothing but a deal it was given as a prospect, so it is in play too.
    expect(text).toContain("### Quiet Academy");
    expect(text).toContain("- 1 call; 1 answered (100%).");
    expect(text).toContain("- Interest when answered: Interested 1.");
    expect(text).toContain("| New | 2 | INR 50,000 |");
  });

  it("puts a page's own headings under its title, and writes links as names", () => {
    const sales = buildDossier(db, companyId, { secrets: false }, now)[2]!.text;
    expect(sales).toContain("### Schools script");
    expect(sales).toContain("#### Opening");
    expect(sales).toContain("##### Deeper");

    const running = buildDossier(db, companyId, { secrets: false }, now)[3]!.text;
    expect(running).toContain("We chose it after *Schools script* with **Oakridge**.");
    expect(running).toContain("- 2026-09-16: Ask the trust about a second campus");
    expect(running).toContain("| 2026-09-18 | Send the pilot plan | Email | Oakridge |");
    expect(running).toContain("## Meetings\n\n*Nothing written here yet.*");
  });

  it("lists a contact with nothing going on as a line, not a section", () => {
    createLead(db, companyId, leadInput.parse({ name: "Printer", relationship: "vendor", city: "Pune" }));
    const text = buildDossier(db, companyId, { secrets: false }, now)[2]!.text;
    expect(text).not.toContain("### Printer");
    expect(text).toContain("| Printer | Vendor | Pune |  |");
  });

  it("is written to a folder of its own", () => {
    const parent = mkdtempSync(join(tmpdir(), "caulder-dossier-"));
    try {
      const result = exportDossier(db, companyId, "Unifloe", parent, { secrets: false }, now);
      expect(result.files).toBe(4);
      expect(readdirSync(result.folder)).toHaveLength(4);
      expect(readFileSync(join(result.folder, "02 Unifloe - customers and sales.md"), "utf8")).toContain("## The funnel");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
