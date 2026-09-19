import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The brain, from main's side: pages, secrets, revisions, the checklist, the
 * search index the triggers keep, filing a note, the invoice's header and the
 * Markdown export.
 *
 * The OS encryption is replaced by a stand-in that reverses cleanly, so what
 * is checked is that a secret is sealed before it is stored and only opened
 * when asked for - never what the OS does with it.
 */

let canEncrypt = true;
vi.mock("./secrets", () => ({
  isSealed: (value: unknown) => typeof value === "object" && value !== null && "$secret" in value,
  sealSecret: (text: string) => {
    if (!canEncrypt) throw new Error("Windows will not encrypt stored secrets on this machine.");
    return { $secret: `sealed:${[...text].reverse().join("")}`, last4: text.replace(/\s+/g, "").slice(-4) };
  },
  openSecret: (sealed: { $secret: string }) =>
    canEncrypt ? [...sealed.$secret.replace(/^sealed:/, "")].reverse().join("") : null,
}));

const brain = await import("./brain");
const { exportBrain } = await import("./brain-export");
const { migrate } = await import("../db/migrations");
const { createCompany, deleteCompany } = await import("../repositories/companies");
const { createLead, deleteLead, logActivity } = await import("../repositories/leads");
const { createNote, listNotes } = await import("../repositories/notes");
const { saveInvoice } = await import("../repositories/money");
const { leadInput } = await import("@shared/domain");
const { templateOf } = await import("@shared/brain");
const { MARK_CLOSE, MARK_OPEN } = await import("@shared/search");

const NOW = new Date("2026-09-17T06:00:00.000Z");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

let db: Database.Database;
let companyId: string;

beforeEach(() => {
  canEncrypt = true;
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
});

function save(id: string, input: Record<string, unknown>, at: Date = NOW) {
  const page = brain.getPage(db, id);
  return brain.savePage(
    db,
    id,
    { title: page.title, body: page.body, fields: page.fields, baseRevision: page.revision, ...input },
    at,
  );
}

describe("making pages", () => {
  it("starts a page from its template's title and prompts", () => {
    const page = brain.newPage(db, companyId, "decisions", "decision", NOW);
    expect(page).toMatchObject({ section: "decisions", template: "decision", title: "Decision", revision: 1 });
    expect(page.body).toContain("## What we decided");
  });

  it("opens the one profile a company has, even from the archive", () => {
    const first = brain.newPage(db, companyId, "company", "profile", NOW);
    brain.archivePage(db, first.id, true, NOW);
    const again = brain.newPage(db, companyId, "company", "profile", NOW);
    expect(again.id).toBe(first.id);
    expect(again.isArchived).toBe(false);
  });

  it("refuses a template in the wrong section, and a section that does not exist", () => {
    expect(() => brain.newPage(db, companyId, "ideas", "bank", NOW)).toThrow("does not belong");
    expect(() => brain.newPage(db, companyId, "secrets", "page", NOW)).toThrow("not a section");
    expect(brain.newPage(db, companyId, "legal", "page", NOW).title).toBe("Untitled");
  });
});

describe("saving", () => {
  it("keeps checked fields and drops what the template does not define", () => {
    const page = brain.newPage(db, companyId, "company", "profile", NOW);
    const saved = save(page.id, { fields: { legalName: " Unifloe Pvt Ltd ", made: "up" } });
    expect(saved.fields).toEqual({ legalName: "Unifloe Pvt Ltd" });
    expect(saved.revision).toBe(2);
  });

  it("seals a secret, shows only its mask, and keeps it when the window says nothing of it", () => {
    const page = brain.newPage(db, companyId, "company", "profile", NOW);
    const saved = save(page.id, { secrets: { pan: "ABCDE1234F" } });
    expect(saved.secrets).toEqual({ pan: "•••• 234F" });
    expect(JSON.stringify(saved)).not.toContain("ABCDE1234F");

    const stored = db.prepare(`SELECT fields FROM brain_pages WHERE id = ?`).get(page.id) as { fields: string };
    expect(stored.fields).not.toContain("ABCDE1234F");

    const edited = save(page.id, { title: "Profile" }, later(10));
    expect(edited.secrets).toEqual({ pan: "•••• 234F" });
    expect(brain.revealSecret(db, page.id, "pan")).toBe("ABCDE1234F");

    const cleared = save(page.id, { secrets: { pan: null } }, later(20));
    expect(cleared.secrets).toEqual({});
  });

  it("will not reveal a field that is not a secret", () => {
    const page = brain.newPage(db, companyId, "company", "profile", NOW);
    save(page.id, { fields: { gstin: "29ABCDE1234F1Z5" } });
    expect(() => brain.revealSecret(db, page.id, "gstin")).toThrow("not a secret");
    expect(() => brain.revealSecret(db, page.id, "pan")).toThrow("No Tax ID is saved");
  });

  it("refuses to store a secret when the machine cannot encrypt", () => {
    canEncrypt = false;
    const page = brain.newPage(db, companyId, "company", "bank", NOW);
    expect(() => save(page.id, { secrets: { number: "001234567890" } })).toThrow("will not encrypt");
    expect(brain.getPage(db, page.id).revision).toBe(1);
  });

  it("refuses an edit made on top of an older revision", () => {
    const page = brain.newPage(db, companyId, "plan", "risk", NOW);
    save(page.id, { body: "One" });
    expect(() =>
      brain.savePage(db, page.id, { title: "Risk", body: "Two", fields: {}, baseRevision: 1 }, later(1)),
    ).toThrow("changed since you opened it");
  });

  it("writes nothing when nothing changed", () => {
    const page = brain.newPage(db, companyId, "plan", "risk", NOW);
    expect(save(page.id, {}).revision).toBe(1);
  });
});

