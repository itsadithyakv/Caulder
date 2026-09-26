import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { passSetup } from "./nav";

/**
 * One line into a task, in a real window.
 *
 * The parsing itself is covered by hand in shared/quickadd.test.ts. What
 * needs a window is the conversation: the reading appearing as you type, a
 * question with buttons when something is missing, Enter refusing to guess,
 * and the task and its hour actually landing.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

/** The workspace's tomorrow, from the machine's own clock. */
function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function openApp(): Promise<Page> {
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Mine");
    await page.getByRole("button", { name: "Create company" }).click();
    await passSetup(page);
    await expect(page.getByRole("button", { name: /Mine/ })).toBeVisible();
  }
  await page.getByLabel("Main").getByRole("button", { name: "Today", exact: true }).click();
  return page;
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-quick-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("a line with a time makes the task and sets the hour aside", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");

  await line.fill("Task at 4pm, tomorrow, Datascience Assignment");

  // What it understood is shown before anything is written.
  const reading = page.locator(".quickadd__reading");
  await expect(reading).toContainText("Datascience Assignment");
  await expect(reading).toContainText("Tomorrow");
  await expect(reading).toContainText("College");

  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Datascience Assignment");

  // Both halves landed: an hour on tomorrow's grid, pointing at the task.
  const block = await page.evaluate(async (day) => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const plan = await window.caulder.day.get(activeCompanyId ?? "", day);
    const found = plan.blocks.find((entry) => entry.title === "Datascience Assignment");
    return found ? { startsAt: found.startsAt, minutes: found.minutes, task: found.taskTitle } : null;
  }, tomorrow());
  expect(block).toEqual({ startsAt: "16:00", minutes: 60, task: "Datascience Assignment" });
});

test("it asks when a task has no day, and Enter does not guess", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");

  await line.fill("Pay the phone bill");
  await expect(page.locator(".quickadd__question")).toHaveText("When is it due?");

  // Enter with a question open goes to the answers rather than adding.
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toHaveCount(0);

  await page.locator(".quickadd__answers").getByRole("button", { name: "Today" }).click();
  await expect(page.locator(".quickadd__question")).toHaveCount(0);
  await line.press("Enter");

  await expect(page.locator(".taskrow").filter({ hasText: "Pay the phone bill" })).toBeVisible();
});

test("typing the answer works as well as pressing it", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");

  await line.fill("Read chapter four");
  await expect(page.locator(".quickadd__question")).toHaveText("When is it due?");
  await line.fill("Read chapter four today");
  await expect(page.locator(".quickadd__question")).toHaveCount(0);
});

test("a word taught in Settings decides the area, and forgetting it undoes that", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  const reading = page.locator(".quickadd__reading");

  // Before: nothing in the line points anywhere, so the workspace fills in
  // its own area, which is the company.
  await line.fill("Datascience reading tomorrow");
  await expect(reading.locator(".area")).toHaveText("Company");
  await line.fill("");

  await page.getByLabel("Main").getByRole("button", { name: "Settings", exact: true }).click();
  const card = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Your words" }) });
  await card.getByLabel("Word or phrase").fill("Datascience");
  await card.getByRole("radiogroup", { name: "Which area it means" }).getByRole("radio", { name: "College" }).click();
  await card.getByRole("button", { name: "Teach it" }).click();
  await expect(card.getByRole("list", { name: "Your words" })).toContainText("Datascience");

  // The same word in another case is refused with where it already points,
  // not with a constraint error - and not with Electron's wrapper round it.
  await card.getByLabel("Word or phrase").fill("DATASCIENCE");
  await card.getByRole("button", { name: "Teach it" }).click();
  await expect(card.getByRole("alert")).toHaveText(
    '"DATASCIENCE" is already a word for College. Remove it first to move it.',
  );

  await page.getByLabel("Main").getByRole("button", { name: "Today", exact: true }).click();
  await line.fill("Datascience reading tomorrow");
  await expect(reading.locator(".area")).toHaveText("College");
  // It picked the area and left the title alone.
  await expect(reading.locator(".quickadd__title")).toHaveText("Datascience reading");

  // Forgotten, and the line goes back to not knowing.
  await page.getByLabel("Main").getByRole("button", { name: "Settings", exact: true }).click();
  await card.getByRole("button", { name: 'Forget "Datascience"' }).click();
  await expect(card.getByText("No words yet.")).toBeVisible();
  await page.getByLabel("Main").getByRole("button", { name: "Today", exact: true }).click();
  await line.fill("Datascience reading tomorrow");
  await expect(reading.locator(".area")).toHaveText("Company");
});

test("a title main refuses says why, in a sentence", async () => {
  // The schema in main caps a title at 200 characters. Its refusal used to
  // arrive as Electron's wrapper round a ZodError's whole issue list as JSON.
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  await line.fill(`${"x".repeat(250)} today`);
  await line.press("Enter");
  await expect(page.locator(".quickadd").getByRole("alert")).toHaveText(
    "Keep the title under 200 characters.",
  );
});

