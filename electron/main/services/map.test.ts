import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Links and the Map from main's side: what a save records, what a page and a
 * contact are told links to them, what the picker offers, and the graph the
 * Map draws.
 */

vi.mock("./secrets", () => ({
  isSealed: () => false,
  sealSecret: () => {
    throw new Error("No secrets in these tests.");
  },
  openSecret: () => null,
}));

const brain = await import("./brain");
const map = await import("./map");
const { exportBrain } = await import("./brain-export");
const { migrate } = await import("../db/migrations");
const { createCompany } = await import("../repositories/companies");
const { createLead, deleteLead, updateLead } = await import("../repositories/leads");
const { leadInput } = await import("@shared/domain");
const { linkToken } = await import("@shared/links");

const NOW = new Date("2026-09-17T06:00:00.000Z");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

let db: Database.Database;
let companyId: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
});

function page(title: string, section: Parameters<typeof brain.newPage>[2] = "plan", at: Date = NOW) {
  const made = brain.newPage(db, companyId, section, "page", at);
  return brain.savePage(db, made.id, { title, body: "", fields: {}, baseRevision: made.revision }, at);
}

function write(id: string, body: string, at: Date = later(10)) {
  const current = brain.getPage(db, id);
  return brain.savePage(db, id, { title: current.title, body, fields: {}, baseRevision: current.revision }, at);
}

const to = (kind: "page" | "contact", id: string, label = "x") => linkToken(label, { kind, id });

describe("writing links", () => {
  it("records what a page links to, and tells the page each target's current name", () => {
    const pricing = page("Pricing");
    const school = createLead(db, companyId, leadInput.parse({ name: "Oakridge" }));
    const plan = page("Plan");

    const saved = write(plan.id, `See ${to("page", pricing.id, "Old name")} and ${to("contact", school.id)}.`);
    expect(saved.links).toEqual({
      [`page:${pricing.id}`]: { name: "Pricing", kind: "page" },
      [`contact:${school.id}`]: { name: "Oakridge", kind: "contact" },
    });

    updateLead(db, school.id, leadInput.parse({ name: "Oakridge International" }));
    expect(brain.getPage(db, plan.id).links[`contact:${school.id}`]?.name).toBe("Oakridge International");
  });

  it("ignores links to itself, to nothing, and to another company", () => {
    const plan = page("Plan");
    const other = createCompany(db, { name: "PaperKite", accent: "teal", timezone: "Asia/Kolkata" }).id;
    const theirs = createLead(db, other, leadInput.parse({ name: "Theirs" }));
    write(
      plan.id,
      `${to("page", plan.id)} ${to("page", "00000000-0000-4000-8000-000000000000")} ${to("contact", theirs.id)}`,
    );
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM brain_links`).get() as { n: number };
    expect(rows.n).toBe(0);
  });

  it("keeps when a link was first made, and forgets one taken out", () => {
    const pricing = page("Pricing");
    const plan = page("Plan");
    write(plan.id, to("page", pricing.id), later(10));
    write(plan.id, `${to("page", pricing.id)} again`, later(60));
    const made = db.prepare(`SELECT created_at FROM brain_links`).get() as { created_at: string };
    expect(made.created_at).toBe(later(10).toISOString());

    write(plan.id, "No links now", later(120));
    expect(map.backlinks(db, "page", pricing.id)).toEqual([]);
  });

  it("says which pages link here, for a page and for a contact", () => {
    const school = createLead(db, companyId, leadInput.parse({ name: "Oakridge" }));
    const pricing = page("Pricing");
    const plan = page("Plan");
    const call = page("Call notes", "meetings");
    write(plan.id, `${to("page", pricing.id)} ${to("contact", school.id)}`);
    write(call.id, to("contact", school.id), later(20));

    expect(map.backlinks(db, "page", pricing.id).map((p) => p.title)).toEqual(["Plan"]);
    expect(map.backlinks(db, "contact", school.id).map((p) => p.title)).toEqual(["Call notes", "Plan"]);
    expect(() => map.backlinks(db, "invoice", "x")).toThrow("a product, a person or a document");
  });

  it("lets a deleted target go, and leaves the words in the text", () => {
    const school = createLead(db, companyId, leadInput.parse({ name: "Oakridge" }));
    const pricing = page("Pricing");
    const plan = page("Plan");
    write(plan.id, `${to("page", pricing.id, "Pricing")} for ${to("contact", school.id, "Oakridge")}`);

    brain.removePage(db, pricing.id);
    deleteLead(db, school.id);

    const after = brain.getPage(db, plan.id);
    expect(after.links).toEqual({});
    expect(after.body).toContain("Pricing");
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM brain_links`).get() as { n: number };
    expect(rows.n).toBe(0);
  });
});