describe("history", () => {
  it("keeps the starting point, and folds saves minutes apart into one version", () => {
    const page = brain.newPage(db, companyId, "playbooks", "playbook", NOW);
    save(page.id, { body: "Draft one" }, later(1));
    save(page.id, { body: "Draft two" }, later(2));
    save(page.id, { body: "Draft three" }, later(3));
    save(page.id, { body: "Next day" }, later(60 * 24));

    const revisions = brain.pageRevisions(db, page.id);
    expect(revisions.map((revision) => revision.body)).toEqual([
      "Next day",
      "Draft three",
      "## When to use it\n\n\n## Steps\n\n- [ ] \n- [ ] \n- [ ] \n",
    ]);
    expect(revisions.map((revision) => revision.revision)).toEqual([5, 4, 1]);
  });

  it("keeps the version being put aside, however soon after it the old one comes back", () => {
    const page = brain.newPage(db, companyId, "plan", "risk", NOW);
    save(page.id, { body: "Oakridge might not renew" }, later(1));
    brain.restoreRevision(db, page.id, 1, later(2));
    const blank = templateOf("risk").body;
    expect(brain.pageRevisions(db, page.id).map((revision) => revision.body)).toEqual([
      blank,
      "Oakridge might not renew",
      blank,
    ]);
  });

  it("puts an old version back as the newest, secrets and all", () => {
    const page = brain.newPage(db, companyId, "company", "bank", NOW);
    save(page.id, { body: "Old", secrets: { number: "001234567890" } }, later(1));
    save(page.id, { body: "New", secrets: { number: "009999999999" } }, later(60));

    const restored = brain.restoreRevision(db, page.id, 2, later(120));
    expect(restored.body).toBe("Old");
    expect(restored.revision).toBe(4);
    expect(brain.revealSecret(db, page.id, "number")).toBe("001234567890");
    expect(brain.pageRevisions(db, page.id)[0]?.body).toBe("Old");
  });
});

describe("the home page", () => {
  it("shows the company card with numbers masked, and ticks what is written", () => {
    const profile = brain.newPage(db, companyId, "company", "profile", NOW);
    save(profile.id, {
      fields: { oneLiner: "Timetables for schools", entityType: "llp", gstin: "29ABCDE1234F1Z5" },
      secrets: { pan: "ABCDE1234F" },
    });
    brain.pinPage(db, profile.id, true);

    const home = brain.brainHome(db, companyId, NOW);
    expect(home.company).toEqual({
      name: "Unifloe",
      profileId: profile.id,
      oneLiner: "Timetables for schools",
      entityType: "LLP",
      numbers: [
        { label: "PAN", value: "•••• 234F" },
        { label: "GSTIN", value: "29ABCDE1234F1Z5" },
      ],
    });
    expect(home.checklist.filter((item) => item.done).map((item) => item.id)).toEqual(["one-liner", "numbers"]);
    expect(home.pinned.map((page) => page.id)).toEqual([profile.id]);
    expect(home.counts.company).toBe(1);
  });
});