test("a repeat asks until when, then sets aside every one of them", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");

  await line.fill("gym mon wed fri 7am");
  await expect(page.locator(".quickadd__reading")).toContainText("Every Mon, Wed, Fri");
  await expect(page.locator(".quickadd__question")).toHaveText("Every Mon, Wed, Fri - until when?");

  // Enter with the question open goes to its answers, not to adding.
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toHaveCount(0);

  await page.locator(".quickadd__answers").getByRole("button", { name: "4 weeks" }).click();
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Every Mon, Wed, Fri");
  await expect(page.locator(".quickadd__added")).toContainText("12 on your day");

  // Four weeks from the first one is exactly four of each - and no task,
  // because a repeat is hours on the grid rather than a thing to tick.
  const found = await page.evaluate(async () => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const start = new Date();
    let blocks = 0;
    let tasks = 0;
    for (let i = 0; i < 35; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const plan = await window.caulder.day.get(activeCompanyId ?? "", day);
      blocks += plan.blocks.filter((b) => b.title === "Gym" && b.startsAt === "07:00").length;
      tasks += plan.tasks.filter((t) => t.title === "Gym").length;
    }
    return { blocks, tasks };
  });
  expect(found).toEqual({ blocks: 12, tasks: 0 });
});

test("a wrong area is one click on the reading to fix", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");

  await line.fill("hw due tomorrow");
  const area = page.locator(".quickadd__reading").getByRole("button", { name: /^Area:/ });
  await expect(area).toHaveText("College");
  await area.click();
  await expect(area).toHaveText("Company");

  // The cursor went back to the line, so Enter adds rather than clicking the
  // area a second time.
  await expect(line).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Hw");

  const saved = await page.evaluate(async (day) => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const plan = await window.caulder.day.get(activeCompanyId ?? "", day);
    return plan.tasks.find((t) => t.title === "Hw")?.area ?? null;
  }, tomorrow());
  expect(saved).toBe("company");
});

test("a slip is read as the day it nearly is, and says so", async () => {
  const page = await openApp();
  await page.getByLabel("Anything, in one line").fill("submit report wensday");
  // Said, with the way to take it back beside it.
  await expect(page.locator(".quickadd__aside")).toContainText("Read “wensday” as Wednesday.");
  await expect(page.getByRole("button", { name: "Keep “wensday”" })).toBeVisible();
  await expect(page.locator(".quickadd__reading .quickadd__title")).toHaveText("Submit report");
});

test("a line typed like a text is read, its guess can be kept as typed, and Tune asks about it after", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  const reading = page.locator(".quickadd__reading");

  await line.fill("meetining tmrw 4 with rahul from ms puc");
  await expect(reading.locator(".quickadd__title")).toHaveText("Meeting with rahul from ms puc");
  await expect(reading).toContainText("Tomorrow");
  await expect(reading).toContainText("4:00 PM");
  await expect(page.locator(".quickadd__aside")).toContainText("Read “meetining” as meeting.");

  // One press keeps the word as typed, and the cursor goes back to the line.
  await page.getByRole("button", { name: "Keep “meetining”" }).click();
  await expect(reading.locator(".quickadd__title")).toHaveText("Meetining with rahul from ms puc");
  await expect(line).toBeFocused();

  // A slip it is left to mend is asked about in Settings once the task is in.
  await line.fill("assigment tmrw");
  await expect(reading.locator(".quickadd__title")).toHaveText("Assignment");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Assignment");

  await page.getByLabel("Main").getByRole("button", { name: "Settings", exact: true }).click();
  const tune = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Tune" }) });
  await expect(tune.locator(".tune__question")).toContainText("assigment");
  await tune.getByRole("button", { name: "Yes, same thing" }).click();
  await expect(tune.getByRole("list", { name: "What you have settled" })).toContainText("assigment is read as assignment");
  // The word kept under the line was settled there, and is listed with it.
  await expect(tune.getByRole("list", { name: "What you have settled" })).toContainText("meetining is left as typed");

  // Settled, so it is read without comment from now on.
  await page.getByLabel("Main").getByRole("button", { name: "Today", exact: true }).click();
  await line.fill("assigment friday");
  await expect(reading.locator(".quickadd__title")).toHaveText("Assignment");
  // Nothing said about the slip - only, now, that an Assignment is already there.
  await expect(page.locator(".quickadd__aside")).not.toContainText("Read “assigment”");
  await expect(page.locator(".quickadd__aside")).toContainText("“Assignment” is already there");
});

test("a line that says more keeps the rest as a note, and makes the reminder it asked for", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");

  await line.fill("Study for ml exam tomorrow, kiran sir requires permission for the retest so i need to remind him 1 day prior");

  // Both are shown before either is written.
  await expect(page.locator(".quickadd__reading .quickadd__title")).toHaveText("Study for ml exam");
  await expect(page.locator(".quickadd__then")).toContainText("Remind kiran sir");
  await expect(page.locator(".quickadd__then")).toContainText("Today");
  await expect(page.locator(".quickadd__noted")).toContainText("kiran sir requires permission for the retest");

  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Study for ml exam");
  await expect(page.locator(".quickadd__added")).toContainText("Remind kiran sir");

  const saved = await page.evaluate(async (day) => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const company = activeCompanyId ?? "";
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const [later, sooner] = await Promise.all([window.caulder.day.get(company, day), window.caulder.day.get(company, today)]);
    return {
      note: later.tasks.find((task) => task.title === "Study for ml exam")?.notes ?? null,
      reminder: sooner.tasks.some((task) => task.title === "Remind kiran sir"),
    };
  }, tomorrow());
  expect(saved.note).toContain("kiran sir requires permission");
  expect(saved.reminder).toBe(true);
});

