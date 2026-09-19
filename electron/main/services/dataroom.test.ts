import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The data room and the handbook (PLAN.md, phase 13): what an investor opens
 * and what somebody joining reads. Checked as the text each would read -
 * the index, a page, the handbook's HTML - since the zip and the printer only
 * package it (the zip is tested on its own in zip.test.ts).
 */

vi.mock("./secrets", () => ({
  isSealed: (value: unknown) => typeof value === "object" && value !== null && "$secret" in value,
  sealSecret: (text: string) => ({ $secret: `sealed:${text}`, last4: text.slice(-4) }),
  openSecret: (sealed: { $secret: string }) => sealed.$secret.replace(/^sealed:/, ""),
}));

const { dataRoomContents, handbookHtml, roomChoices, writeZip } = await import("./dataroom");
const brain = await import("./brain");
const { migrate } = await import("../db/migrations");
const { createCompany } = await import("../repositories/companies");
const { createLead } = await import("../repositories/leads");
const { recordDocument } = await import("../repositories/documents");
const { addPerson } = await import("./people");
const { newProduct, newPrice } = await import("./products");
const { leadInput } = await import("@shared/domain");
const { linkToken } = await import("@shared/links");

const now = new Date("2026-09-18T06:00:00.000Z");

let db: Database.Database;
let companyId: string;
let store: string;

function write(section: string, template: string, title: string, body: string, fields: Record<string, unknown> = {}, secrets: Record<string, string> = {}) {
  const page = brain.newPage(db, companyId, section, template, now);
  return brain.savePage(db, page.id, { title, body, fields, secrets, baseRevision: page.revision }, now);
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
  store = mkdtempSync(join(tmpdir(), "caulder-store-"));
  return () => rmSync(store, { recursive: true, force: true });
});

function room(input: Record<string, unknown>) {
  const contents = dataRoomContents(db, companyId, { sections: [], categories: [], extras: [], ...input }, store, now);
  const text = (name: string) => {
    const file = contents.files.find((each) => each.name === name);
    if (!file || !("text" in file)) throw new Error(`No ${name} in ${contents.files.map((each) => each.name).join(", ")}`);
    return file.text;
  };
  return { ...contents, text };
}