describe("searching everything", () => {
  const titles = (text: string) => brain.search(db, companyId, text).map((hit) => `${hit.kind}:${hit.title}`);

  it("finds a page by its text and its fields, but never by a secret", () => {
    const page = brain.newPage(db, companyId, "company", "profile", NOW);
    save(page.id, {
      body: "We sell timetables",
      fields: { gstin: "29ABCDE1234F1Z5" },
      secrets: { pan: "ZZZZZ9999Z" },
    });
    expect(titles("timetab")).toEqual(["page:Company profile"]);
    expect(titles("29ABCDE1234F1Z5")).toEqual(["page:Company profile"]);
    expect(titles("ZZZZZ9999Z")).toEqual([]);
    expect(titles("sealed")).toEqual([]);
  });

  it("finds contacts, notes, history and invoices, each saying what it is", () => {
    const lead = createLead(db, companyId, leadInput.parse({ name: "Oakridge School", city: "Mysuru" }));
    createNote(db, companyId, "Ask Oakridge about the Mysuru branch", "2026-09-17");
    logActivity(db, { leadId: lead.id, kind: "call", body: "Mysuru principal wants a demo" });
    saveInvoice(db, companyId, null, {
      leadId: lead.id,
      issuedOn: "2026-09-17",
      dueOn: "2026-09-30",
      notes: null,
      lines: [{ description: "Mysuru workshop", quantity: 1, unitPrice: 15000 }],
    });

    const hits = brain.search(db, companyId, "mysuru");
    expect(hits.map((hit) => hit.kind).sort()).toEqual(["contact", "history", "invoice", "note"]);
    expect(hits.find((hit) => hit.kind === "history")).toMatchObject({
      title: "Oakridge School · Call",
      leadId: lead.id,
    });
    expect(hits.find((hit) => hit.kind === "invoice")?.title).toBe("INV-0001 · Oakridge School");
    expect(hits.find((hit) => hit.kind === "contact")?.detail).toContain(`${MARK_OPEN}Mysuru${MARK_CLOSE}`);
  });

  it("shows a page's words in its snippet, not its markup", () => {
    const page = brain.newPage(db, companyId, "playbooks", "playbook", NOW);
    save(page.id, { body: "## Steps\n\n- [x] Send the **welcome** pack\n- [ ] Book the call" });
    const [hit] = brain.search(db, companyId, "welcome");
    expect(hit?.detail.replaceAll(MARK_OPEN, "").replaceAll(MARK_CLOSE, "")).toBe(
      "Steps Send the welcome pack Book the call",
    );
  });

  it("matches every word as a prefix, and treats query syntax as words", () => {
    createLead(db, companyId, leadInput.parse({ name: "Oakridge International School" }));
    expect(titles("oak sch")).toEqual(["contact:Oakridge International School"]);
    expect(titles('oak" OR "x')).toEqual([]);
    expect(titles("NEAR(oak)")).toEqual([]);
    expect(titles("   ")).toEqual([]);
  });

  it("forgets what is archived, deleted, or another company's", () => {
    const page = brain.newPage(db, companyId, "ideas", "idea", NOW);
    save(page.id, { body: "Quizzes for parents" });
    expect(titles("quizzes")).toHaveLength(1);
    brain.archivePage(db, page.id, true, NOW);
    expect(titles("quizzes")).toEqual([]);

    const lead = createLead(db, companyId, leadInput.parse({ name: "Riverside" }));
    expect(titles("riverside")).toHaveLength(1);
    deleteLead(db, lead.id);
    expect(titles("riverside")).toEqual([]);

    const other = createCompany(db, { name: "PaperKite", accent: "teal", timezone: "Asia/Kolkata" }).id;
    createLead(db, other, leadInput.parse({ name: "Hillside" }));
    expect(titles("hillside")).toEqual([]);

    deleteCompany(db, other);
    const left = db.prepare(`SELECT COUNT(*) AS n FROM search_map WHERE company_id = ?`).get(other) as { n: number };
    expect(left.n).toBe(0);
    const orphans = db
      .prepare(`SELECT COUNT(*) AS n FROM brain_search WHERE rowid NOT IN (SELECT id FROM search_map)`)
      .get() as { n: number };
    expect(orphans.n).toBe(0);
  });

  it("with nothing typed, offers the pages written most recently", () => {
    const one = brain.newPage(db, companyId, "plan", "risk", NOW);
    const two = brain.newPage(db, companyId, "plan", "goal", later(5));
    save(one.id, { body: "Updated" }, later(10));
    expect(brain.search(db, companyId, "").map((hit) => hit.id)).toEqual([one.id, two.id]);
  });
});