test("saying what you did finishes the task it was, and a thing said what it is becomes a memory", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");

  // Something to have done.
  await line.fill("gym today");
  await line.press("Enter");
  await expect(page.locator(".taskrow").filter({ hasText: "Gym" })).toBeVisible();

  // Said as done: it offers to finish the task rather than adding another.
  await line.fill("went to the gym, felt good");
  const will = page.getByRole("group", { name: "What this will do" });
  await expect(will.getByRole("button", { name: "Finish “Gym”" })).toHaveAttribute("aria-pressed", "true");
  await expect(will.getByRole("button", { name: "Journal" })).toHaveAttribute("aria-pressed", "true");

  // Each part can be switched off before any of it happens.
  await will.getByRole("button", { name: "Journal" }).click();
  await expect(will.getByRole("button", { name: "Journal" })).toHaveAttribute("aria-pressed", "false");
  await expect(line).toBeFocused();

  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Finish “Gym”");
  await expect(page.locator(".taskrow").filter({ hasText: "Gym" })).toHaveCount(0);

  // A thing, said what it is: a page for it in the brain, where books go.
  await line.fill("red rising is the first book of the red rising series");
  await expect(page.locator(".quickadd__reading")).toContainText("a new page in the brain's hobbies: Red Rising");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Remembered, under Red Rising");

  // And the next thing said about it is kept with it.
  await line.fill("red rising has the best ending of any book this year");
  await expect(page.locator(".quickadd__reading")).toContainText("remembered under Red Rising");
  await line.press("Enter");

  const kept = await page.evaluate(async () => {
    // What the line remembers is yours, kept in your home.
    const { activeCompanyId, homeCompanyId } = await window.caulder.companies.list();
    const pages = await window.caulder.brain.section(homeCompanyId ?? activeCompanyId ?? "", "hobbies", false);
    const found = pages.find((each) => each.title === "Red Rising");
    return found ? (await window.caulder.brain.page(found.id)).body : null;
  });
  expect(kept).toContain("the first book of the red rising series");
  expect(kept).toContain("the best ending of any book this year");
});

test("the line does what it is asked: adds a contact, logs what was spent, goes where it is told", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  const reading = page.locator(".quickadd__reading");

  // Said what it will do before it does it.
  await line.fill("add contact rahul nair from ms puc, 98765 43210, rahul@mspuc.in");
  await expect(reading.locator(".quickadd__title")).toHaveText("New contact: Rahul Nair at MS PUC");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("New contact: Rahul Nair at MS PUC");

  await line.fill("spent 500 on hosting");
  await expect(reading.locator(".quickadd__title")).toHaveText("Log 500 spent: Hosting");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Log 500 spent: Hosting");

  const saved = await page.evaluate(async () => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const company = activeCompanyId ?? "";
    const leads = await window.caulder.leads.list({ companyId: company, sort: "name", direction: "asc" });
    const lead = leads.find((each) => each.name === "MS PUC");
    return { person: lead?.contactPerson ?? null, phone: lead?.phone ?? null, email: lead?.email ?? null };
  });
  expect(saved).toEqual({ person: "Rahul Nair", phone: "98765 43210", email: "rahul@mspuc.in" });

  // Now that Rahul is known, "email rahul" is wanting to write to him, not a task.
  await line.fill("email rahul");
  await expect(reading.locator(".quickadd__title")).toHaveText("Write to MS PUC");

  // And a thing to do that starts the same way stays a thing to do.
  await line.fill("go to the gym today at 5");
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();

  await line.fill("go to money");
  await line.press("Enter");
  await expect(page.getByRole("heading", { name: "Money", exact: true })).toBeVisible();
});

test("what was never connected is offered on Today, and each part of it can be waved away", async () => {
  const page = await openApp();
  // One line under the quick line, not a card above the work.
  const nudge = page.getByRole("region", { name: "Finish setting up" });
  await expect(nudge).toHaveClass(/setupnudge/);
  const google = nudge.getByRole("button", { name: "Connect Google", exact: true });
  await expect(google).toBeVisible();
  // What it gives is on hover, and read out with the button.
  await expect(google).toHaveAttribute("title", /there is no Caulder account to make/);
  await expect(nudge).toContainText("there is no Caulder account to make");

  // First, a copy off this computer (phase 24): it goes to the guide's first step.
  const copy = nudge.getByRole("button", { name: "Keep a copy elsewhere", exact: true });
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(page.getByText("A copy somewhere else")).toBeVisible();
  await expect(page.locator(".safecopy").getByRole("button", { name: /Choose a folder/ })).toBeVisible();
  await page.getByLabel("Main").getByRole("button", { name: "Today", exact: true }).click();

  await nudge.getByRole("button", { name: "Skip: Connect an AI" }).click();
  await expect(nudge.getByRole("button", { name: "Connect an AI", exact: true })).toHaveCount(0);

  // The name goes to the guide, which is where the steps are.
  await google.click();
  await expect(page.getByText("Google: your calendar, tasks, email, contacts and backups")).toBeVisible();

  await page.getByLabel("Main").getByRole("button", { name: "Today", exact: true }).click();
  await nudge.getByRole("button", { name: "Skip all", exact: true }).click();
  await expect(nudge).toHaveCount(0);
});