describe("what [[ offers", () => {
  it("offers pages and contacts, names that start with the text first", () => {
    page("School pricing", "plan", NOW);
    page("Scholarships", "plan", later(5));
    createLead(db, companyId, leadInput.parse({ name: "Oakridge School" }));
    // Both pages start with the text; the one written last comes first.
    expect(map.linkTargetsFor(db, companyId, "sch").map((t) => `${t.kind}:${t.name}`)).toEqual([
      "page:Scholarships",
      "page:School pricing",
      "contact:Oakridge School",
    ]);
  });

  it("leaves out archived pages, and reads % as a character", () => {
    const old = page("Old plan");
    brain.archivePage(db, old.id, true, NOW);
    page("50% discount");
    expect(map.linkTargetsFor(db, companyId, "old")).toEqual([]);
    expect(map.linkTargetsFor(db, companyId, "50%").map((t) => t.name)).toEqual(["50% discount"]);
  });
});

describe("the map", () => {
  it("draws every page, and only the contacts something links to", () => {
    const linked = createLead(db, companyId, leadInput.parse({ name: "Linked" }));
    createLead(db, companyId, leadInput.parse({ name: "Loose" }));
    const plan = page("Plan");
    const pricing = page("Pricing", "products");
    write(plan.id, `${to("page", pricing.id)} ${to("contact", linked.id)}`);

    const graph = map.wholeMap(db, companyId, false);
    expect(graph.nodes.map((n) => `${n.kind}:${n.label}:${n.degree}`).sort()).toEqual([
      "contact:Linked:1",
      "page:Plan:2",
      "page:Pricing:1",
    ]);
    expect(graph.links).toHaveLength(2);

    expect(map.wholeMap(db, companyId, true).nodes.map((n) => n.label)).toContain("Loose");
  });

  it("keeps where dots were left, and lets go of the pinned ones", () => {
    const plan = page("Plan");
    map.keepPositions(db, companyId, [
      { key: `page:${plan.id}`, x: 12.5, y: -4, pinned: true },
      { key: "page:not-a-real-key", x: 1, y: 1, pinned: false },
      { key: `page:${plan.id}`, x: Number.NaN, y: 1 },
    ]);
    const [dot] = map.wholeMap(db, companyId, false).nodes;
    expect(dot).toMatchObject({ x: 12.5, y: -4, pinned: true });

    map.letGo(db, companyId);
    expect(map.wholeMap(db, companyId, false).nodes[0]?.pinned).toBe(false);
    const stored = db.prepare(`SELECT COUNT(*) AS n FROM map_positions`).get() as { n: number };
    expect(stored.n).toBe(1);

    brain.removePage(db, plan.id);
    const left = db.prepare(`SELECT COUNT(*) AS n FROM map_positions`).get() as { n: number };
    expect(left.n).toBe(0);
  });

  it("gives a page its neighbours two lines out", () => {
    const a = page("A");
    const b = page("B");
    const c = page("C");
    const d = page("D");
    write(a.id, to("page", b.id));
    write(b.id, to("page", c.id));
    write(c.id, to("page", d.id));
    expect(map.localMap(db, companyId, "page", a.id).nodes.map((n) => n.label).sort()).toEqual(["A", "B", "C"]);
  });
});

describe("links outside the app", () => {
  it("export as relative links, and a search snippet shows the words", () => {
    const school = createLead(db, companyId, leadInput.parse({ name: "Oakridge" }));
    const pricing = page("Pricing", "products");
    const plan = page("Plan");
    write(plan.id, `Quote ${to("page", pricing.id, "old")} to ${to("contact", school.id, "old")} soon`);

    const parent = mkdtempSync(join(tmpdir(), "caulder-links-"));
    try {
      const result = exportBrain(db, companyId, "Unifloe", parent, { secrets: false }, NOW);
      const text = readFileSync(join(result.folder, "02 Plan", "Plan.md"), "utf8");
      expect(text).toContain("Quote [Pricing](../03%20Products%20and%20pricing/Pricing.md) to **Oakridge** soon");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }

    const [hit] = brain.search(db, companyId, "quote");
    expect(hit?.detail).not.toContain("[[");
    expect(hit?.detail).toContain("old");
  });
});