describe("filing a note", () => {
  it("makes it a page and lets the note go", () => {
    createNote(db, companyId, "Referral bonus for schools\nTen percent of the first invoice", "2026-09-17");
    const [note] = listNotes(db, companyId);

    const page = brain.fileNote(db, note!.id, "ideas", NOW);
    expect(page).toMatchObject({ section: "ideas", template: "idea", title: "Referral bonus for schools" });
    expect(page.body).toBe("Referral bonus for schools\nTen percent of the first invoice");
    expect(listNotes(db, companyId)).toEqual([]);
    expect(brain.search(db, companyId, "referral").map((hit) => hit.kind)).toEqual(["page"]);
  });

  it("uses a blank page outside Ideas, and refuses a note that is gone", () => {
    createNote(db, companyId, "Call the CA about TDS", "2026-09-17");
    const [note] = listNotes(db, companyId);
    expect(brain.fileNote(db, note!.id, "tax", NOW).template).toBe("page");
    expect(() => brain.fileNote(db, note!.id, "tax", NOW)).toThrow("no longer exists");
  });
});

describe("what an invoice prints", () => {
  it("takes the legal name, address, GSTIN and the account marked for invoices", () => {
    const profile = brain.newPage(db, companyId, "company", "profile", NOW);
    save(profile.id, {
      fields: { legalName: "Unifloe LLP", registeredAddress: "12 MG Road\nBengaluru", gstin: "29ABCDE1234F1Z5" },
    });
    const personal = brain.newPage(db, companyId, "company", "bank", NOW);
    save(personal.id, { fields: { bankName: "Other Bank" }, secrets: { number: "111122223333" } });
    const business = brain.newPage(db, companyId, "company", "bank", NOW);
    save(business.id, {
      fields: { bankName: "HDFC", holder: "Unifloe LLP", ifsc: "HDFC0001234", onInvoices: true },
      secrets: { number: "50200012345678" },
    });

    expect(brain.invoiceIssuer(db, companyId, "Unifloe")).toEqual({
      name: "Unifloe LLP",
      address: "12 MG Road\nBengaluru",
      gstin: "29ABCDE1234F1Z5",
      // A company in India prints India's names for its numbers.
      taxLabel: "GSTIN",
      email: null,
      phone: null,
      payTo: ["Bank: HDFC", "Account name: Unifloe LLP", "Account number: 50200012345678", "IFSC: HDFC0001234"],
    });
  });

  it("falls back to the workspace name, and prints no account unless one is marked", () => {
    const bank = brain.newPage(db, companyId, "company", "bank", NOW);
    save(bank.id, { fields: { bankName: "HDFC" } });
    expect(brain.invoiceIssuer(db, companyId, "Unifloe")).toMatchObject({ name: "Unifloe", payTo: [] });
  });
});

describe("the Markdown export", () => {
  it("writes a file per page under its section, with numbers masked unless asked", () => {
    const profile = brain.newPage(db, companyId, "company", "profile", NOW);
    save(profile.id, { fields: { legalName: "Unifloe LLP", entityType: "llp" }, secrets: { pan: "ABCDE1234F" } });
    brain.newPage(db, companyId, "plan", "goal", NOW);
    brain.newPage(db, companyId, "plan", "goal", NOW);
    const old = brain.newPage(db, companyId, "ideas", "idea", NOW);
    brain.archivePage(db, old.id, true, NOW);

    const parent = mkdtempSync(join(tmpdir(), "caulder-brain-"));
    try {
      const masked = exportBrain(db, companyId, "Unifloe", parent, { secrets: false }, NOW);
      expect(masked.files).toBe(5);
      expect(readdirSync(join(masked.folder, "02 Plan")).sort()).toEqual(["Goal (2).md", "Goal.md"]);
      expect(readdirSync(join(masked.folder, "Archived", "15 Ideas"))).toEqual(["Idea.md"]);

      const page = readFileSync(join(masked.folder, "01 Company", "Company profile.md"), "utf8");
      expect(page).toContain("- **Legal name:** Unifloe LLP");
      expect(page).toContain("- **Entity type:** LLP");
      expect(page).toContain("- **Tax ID:** •••• 234F");
      expect(page).not.toContain("ABCDE1234F");
      expect(readFileSync(join(masked.folder, "README.md"), "utf8")).toContain("[Goal](02%20Plan/Goal%20(2).md)");

      const full = exportBrain(db, companyId, "Unifloe", join(parent, "full"), { secrets: true }, NOW);
      expect(readFileSync(join(full.folder, "01 Company", "Company profile.md"), "utf8")).toContain(
        "- **Tax ID:** ABCDE1234F",
      );
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