test("what is said about a lift or a song is kept with it, under the hobby it is part of", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");

  // The hobbies these hang off.
  await page.evaluate(async () => {
    const { activeCompanyId, homeCompanyId } = await window.caulder.companies.list();
    for (const title of ["Gym", "Guitar"]) {
      const made = await window.caulder.brain.create(homeCompanyId ?? activeCompanyId ?? "", "hobbies", "hobby");
      await window.caulder.brain.save(made.id, { title, body: made.body, fields: made.fields, secrets: {}, baseRevision: made.revision });
    }
  });
  // The line reads what it knows when the window comes back to the front.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await line.fill("i hit a pr today, 45kg on the bench press for 3 reps");
  const will = page.getByRole("group", { name: "What this will do" });
  await expect(will.getByRole("button", { name: "New page: Bench Press, under Hobbies › Gym › Chest" })).toHaveAttribute("aria-pressed", "true");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("New page: Bench Press");

  await line.fill("i learnt a new song called riptide, the cords are quite difficult and i had fun with it");
  await expect(will.getByRole("button", { name: "New page: Riptide, under Hobbies › Guitar" })).toBeVisible();
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("New page: Riptide");

  // The next lift goes on the page there is, numbers first.
  await line.fill("bench press 3x8 at 40kg, felt strong");
  await expect(will.getByRole("button", { name: "Remember under Bench Press" })).toBeVisible();
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Remember under Bench Press");

  const kept = await page.evaluate(async () => {
    // What the line remembers is yours, kept in your home.
    const { activeCompanyId, homeCompanyId } = await window.caulder.companies.list();
    const pages = await window.caulder.brain.section(homeCompanyId ?? activeCompanyId ?? "", "hobbies", false);
    const body = async (title: string) => {
      const found = pages.find((each) => each.title === title);
      return found ? (await window.caulder.brain.page(found.id)).body : "";
    };
    return { titles: pages.map((each) => each.title).sort(), bench: await body("Bench Press"), chest: await body("Chest"), riptide: await body("Riptide") };
  });
  // Other tests share this folder and have pages of their own here; what matters
  // is that these are there, and that the second lift did not start a second page.
  expect(kept.titles).toEqual(expect.arrayContaining(["Bench Press", "Guitar", "Gym", "Riptide"]));
  expect(kept.titles.filter((title) => title === "Bench Press")).toHaveLength(1);
  // The lift is part of what it works, and that is part of the gym: two levels, each saying the one above.
  expect(kept.bench).toContain("Part of [[Chest|page:");
  expect(kept.chest).toContain("Part of [[Gym|page:");
  expect(kept.bench).toContain("**PR: 45 kg × 3** · i hit a pr today");
  expect(kept.bench).toContain("**3 × 8 at 40 kg** · bench press 3x8 at 40kg, felt strong");
  expect(kept.riptide).toContain("Part of [[Guitar|page:");
});