describe("one connected brain", () => {
  it("links a page to a product, a person and a document, and each knows it", async () => {
    const { newProduct } = await import("./products");
    const { addPerson } = await import("./people");
    const { recordDocument } = await import("../repositories/documents");
    const workshop = newProduct(db, companyId, { name: "Attendance workshop" }, NOW).product;
    const asha = addPerson(db, companyId, { name: "Asha Rao", kind: "founder" }, NOW).person;
    const deck = recordDocument(db, companyId, { name: "Seed deck", category: "pitch-deck", location: "Drive" }, null, NOW);

    const plan = page("Plan");
    const saved = write(
      plan.id,
      `${linkToken("x", { kind: "product", id: workshop.id })} by ${linkToken("x", { kind: "person", id: asha.id })}, in ${linkToken("x", { kind: "document", id: deck.id })}`,
    );
    expect(saved.links).toEqual({
      [`product:${workshop.id}`]: { name: "Attendance workshop", kind: "product" },
      [`person:${asha.id}`]: { name: "Asha Rao", kind: "person" },
      [`document:${deck.id}`]: { name: "Seed deck", kind: "document" },
    });
    expect(map.backlinks(db, "person", asha.id).map((row) => row.title)).toEqual(["Plan"]);
    expect(map.linkTargetsFor(db, companyId, "Ash")).toEqual([
      expect.objectContaining({ kind: "person", name: "Asha Rao", detail: "Founder" }),
    ]);

    // Deleting what a link points at leaves the words, and takes the line off the Map.
    db.prepare(`DELETE FROM products WHERE id = ?`).run(workshop.id);
    expect(brain.getPage(db, plan.id).links[`product:${workshop.id}`]).toBeUndefined();
    expect(db.prepare(`SELECT COUNT(*) AS n FROM brain_links WHERE to_kind = 'product'`).get()).toEqual({ n: 0 });
  });

  it("draws the links the tables already know: a person who is a contact, a buyer, whose a document is", async () => {
    const { newProduct } = await import("./products");
    const { addPerson } = await import("./people");
    const { recordDocument } = await import("../repositories/documents");
    const { saveInvoice, setInvoiceStatus } = await import("../repositories/money");
    const school = createLead(db, companyId, leadInput.parse({ name: "Oakridge" }));
    const advisor = createLead(db, companyId, leadInput.parse({ name: "Meera Iyer" }));
    createLead(db, companyId, leadInput.parse({ name: "Loose" }));
    const workshop = newProduct(db, companyId, { name: "Workshop" }, NOW).product;
    addPerson(db, companyId, { name: "Meera", kind: "advisor", leadId: advisor.id }, NOW);
    addPerson(db, companyId, { name: "Kiran", kind: "candidate" }, NOW);
    recordDocument(db, companyId, { name: "Oakridge contract", category: "contract", location: "Drive", leadId: school.id }, null, NOW);
    recordDocument(db, companyId, { name: "Invoice 7", category: "invoice-sent", location: "Drive", leadId: school.id }, null, NOW);
    const invoice = saveInvoice(db, companyId, null, {
      leadId: school.id,
      issuedOn: "2026-09-01",
      dueOn: "2026-09-15",
      notes: null,
      lines: [{ description: "Workshop", quantity: 1, unitPrice: 15000, productId: workshop.id }],
    });
    setInvoiceStatus(db, companyId, invoice.id, "sent");

    const graph = map.wholeMap(db, companyId, false);
    const edges = graph.links
      .map((link) => [link.source, link.target].map((key) => graph.nodes.find((node) => node.key === key)?.label).sort().join(" - "))
      .sort();
    expect(edges).toEqual(["Meera - Meera Iyer", "Oakridge - Oakridge contract", "Oakridge - Workshop"]);
    // A candidate nobody wrote about, a sent invoice and a contact nothing reaches stay off.
    const labels = graph.nodes.map((node) => node.label);
    expect(labels).not.toContain("Kiran");
    expect(labels).not.toContain("Invoice 7");
    expect(labels).not.toContain("Loose");
    expect(graph.links.find((link) => link.source.startsWith("product:"))?.createdAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("reaches one to three links out on a local map", () => {
    const a = page("A");
    const b = page("B");
    const c = page("C");
    const d = page("D");
    write(a.id, to("page", b.id));
    write(b.id, to("page", c.id));
    write(c.id, to("page", d.id));
    const count = (depth: number) => map.localMap(db, companyId, "page", a.id, depth).nodes.length;
    expect([count(1), count(2), count(3)]).toEqual([2, 3, 4]);
    expect(map.localMap(db, companyId, "page", a.id, 9).nodes).toHaveLength(3);
  });
});