describe("the data room", () => {
  it("offers the company's sections, the kinds of document and the tables, with how much of each", () => {
    write("plan", "goal", "Forty schools", "By March.");
    recordDocument(db, companyId, { name: "GST certificate", category: "certificate", location: "Drive" }, null, now);
    addPerson(db, companyId, { name: "Asha", kind: "founder", equity: 50 }, now);
    const choices = roomChoices(db, companyId, now);
    expect(choices.company).toBe("Unifloe");
    expect(choices.sections.find((section) => section.id === "plan")?.pages).toBe(1);
    expect(choices.categories.find((category) => category.id === "certificate")).toMatchObject({ files: 0, written: 1 });
    expect(choices.extras.people).toBe(1);
  });

  it("writes an index and a page per page, linked to each other, with numbers masked", () => {
    const profile = write(
      "company",
      "profile",
      "Company profile",
      "## The pitch\n\nAttendance for schools.",
      { legalName: "Unifloe Private Limited", oneLiner: "Attendance that takes itself", incorporatedOn: "2025-01-15" },
      { pan: "ABCDE1234F" },
    );
    const school = createLead(db, companyId, leadInput.parse({ name: "Oakridge School" }));
    write(
      "plan",
      "lean-plan",
      "One-page plan",
      `## Customer\n\nSchools like ${linkToken("Oakridge", { kind: "contact", id: school.id })}, described in ${linkToken("the profile", { kind: "page", id: profile.id })}.\n\n- [x] Pilot\n- [ ] Forty schools`,
    );
    write("ideas", "idea", "Parent app", "Later.");

    const out = room({ sections: ["company", "plan"] });
    expect(out.pages).toBe(2);
    const names = out.files.map((file) => file.name);
    expect(names).toContain("pages/01 Company/Company profile.html");
    expect(names).toContain("pages/02 Plan/One-page plan.html");
    expect(names.some((name) => name.includes("Parent app"))).toBe(false);

    const index = out.text("index.html");
    expect(index).toContain("<h1>Unifloe Private Limited data room</h1>");
    expect(index).toContain("Attendance that takes itself");
    expect(index).toContain("Prepared 18 September 2026.");
    expect(index).toContain("Registration and account numbers are masked.");
    expect(index).toContain('href="pages/02%20Plan/One-page%20plan.html"');

    const profileHtml = out.text("pages/01 Company/Company profile.html");
    expect(profileHtml).toContain("•••• 234F");
    expect(profileHtml).not.toContain("ABCDE1234F");
    expect(profileHtml).toContain("15 January 2025");
    expect(profileHtml).toContain('href="../../index.html"');

    const plan = out.text("pages/02 Plan/One-page plan.html");
    // A page in the room is a link; a contact is a name.
    expect(plan).toContain('<a href="../01%20Company/Company%20profile.html">Company profile</a>');
    expect(plan).toContain("<strong>Oakridge School</strong>");
    expect(plan).toContain('<span class="tick">☑</span> Pilot');
  });

  it("shows numbers in full only when asked", () => {
    write("company", "profile", "Company profile", "", {}, { pan: "ABCDE1234F" });
    expect(room({ sections: ["company"], secrets: true }).text("pages/01 Company/Company profile.html")).toContain("ABCDE1234F");
  });

  it("escapes what a page says, so nothing in it becomes markup", () => {
    write("plan", "page", "<script>alert(1)</script>", "A <b>bold</b> claim & [a link](javascript:alert(1))");
    const out = room({ sections: ["plan"] });
    const html = out.text(out.files[1]?.name ?? "");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).not.toContain('href="javascript');
  });

  it("copies stored documents in, lists written-down ones with where they are, and says which files are missing", () => {
    writeFileSync(join(store, "abc.pdf"), "%PDF-deck");
    recordDocument(db, companyId, { name: "Seed deck.pdf", category: "pitch-deck" }, { stored: "abc.pdf", bytes: 9 }, now);
    recordDocument(db, companyId, { name: "Old deck.pdf", category: "pitch-deck" }, { stored: "gone.pdf", bytes: 9 }, now);
    recordDocument(db, companyId, { name: "Lease", category: "agreement", location: "The blue folder", expiresOn: "2027-03-31" }, null, now);
    recordDocument(db, companyId, { name: "Passport", category: "identity", location: "Safe" }, null, now);

    const out = room({ categories: ["pitch-deck", "agreement"] });
    expect(out.documents).toBe(1);
    expect(out.missing).toBe(1);
    const deck = out.files.find((file) => file.name.startsWith("documents/"));
    expect(deck).toMatchObject({ name: "documents/07 Pitch deck/Seed deck.pdf" });
    const index = out.text("index.html");
    expect(index).toContain("Kept at The blue folder");
    expect(index).toContain("31 March 2027");
    expect(index).toContain("The file is missing from this computer");
    expect(index).not.toContain("Passport");

    const folder = mkdtempSync(join(tmpdir(), "caulder-room-"));
    try {
      const path = join(folder, "room.zip");
      const bytes = writeZip(out, path, now);
      const zip = readFileSync(path);
      expect(zip.length).toBe(bytes);
      expect(zip.includes(Buffer.from("documents/07 Pitch deck/Seed deck.pdf"))).toBe(true);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("carries the people with their equity, and the catalogue with what it brought in", () => {
    addPerson(db, companyId, { name: "Asha", kind: "founder", role: "CEO", equity: 50, owns: "Sales", startsOn: "2025-01-15" }, now);
    addPerson(db, companyId, { name: "Kiran", kind: "candidate" }, now);
    const workshop = newProduct(db, companyId, { name: "Attendance workshop", unit: "workshop" }, now).product;
    newPrice(db, workshop.id, { name: "List", amount: 15000 }, now);

    const index = room({ extras: ["people", "products"] }).text("index.html");
    expect(index).toContain("People and equity");
    expect(index).toContain("<td>Asha</td><td>CEO</td><td>Founder</td><td>15 January 2025</td><td>50%</td><td>Sales</td>");
    expect(index).not.toContain("Kiran");
    expect(index).toContain("Attendance workshop");
    expect(index).toMatch(/15,000 one-off/);
  });

  it("refuses to make an empty one", () => {
    expect(() => room({})).toThrow("Tick something");
  });
});

describe("the handbook", () => {
  it("prints the chosen sections as chapters, links between them as anchors, and who is who without anyone's equity", () => {
    const playbook = write("playbooks", "playbook", "Onboarding a school", "## Steps\n\n- [ ] Call the principal");
    write("tools", "tool", "Notion", `Where the docs live. See ${linkToken("onboarding", { kind: "page", id: playbook.id })}.`, {
      cost: 800,
      cycle: "monthly",
    });
    write("money", "budget", "Budget", "Private.");
    addPerson(db, companyId, { name: "Asha", kind: "founder", role: "CEO", equity: 50, owns: "Sales" }, now);

    const book = handbookHtml(db, companyId, { sections: ["playbooks", "tools"], extras: ["people", "metrics"] }, now);
    expect(book.pages).toBe(2);
    expect(book.title).toBe("Unifloe handbook");
    expect(book.html).toContain('<p class="what">Company handbook</p>');
    expect(book.html).toContain('<section class="chapter" id="chapter-1"><h1>Playbooks</h1>');
    expect(book.html).toContain(`<a href="#page-${playbook.id}">Onboarding a school</a>`);
    expect(book.html).toContain("Who is who");
    expect(book.html).toContain("Sales");
    expect(book.html).not.toContain("50%");
    expect(book.html).not.toContain("Budget");
    // A handbook has no metrics table, whatever is asked.
    expect(book.html).not.toContain("Metrics");
  });

  it("says what to tick when there is nothing to print", () => {
    expect(() => handbookHtml(db, companyId, { sections: ["plan"] }, now)).toThrow("Tick a section with pages");
  });
});