test("a line that is nobody else's business is locked the moment it is kept, and only the passcode reads it", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // Without a passcode it says what is true: kept apart, not locked.
  await line.fill("I did not like how i spoke to my mum today");
  await expect(page.locator(".quickadd__reading")).toContainText("once the journal has a passcode");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("It is not locked yet");

  // A passcode, and the journal locked again: writing still needs nothing.
  await page.evaluate(async () => {
    // The journal is yours, kept in your home.
    const { activeCompanyId, homeCompanyId } = await window.caulder.companies.list();
    await window.caulder.life.setPasscode(homeCompanyId ?? activeCompanyId ?? "", "open sesame");
    await window.caulder.life.lockNow();
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await line.fill("I spoke to julia today about this, really liked it");
  await expect(page.getByRole("button", { name: "Private", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".quickadd__reading")).toContainText("only your passcode opens it");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Locked in your journal");

  // Locked: how many, and nothing about them - both lines, the first sealed when the passcode was set.
  const locked = await page.evaluate(async (day) => {
    const { activeCompanyId, homeCompanyId } = await window.caulder.companies.list();
    return window.caulder.life.privateDay(homeCompanyId ?? activeCompanyId ?? "", day);
  }, today());
  expect(locked).toMatchObject({ count: 2, locked: true, passcode: true, lines: [] });

  // It went nowhere else: not a task, not a note, not today's entry.
  const elsewhere = await page.evaluate(async (day) => {
    const { activeCompanyId, homeCompanyId } = await window.caulder.companies.list();
    const company = activeCompanyId ?? "";
    const plan = await window.caulder.day.get(company, day);
    const entry = await window.caulder.life.find(homeCompanyId ?? company, day);
    return JSON.stringify({ tasks: plan.tasks.map((task) => task.title), notes: plan.notes, entry: entry?.body ?? "" }).toLowerCase();
  }, today());
  expect(elsewhere).not.toContain("julia");
  expect(elsewhere).not.toContain("mum");

  const opened = await page.evaluate(async (day) => {
    const { activeCompanyId, homeCompanyId } = await window.caulder.companies.list();
    await window.caulder.life.unlock("open sesame");
    return window.caulder.life.privateDay(homeCompanyId ?? activeCompanyId ?? "", day);
  }, today());
  expect(opened.locked).toBe(false);
  expect(opened.lines.map((each) => ({ feeling: each.feeling, people: each.people }))).toEqual([
    { feeling: "regret", people: ["Mum"] },
    { feeling: "joy", people: ["Julia"] },
  ]);
});

test("a thought about something to make is caught with its parts apart", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");

  await line.fill("Edit on helicopter by asap rockey, grunge dark edit- here is the link of that for reference https://youtu.be/abc123");
  await expect(page.getByRole("button", { name: "Idea", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".quickadd__reading")).toContainText("Edit on helicopter by asap rockey");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("An idea, in the brain");

  const kept = await page.evaluate(async () => {
    // An idea is the company's, in its brain's Ideas - unlike what the line remembers.
    const { activeCompanyId } = await window.caulder.companies.list();
    const pages = await window.caulder.brain.section(activeCompanyId ?? "", "ideas", false);
    const found = pages.find((each) => each.title === "Edit on helicopter by asap rockey");
    return found ? (await window.caulder.brain.page(found.id)).body : null;
  });
  expect(kept).toContain("Grunge dark edit");
  expect(kept).toContain("Reference: https://youtu.be/abc123");
});

test("books go on the shelf, what was counted is added up for the year, and a sentence opens the composer", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  const reading = page.locator(".quickadd__reading");

  await line.fill("I want to read percy jackson series");
  await expect(reading.locator(".quickadd__title")).toHaveText("To be read: Percy Jackson, all 5");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Percy Jackson");

  await line.fill("i am reading harry potter and the goblet of fire");
  await expect(reading.locator(".quickadd__title")).toHaveText("Reading: Harry Potter and the Goblet of Fire");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Goblet of Fire");

  await line.fill("I just did 20 push ups today");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toBeVisible();
  await line.fill("did 35 push ups, felt strong");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toBeVisible();

  const kept = await page.evaluate(async () => {
    // The shelf and the year's numbers are yours, kept in your home.
    const { activeCompanyId, homeCompanyId } = await window.caulder.companies.list();
    const company = homeCompanyId ?? activeCompanyId ?? "";
    const shelf = await window.caulder.life.shelf(company);
    const year = await window.caulder.life.year(company, new Date().getFullYear());
    return {
      toRead: shelf.toRead.map((book) => book.title),
      reading: shelf.reading.map((book) => `${book.title} / ${book.series}`),
      pushUps: year.lines.find((each) => each.topic === "Push Ups")?.says ?? null,
    };
  });
  expect(kept.toRead).toEqual(["The Lightning Thief", "The Sea of Monsters", "The Titan's Curse", "The Battle of the Labyrinth", "The Last Olympian"]);
  expect(kept.reading).toEqual(["Harry Potter and the Goblet of Fire / Harry Potter"]);
  expect(kept.pushUps).toBe("55 in all over 1 day; the most in one go was 35.");

  // Said as a sentence, it goes to the composer on the contact - where the templates are.
  await line.fill("send email to rahul from ms puc");
  await expect(reading.locator(".quickadd__title")).toHaveText("Write to MS PUC");
  await line.press("Enter");
  await expect(page.locator("#lead-email")).toBeVisible();
});

test("the map is reached from Brain, Memories is under You, and a hobby has a page made for it", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");

  // No row of its own: Memories is under You, after Life, and the map is somewhere the line can be told to go.
  const places = await page.getByLabel("Main").getByRole("button").allTextContents();
  const names = places.map((each) => each.trim());
  expect(names).not.toContain("Map");
  expect(names.indexOf("Memories")).toBe(names.indexOf("Life") + 1);
  await line.fill("go to the map");
  await expect(page.locator(".quickadd__reading .quickadd__title")).toHaveText("Go to Map");
  await line.press("Enter");
  // It stands under Brain, so Brain is the row that says where you are.
  await expect(page.getByRole("heading", { name: "Map", exact: true })).toBeVisible();
  await expect(page.getByLabel("Main").getByRole("button", { name: "Brain", exact: true })).toHaveAttribute("aria-current", "page");

  // The Gym hobby's page, from what the line was told earlier in this file: the bench press and the push ups.
  await page.getByLabel("Main").getByRole("button", { name: "Life", exact: true }).click();
  const gym = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Gym", exact: true }) }).filter({ has: page.locator(".hobbytracks") });
  await expect(gym.locator(".hobbytrack").filter({ hasText: "Bench Press" })).toContainText("best 45 kg × 3");
  await expect(gym.locator(".hobbytrack").filter({ hasText: "Push Ups" })).toContainText("55 in all");
  // And the memory the line filed under it opens from here.
  await expect(gym.locator(".hobbypages").getByRole("button", { name: "Bench Press" })).toBeVisible();

  // Covers are off until asked for, and the switch says what it sends.
  const shelf = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Reading", exact: true }) }).filter({ has: page.locator(".shelf") });
  await expect(shelf.getByRole("checkbox")).not.toBeChecked();
  await expect(shelf).toContainText("Sends the title of each book on this shelf to openlibrary.org");
});

