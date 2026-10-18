import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

/**
 * Google Tasks, both ways, against a stand-in for the Google script: what is
 * sent and kept when a sync runs, a tick made in Google coming back, and a
 * task Google would not take staying to be sent again - and being said -
 * rather than being marked as sent. The script's own code runs in Google and
 * is not tested here; the request it is sent, and what is done with its
 * answer, are.
 */

type Remote = { id: string; title: string; due: string | null; notes: string | null; done: boolean };
const remote = new Map<string, Remote>();
const requests: { action: string; body: Record<string, unknown> }[] = [];
/** Task ids the stand-in refuses to update, as Google sometimes does. */
const refuse = new Set<string>();
let made = 0;

vi.mock("electron", () => ({
  net: {
    fetch: async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown> & { action: string };
      requests.push({ action: body.action, body });
      const reply = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200 });
      if (body.action === "pullTasks") return reply({ tasks: [...remote.values()], complete: true });
      if (body.action === "pushTasks") {
        const created: { taskId: string; externalId: string }[] = [];
        const failures: { taskId: string; error: string }[] = [];
        for (const task of (body.create as { id: string; title: string; dueOn: string; notes: string | null; done: boolean }[]) ?? []) {
          made += 1;
          const id = `g${made}`;
          remote.set(id, { id, title: task.title, due: task.dueOn, notes: task.notes, done: task.done });
          created.push({ taskId: task.id, externalId: id });
        }
        for (const task of (body.update as { id: string; externalId: string; title: string; dueOn: string; notes: string | null; done: boolean }[]) ?? []) {
          if (refuse.has(task.id)) {
            failures.push({ taskId: task.id, error: "Error: Rate Limit Exceeded" });
            continue;
          }
          remote.set(task.externalId, { id: task.externalId, title: task.title, due: task.dueOn, notes: task.notes, done: task.done });
        }
        for (const id of (body.remove as string[]) ?? []) remote.delete(id);
        return reply({ created, failures });
      }
      return new Response(JSON.stringify({ ok: false, error: "Unknown action" }), { status: 200 });
    },
  },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (text: string) => Buffer.from(text), decryptString: (buffer: Buffer) => buffer.toString() },
}));
vi.mock("./credentials", () => ({
  readConnection: () => ({ url: "https://script.google.com/macros/s/test/exec", secret: "s3cret", invite: null }),
  encryptionAvailable: () => true,
}));

const { migrate } = await import("../db/migrations");
const { createCompany } = await import("../repositories/companies");
const { createTask, completeTask, findTask } = await import("../repositories/tasks");
const { syncNow } = await import("./gsync");
const { readSync } = await import("../repositories/google");
const { taskInput } = await import("@shared/domain");

const NOW = new Date("2026-10-14T06:00:00Z");
let db: Database.Database;
let companyId: string;

beforeEach(() => {
  remote.clear();
  requests.length = 0;
  refuse.clear();
  made = 0;
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Unifloe", accent: "coffee", timezone: "Asia/Kolkata" }).id;
  db.prepare(`UPDATE companies SET google_tasklist_id = 'list1' WHERE id = ?`).run(companyId);
});

const task = (title: string) => createTask(db, companyId, taskInput.parse({ title, dueOn: "2026-10-15" }));
const dirty = (id: string) => (db.prepare(`SELECT is_dirty FROM tasks WHERE id = ?`).get(id) as { is_dirty: number }).is_dirty;

describe("Google Tasks, both ways", () => {
  it("sends a task made here to the list chosen, keeps Google's id for it, and sends nothing twice", async () => {
    const mine = task("Send the Harbour proposal");
    const first = await syncNow(db, companyId, NOW);
    expect(first).toMatchObject({ ran: true, pushed: 1, lastError: null });
    expect(requests.find((each) => each.action === "pushTasks")?.body).toMatchObject({ taskListId: "list1" });
    expect([...remote.values()]).toEqual([{ id: "g1", title: "Send the Harbour proposal", due: "2026-10-15", notes: null, done: false }]);
    expect(db.prepare(`SELECT external_id FROM tasks WHERE id = ?`).get(mine.id)).toEqual({ external_id: "g1" });
    expect(dirty(mine.id)).toBe(0);

    const second = await syncNow(db, companyId, NOW);
    expect(second.pushed).toBe(0);
    expect(made).toBe(1);
  });

  it("takes a task made in Google, and a tick made there", async () => {
    remote.set("g9", { id: "g9", title: "Renew the domain", due: "2026-10-20", notes: null, done: false });
    await syncNow(db, companyId, NOW);
    const adopted = db.prepare(`SELECT id, title, due_on, status FROM tasks WHERE external_id = 'g9'`).get() as { id: string; title: string; due_on: string; status: string };
    expect(adopted).toMatchObject({ title: "Renew the domain", due_on: "2026-10-20", status: "open" });

    remote.set("g9", { ...(remote.get("g9") as Remote), done: true });
    await syncNow(db, companyId, NOW);
    expect(findTask(db, adopted.id)?.status).toBe("done");
  });

  it("keeps a task Google would not take, says so, and sends it at the next sync", async () => {
    const mine = task("Call Priya");
    await syncNow(db, companyId, NOW);
    completeTask(db, mine.id);
    refuse.add(mine.id);

    const refused = await syncNow(db, companyId, NOW);
    expect(refused.lastError).toBe("One task did not reach Google Tasks (Rate Limit Exceeded). Caulder will try again at the next sync.");
    expect(readSync(db, companyId).lastError).toContain("did not reach Google Tasks");
    // Still to be sent - not marked as sent and forgotten.
    expect(dirty(mine.id)).toBe(1);
    expect(remote.get("g1")?.done).toBe(false);

    refuse.clear();
    const again = await syncNow(db, companyId, NOW);
    expect(again.lastError).toBeNull();
    expect(remote.get("g1")?.done).toBe(true);
    expect(dirty(mine.id)).toBe(0);
  });
});