test("how you have been says what it has to go on, and can be switched off and back on", async () => {
  const page = await openApp();
  const card = page.locator(".card").filter({ has: page.getByRole("heading", { name: "How you have been" }) });

  // A few minutes of history is not a reading, and it says so rather than guessing.
  await expect(card).toContainText("Not enough yet to say how you have been");

  // The way off is in the explanation of what it reads, not a button beside the reading.
  await card.locator("summary").click();
  await card.getByRole("button", { name: "Stop keeping an eye on this" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator(".pulse__off")).toContainText("Not keeping an eye on how you have been");

  await page.getByRole("button", { name: "Turn it on" }).click();
  await expect(card).toContainText("Not enough yet");
});

test("Today says hello, takes a name in one field, and the line says little", async () => {
  const page = await openApp();
  const hello = page.locator(".today__greeting");
  await expect(hello).toHaveText(/[.?]$/);

  // The empty line: the key, and an invitation. Not a paragraph.
  await expect(page.locator(".quickadd__hint").first()).toContainText("Text anything you want");
  await expect(page.locator(".quickadd__hint").first().locator("kbd")).toHaveText(/^(A|.+\+.+)$/);

  // No name yet: it offers to take one here, and then greets by the first of them only.
  await page.getByRole("button", { name: "What should I call you?" }).click();
  await page.getByLabel("What to call you").fill("Adi Vinod");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "What should I call you?" })).toHaveCount(0);
  // Whichever line it is, it names you - and never by your surname.
  await expect(hello).toContainText("Adi");
  await expect(hello).not.toContainText("Vinod");

  // And it is the same name Settings has, not a second copy.
  expect(await page.evaluate(() => window.caulder.share.me())).toBe("Adi Vinod");

  // Beside the day's work, an aside; pressed, it tells another, and never the same one straight after.
  const aside = page.locator(".today__aside");
  const told = new Set<string>();
  for (let turn = 0; turn < 6; turn += 1) {
    const says = (await aside.innerText()).trim();
    expect(says.length).toBeGreaterThan(5);
    expect(told.has(says)).toBe(false);
    told.add(says);
    await aside.click();
    await expect(aside).not.toHaveText(says);
  }

  // The hello holds still while Today redraws around it: it is this morning's, not this render's.
  const before = await hello.innerText();
  await page.getByLabel("Main").getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Main").getByRole("button", { name: "Today", exact: true }).click();
  await expect(hello).toHaveText(before);
});

test("a fact is kept as random knowledge, and everything remembered can be found again", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");

  // Said the way a quizzer would: the fact, and that it was a good one.
  await line.fill("Shivajinagar was called black pally, interesting question");
  const read = page.locator(".quickadd__reading");
  // It shows the fact without the words that only said it was one, and where it will go.
  await expect(read.locator(".quickadd__title")).toHaveText("Shivajinagar was called black pally");
  await expect(read).toContainText("Random knowledge");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Remembered, under Random knowledge");

  // The second goes on the same page rather than starting another.
  await line.fill("fun fact: honey never spoils");
  await expect(read).toContainText("remembered under Random knowledge");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Random knowledge");

  // And there is somewhere to see them: Memories, under You.
  await page.getByLabel("Main").getByRole("button", { name: "Memories", exact: true }).click();
  const pile = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Random knowledge" }) });
  // A fact opens with what it is about, so nothing is put in front of it to say so again.
  await expect(pile.locator(".memories__fact")).toHaveCount(0);
  await expect(pile).toContainText("Shivajinagar was called black pally");
  await expect(pile).toContainText("Honey never spoils");
  await expect(pile).not.toContainText("interesting question");

  // Searched, it narrows to what was asked for.
  await page.getByLabel("Search your memories").fill("honey");
  await expect(pile).toContainText("Honey never spoils");
  await expect(pile).not.toContainText("Shivajinagar");
  await page.getByLabel("Search your memories").fill("");

  // Each pile opens the page it is, and the way back is to Memories.
  await pile.getByRole("button", { name: "Open the page" }).click();
  await expect(page.getByRole("heading", { name: "Random knowledge" })).toBeVisible();
  await page.getByRole("button", { name: /Memories/ }).first().click();
  await expect(page.getByRole("heading", { name: "Memories", exact: true })).toBeVisible();
});

test("what is remembered branches the whole way down, and the brain, Memories and the map agree on it", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  const read = page.locator(".quickadd__reading");

  // Before it is kept, it says where it will hang - every level, not only the one above.
  await line.fill("the way of kings is a fantasy book in the stormlight archive series");
  await expect(read).toContainText("a new page in the brain's hobbies: The Way Of Kings, under Hobbies › Reading › Fantasy books › Stormlight Archive series");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Remembered, under The Way Of Kings");

  // The second of the series shares every level above it.
  await line.fill("words of radiance is a book in the stormlight archive series");
  await expect(read).toContainText("under Hobbies › Reading › Stormlight Archive series");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Words Of Radiance");

  // Memories says the same chain, read back out of the pages.
  await page.getByLabel("Main").getByRole("button", { name: "Memories", exact: true }).click();
  const first = page.locator(".card").filter({ has: page.getByRole("heading", { name: "The Way Of Kings" }) });
  await expect(first).toContainText("Hobbies › Reading › Fantasy books › Stormlight Archive series");
  const second = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Words Of Radiance" }) });
  await expect(second).toContainText("Hobbies › Reading › Fantasy books › Stormlight Archive series");

  // The brain: each level is a real page that says what it is part of, and lists what is part of it.
  await first.getByRole("button", { name: "Open the page" }).click();
  await expect(page.getByRole("heading", { name: "The Way Of Kings" })).toBeVisible();
  await page.locator(".prose, .bpage__body").getByRole("button", { name: /Stormlight Archive series/ }).first().click();
  await expect(page.getByRole("heading", { name: "Stormlight Archive series" })).toBeVisible();
  await expect(page.getByText("Words Of Radiance").first()).toBeVisible();

  // And the map draws it: one way from Memories, and every level a dot.
  await page.getByLabel("Main").getByRole("button", { name: "Memories", exact: true }).click();
  await page.getByRole("button", { name: "See them on your map" }).click();
  await page.getByRole("button", { name: "As a list" }).click();
  for (const level of ["Me", "Hobbies", "Reading", "Fantasy books", "Stormlight Archive series", "The Way Of Kings", "Words Of Radiance"]) {
    await expect(page.getByRole("button", { name: level, exact: true }).first()).toBeVisible();
  }
});

test("a line moved to another part of life before it is kept teaches the next one like it", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");

  // A thing to do, with nothing in it that says whose: in a company workspace it falls to Company.
  await line.fill("give arjun the charger back tomorrow");
  const area = page.getByRole("button", { name: /^Area: .*\. Change it$/ });
  await expect(area).toHaveAccessibleName("Area: Company. Change it");
  // Moved by hand to Personal, then kept.
  while ((await area.getAttribute("aria-label")) !== "Area: Personal. Change it") await area.click();
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Give arjun the charger back");

  // The next line like it goes to Personal by itself, and says why.
  await line.fill("drop the charger at meera's tomorrow");
  await expect(area).toHaveAccessibleName("Area: Personal. Change it");
  await expect(page.locator(".quickadd__aside")).toContainText(
    "give arjun the charger back tomorrow",
  );
  await line.fill("");

  // And Settings lists it, with a way to take it back - after which the line is back to guessing.
  await page.getByLabel("Main").getByRole("button", { name: "Settings" }).click();
  const learnt = page.locator(".card").filter({ has: page.getByRole("heading", { name: "What the line has learnt" }) });
  await expect(learnt).toContainText("give arjun the charger back tomorrow");
  await expect(learnt).toContainText("goes in Personal");
  await learnt.getByRole("button", { name: /Forget what was learnt from "give arjun the charger back tomorrow"/ }).click();
  // Other tests in this file teach lessons of their own; this one is gone, and the line is back to guessing.
  await expect(learnt).not.toContainText("give arjun the charger back tomorrow");
});

test("another mail account can be added beside Gmail, and a wrong server is said plainly", async () => {
  const page = await openApp();
  await page.getByLabel("Main").getByRole("button", { name: "Settings" }).click();
  const card = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Other mail accounts" }) });
  await card.getByRole("button", { name: "Add an account" }).click();
  // Zoho is the first offered, with where to make an app password.
  await expect(card).toContainText("App passwords");
  await card.getByLabel("Email address").fill("me@unifloe.com");
  await card.getByLabel("App password").fill("not-a-real-password");
  // A server that does not exist, so the try fails fast and nothing is kept.
  await card.locator(".mailacct__server > summary").click();
  await card.getByLabel("SMTP server").fill("smtp.invalid");
  await card.getByRole("button", { name: "Try it and add" }).click();
  await expect(card.getByRole("alert")).toContainText("smtp.invalid", { timeout: 30_000 });
  await expect(card.getByLabel("App password")).toHaveValue("");
  await expect(card.locator(".rule")).toHaveCount(0);
});

test("a line that says remind me says it will, and Settings has the journal nudge, the brief and a test", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  await line.fill("remind me tomorrow at 6pm to call the plumber");
  await expect(page.locator(".quickadd__aside")).toContainText("A Windows notification at 6:00 PM, tomorrow");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Call the plumber");
  // Kept as a reminder against the task, at its day and time.
  const kept = await page.evaluate(() => window.caulder.nudges.get());
  expect(kept).toEqual({ journalAt: null, briefAt: null });

  await page.getByLabel("Main").getByRole("button", { name: "Settings" }).click();
  const journal = page.getByRole("switch", { name: "Remind me to write in the journal" });
  await expect(journal).toHaveAttribute("aria-checked", "false");
  await journal.click();
  await expect(journal).toHaveAttribute("aria-checked", "true");
  await page.getByRole("switch", { name: "A morning brief of what matters today" }).click();
  await expect.poll(() => page.evaluate(() => window.caulder.nudges.get())).toEqual({ journalAt: "21:00", briefAt: "09:00" });

  // The test is sent, and says where to look if Windows holds it back.
  await page.getByRole("button", { name: "Send a test notification" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Sent|not letting/ })).toBeVisible();

  await journal.click();
  await expect.poll(() => page.evaluate(() => window.caulder.nudges.get())).toEqual({ journalAt: null, briefAt: "09:00" });
});

test("the line finishes what you type, answers what you ask, and changes what is there", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  await line.fill("dentist appointment tomorrow at 10am");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Dentist appointment");

  // Tab finishes a line said before.
  await line.fill("dent");
  await expect(page.locator(".quickadd__ghost")).toContainText("ist appointment");
  await line.press("Tab");
  await expect(line).toHaveValue("dentist appointment");

  // A question is answered from what is kept, not filed as a note.
  await line.fill("what's on tomorrow");
  // Earlier tests in this file share the app, so only this test's own task is counted on.
  await expect(page.locator(".quickadd__answer")).toContainText(/^Tomorrow: (?:one thing|\d+ things)\./);
  await expect(page.locator(".quickadd__found")).toContainText("Dentist appointment");

  // Moved by any word of it; its day stays when only an hour is said.
  await line.fill("move dentist to 5");
  await expect(page.locator(".quickadd__read")).toContainText("Move “Dentist appointment” to Tomorrow at 5:00 PM");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Moved “Dentist appointment” to tomorrow at 5:00 PM");
  await line.fill("what's on tomorrow");
  await expect(page.locator(".quickadd__found li").filter({ hasText: "Dentist appointment" })).toContainText("5 PM");

  // Cancelled, and put back.
  await line.fill("cancel the dentist");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Cancelled “Dentist appointment”");
  await page.locator(".quickadd__added").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".quickadd__added")).toContainText("Back: “Dentist appointment”");

  // "Him" is who the last line was about.
  await line.fill("add contact rahul nair from ms puc");
  await line.press("Enter");
  await line.fill("met rahul nair, wants a demo");
  await line.press("Enter");
  await line.fill("send him the deck tomorrow");
  await expect(page.locator(".quickadd__aside")).toContainText("“him” is Rahul Nair, from your last line.");

  // Something paid every month is a running cost in Money.
  await line.fill("netflix 649 monthly");
  await expect(page.locator(".quickadd__read")).toContainText("Netflix: 649 a month");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("a running cost in Money");
});

test("somebody new told about in one line is a contact, with what happened and a task to follow up", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  await line.fill("Jyothi the principal from reva puc has accepted my linkedin connection request, i need to follow up");
  const read = page.locator(".quickadd__read");
  await expect(read).toContainText("New contact: Jyothi at Reva PUC");
  await expect(read).toContainText("Principal");
  await expect(read).toContainText("from LinkedIn");
  await expect(read).toContainText("“Follow up with Jyothi” tomorrow");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("New contact: Jyothi at Reva PUC, with what happened on their history and “Follow up with Jyothi” tomorrow");

  const kept = await page.evaluate(async () => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const leads = await window.caulder.leads.list({ companyId: activeCompanyId ?? "", sort: "name", direction: "asc" });
    const lead = leads.find((each) => each.name === "Reva PUC");
    if (!lead) return null;
    const tasks = await window.caulder.tasks.forLead(lead.id);
    return { person: lead.contactPerson, source: lead.source, tasks: tasks.map((task) => task.title) };
  });
  expect(kept).toEqual({ person: "Jyothi", source: "LinkedIn", tasks: ["Follow up with Jyothi"] });

  // And "her" in the next line is Jyothi.
  await line.fill("send her the brochure friday");
  await expect(page.locator(".quickadd__aside")).toContainText("“her” is Jyothi, from your last line.");
});

test("a life is remembered: the newer answer, a birthday coming round, and a password kept locked", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");

  await line.fill("i parked on level 1, spot A4");
  await expect(page.locator(".quickadd__read")).toContainText("Where things are");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Remembered, under Where things are");
  await line.fill("i parked on level 3, spot B12");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Where things are");

  // Asked, it answers with the newer one.
  await line.fill("where did i park");
  await expect(page.locator(".quickadd__answer")).toContainText("Parked: level 3, spot B12");

  // A birthday tomorrow is a memory on the person's own page, and comes round.
  const next = new Date();
  next.setDate(next.getDate() + 1);
  const said = `${next.getDate()} ${next.toLocaleString("en-GB", { month: "long" })}`;
  await line.fill(`mummy's birthday is on ${said}`);
  await expect(page.locator(".quickadd__read")).toContainText("Mummy");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Remembered, under Mummy");

  // A password is never a memory.
  await line.fill("my wifi password is hunter22");
  await expect(page.locator(".quickadd__goes").getByRole("button", { name: "Private" })).toHaveAttribute("aria-pressed", "true");
  await line.fill("");

  await page.getByLabel("Main").getByRole("button", { name: "Memories", exact: true }).click();
  await expect(page.getByRole("list", { name: "Coming up" })).toContainText("Mummy's birthday is tomorrow");
  const where = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Where things are" }) });
  await expect(where.locator(".memories__item--earlier")).toContainText("Parked: level 1, spot A4");

  // Let go of, and it is gone.
  await where.getByRole("button", { name: "Forget: Parked: level 1, spot A4" }).click();
  await where.getByRole("button", { name: "Forget", exact: true }).click();
  await expect(where).not.toContainText("level 1");
  await expect(where).toContainText("Parked: level 3, spot B12");

  // The timeline has them too.
  await page.getByRole("group", { name: "Show memories" }).getByRole("button", { name: "Timeline" }).click();
  await expect(page.locator(".memories")).toContainText("Birthday:");
});

test("A from another screen lands in the line", async () => {
  const page = await openApp();
  await page.getByLabel("Main").getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();

  await page.keyboard.press("a");

  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByLabel("Anything, in one line")).toBeFocused();
  // And the A itself did not land in the line.
  await expect(page.getByLabel("Anything, in one line")).toHaveValue("");
});

// The model on this machine (PLAN.md, part five, phase 20). Not in git: npm run
// fetch-model puts it in resources/model, and this is skipped without it.
const MODEL_HERE = existsSync(join(process.cwd(), "resources", "model", "model.onnx"));

test("a line the rules only guessed at is given a second opinion, and kept where it says", async () => {
  test.skip(!MODEL_HERE, "The model is not on this machine: npm run fetch-model.");
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");

  // No marker word, so the rules fall to a note; what it sounds like is an idea.
  await line.fill("a plugin that summarises lectures");
  const reading = page.locator(".quickadd__reading");
  // The model starts in its own process the first time it is asked.
  await expect(reading.locator("[data-opinion]")).toHaveText(/it sounds like an idea/, { timeout: 20_000 });

  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toBeVisible();
  const ideas = await page.evaluate(async () => {
    const { activeCompanyId } = await window.caulder.companies.list();
    return (await window.caulder.brain.section(activeCompanyId ?? "", "ideas", false)).map((one) => one.title);
  });
  expect(ideas.some((title) => /plugin that summarises lectures/i.test(title))).toBe(true);
});
