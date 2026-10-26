import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, openBrainSection, passSetup } from "./nav";

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
  // "4:00 pm" in India, "4:00 PM" in the US: written the way it is where the company is (phase 24).
  await expect(reading).toContainText(/4:00\sPM/i);
  await expect(page.locator(".quickadd__aside")).toContainText("Read “meetining” as meeting.");

  // One press keeps the word as typed, and the cursor goes back to the line.
  await page.getByRole("button", { name: "Keep “meetining”" }).click();
  await expect(reading.locator(".quickadd__title")).toHaveText("Meetining with rahul from ms puc");
  await expect(line).toBeFocused();

  // A slip it is left to mend is asked about in Settings once the task is in.
  await line.fill("invocie tmrw");
  await expect(reading.locator(".quickadd__title")).toHaveText("Invoice");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Invoice");

  await page.getByLabel("Main").getByRole("button", { name: "Settings", exact: true }).click();
  const tune = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Tune" }) });
  await expect(tune.locator(".tune__question")).toContainText("invocie");
  await tune.getByRole("button", { name: "Yes, same thing" }).click();
  await expect(tune.getByRole("list", { name: "What you have settled" })).toContainText("invocie is read as invoice");
  // The word kept under the line was settled there, and is listed with it.
  await expect(tune.getByRole("list", { name: "What you have settled" })).toContainText("meetining is left as typed");

  // Settled, so it is read without comment from now on.
  await page.getByLabel("Main").getByRole("button", { name: "Today", exact: true }).click();
  await line.fill("invocie friday");
  await expect(reading.locator(".quickadd__title")).toHaveText("Invoice");
  // Nothing said about the slip - only, now, that an Invoice is already there.
  await expect(page.locator(".quickadd__aside")).not.toContainText("Read “invocie”");
  await expect(page.locator(".quickadd__aside")).toContainText("“Invoice” is already there");
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

test("Today says hello, takes a name in the setup line, and the line says little", async () => {
  const page = await openApp();
  const hello = page.locator(".today__greeting");
  await expect(hello).toHaveText(/[.?]$/);

  // The empty line: the key, and an invitation. Not a paragraph.
  await expect(page.locator(".quickadd__hint").first()).toContainText("call Priya tomorrow 4pm");
  await expect(page.locator(".quickadd__hint").first().locator("kbd")).toHaveText(/^(A|.+\+.+)$/);

  // No name yet: Finish setting up offers to take one, in place, and then it greets by the first of them only.
  // An earlier test may have pressed Skip all, which waves the name away with the rest: asked afresh.
  await page.evaluate(() => localStorage.removeItem("caulder.setup.skipped"));
  await page.getByLabel("Main").getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Main").getByRole("button", { name: /^Today/ }).click();
  await page.getByRole("button", { name: "Your name", exact: true }).click();
  await page.getByLabel("Your first name").fill("Adi Vinod");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Your name", exact: true })).toHaveCount(0);
  // It names you - and never by your surname.
  await expect(hello).toContainText("Adi");
  await expect(hello).not.toContainText("Vinod");

  // And it is the same name Settings has, not a second copy.
  expect(await page.evaluate(() => window.caulder.me.get())).toBe("Adi Vinod");

  // One plain line by the hour, and nothing cleverer beside the day's work.
  await expect(hello).toHaveText(/^Good (morning|afternoon|evening), Adi\.$/);
  await expect(page.locator(".today__aside")).toHaveCount(0);

  // The hello holds still while Today redraws around it: it is this morning's, not this render's.
  const before = await hello.innerText();
  await page.getByLabel("Main").getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Main").getByRole("button", { name: "Today", exact: true }).click();
  await expect(hello).toHaveText(before);
});

test("a line moved somewhere else before it is kept teaches the next one like it", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  const goes = page.getByRole("group", { name: "Where it goes" });

  // Read as a thing to do, because it starts with one. It is a thought: moved to Idea by hand, then kept.
  await line.fill("look into a loyalty card for regulars");
  await expect(goes.getByRole("button", { name: "Task", exact: true })).toHaveAttribute("aria-pressed", "true");
  await goes.getByRole("button", { name: "Idea", exact: true }).click();
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toBeVisible();

  // The next line like it goes to Idea by itself, and says why.
  await line.fill("look into a loyalty card for the cafe");
  await expect(goes.getByRole("button", { name: "Idea", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-learnt]")).toContainText("look into a loyalty card for regulars");
  await line.fill("");

  // And Settings lists it, with a way to take it back - after which the line is back to guessing.
  await page.getByLabel("Main").getByRole("button", { name: "Settings" }).click();
  const learnt = page.locator(".card").filter({ has: page.getByRole("heading", { name: "What the line has learnt" }) });
  await expect(learnt).toContainText("look into a loyalty card for regulars");
  await expect(learnt).toContainText("is an idea");
  await learnt.getByRole("button", { name: /Forget what was learnt from "look into a loyalty card for regulars"/ }).click();
  // Other tests in this file teach lessons of their own; this one is gone, and the line is back to guessing.
  await expect(learnt).not.toContainText("look into a loyalty card for regulars");
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

test("a line that says remind me says it will, and Settings has the brief and a test", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  await line.fill("remind me tomorrow at 6pm to call the plumber");
  await expect(page.locator(".quickadd__aside")).toContainText(/A Windows notification at 6:00\sPM, tomorrow/i);
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Call the plumber");
  // Kept as a reminder against the task, at its day and time.
  // The brief is on at nine until switched off (23 October 2026).
  const kept = await page.evaluate(() => window.caulder.nudges.get());
  expect(kept).toEqual({ briefAt: "09:00" });

  await page.getByLabel("Main").getByRole("button", { name: "Settings" }).click();
  const brief = page.getByRole("switch", { name: "A morning brief of what matters today" });
  await expect(brief).toHaveAttribute("aria-checked", "true");
  await brief.click();
  await expect(brief).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => page.evaluate(() => window.caulder.nudges.get())).toEqual({ briefAt: null });
  await brief.click();
  await expect.poll(() => page.evaluate(() => window.caulder.nudges.get())).toEqual({ briefAt: "09:00" });

  // The test is sent, and says where to look if Windows holds it back.
  await page.getByRole("button", { name: "Send a test notification" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Sent|not letting/ })).toBeVisible();

  await brief.click();
  await expect.poll(() => page.evaluate(() => window.caulder.nudges.get())).toEqual({ briefAt: null });
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
  await expect(page.locator(".quickadd__read")).toContainText(/Move “Dentist appointment” to Tomorrow at 5:00\sPM/i);
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText(/Moved “Dentist appointment” to tomorrow at 5:00\sPM/i);
  await line.fill("what's on tomorrow");
  await expect(page.locator(".quickadd__found li").filter({ hasText: "Dentist appointment" })).toContainText(/5\sPM/i);

  // Cancelled, and put back.
  await line.fill("cancel the dentist");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Cancelled “Dentist appointment”");
  await page.locator(".quickadd__added").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".quickadd__added")).toContainText("Back: “Dentist appointment”");

  // Adding somebody who is a contact already never makes a second of them: with nothing new said, they are opened.
  await line.fill("add contact rahul nair from ms puc");
  await expect(page.locator(".quickadd__read")).toContainText("Open MS PUC");

  // "Him" is who the last line was about.
  await line.fill("add contact vikram shah from tide labs");
  await line.press("Enter");
  await line.fill("met vikram shah, wants a demo");
  await line.press("Enter");
  await line.fill("send him the deck tomorrow");
  await expect(page.locator(".quickadd__aside")).toContainText("“him” is Vikram Shah, from your last line.");

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

test("a line about somebody leaves their next step, a later line updates them, and a misspelt name is asked about", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  const read = page.locator(".quickadd__read");

  // Somebody new, what happened, and what he asked for - with nothing in it that says "remind me".
  await line.fill("Sumanth from RV puc asked me to reach out to him next week. I messaged him on linkedin.");
  await expect(read).toContainText("New contact: Sumanth at RV PUC");
  await expect(read).toContainText("as a LinkedIn message");
  await expect(read).toContainText("“Reach out to Sumanth”");
  await expect(read).toContainText("with a reminder that morning");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("New contact: Sumanth at RV PUC");

  const kept = async () =>
    page.evaluate(async () => {
      const { activeCompanyId } = await window.caulder.companies.list();
      const leads = await window.caulder.leads.list({ companyId: activeCompanyId ?? "", sort: "name", direction: "asc" });
      const lead = leads.find((each) => each.name === "RV PUC");
      if (!lead) return null;
      const tasks = await window.caulder.tasks.forLead(lead.id);
      const history = await window.caulder.activities.list(lead.id);
      return { phone: lead.phone, tasks: tasks.map((task) => task.title).sort(), kinds: history.map((entry) => entry.kind) };
    });
  expect(await kept()).toMatchObject({ phone: null, tasks: ["Reach out to Sumanth"] });
  // What he was sent is a LinkedIn message on his history, which is what "who has not answered" reads.
  expect((await kept())?.kinds).toContain("linkedin");

  // Later, more about the same person - by half his company's name - changes him rather than making another.
  await line.fill("Sumanth from rv, i got his number it is 9686012345");
  await expect(read).toContainText("Save 9686012345 on RV PUC");
  await line.press("Enter");
  await expect.poll(async () => (await kept())?.phone).toBe("9686012345");

  // A name spelt wrongly is asked about, and nothing is kept until it is answered.
  await line.fill("sumnath said i should text him on whatsapp");
  const who = page.getByRole("group", { name: /is that Sumanth, RV PUC\?/ });
  await expect(who).toBeVisible();
  await line.press("Enter");
  await expect(who.getByRole("button", { name: "Yes" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(who).toHaveCount(0);
  await expect(read).toContainText("on RV PUC's history");
  await expect(read).toContainText("“Text Sumanth on whatsapp” tomorrow");

  // No day was said, so it asks - and tomorrow stands unless another is chosen.
  const when = page.getByRole("group", { name: /Text Sumanth on whatsapp.* - when\?/ });
  await when.getByRole("button", { name: "Today" }).click();
  await expect(read).toContainText("“Text Sumanth on whatsapp” today");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("On RV PUC's history, and “Text Sumanth on whatsapp” today");
  await expect.poll(async () => (await kept())?.tasks).toEqual(["Reach out to Sumanth", "Text Sumanth on whatsapp"]);
});

test("somebody the line does not know is asked about: where they are from, or only a task", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  const read = page.locator(".quickadd__read");
  const people = async () =>
    page.evaluate(async () => {
      const { activeCompanyId } = await window.caulder.companies.list();
      const leads = await window.caulder.leads.list({ companyId: activeCompanyId ?? "", sort: "name", direction: "asc" });
      return Promise.all(
        leads.map(async (lead) => ({ name: lead.name, person: lead.contactPerson, tasks: (await window.caulder.tasks.forLead(lead.id)).map((task) => task.title) })),
      );
    });

  // A name, something owed, and nowhere he is from: it asks rather than keeping a task about nobody.
  await line.fill("Girish asked me to reach out next week");
  const where = page.getByRole("textbox", { name: "Where is Girish from?" });
  await expect(where).toBeVisible();
  await expect(read).toContainText("Reach out to Girish");
  // Enter goes to the question, and the answer is typed.
  await line.press("Enter");
  await expect(where).toBeFocused();
  await where.fill("jain college");
  await where.press("Enter");
  await expect(where).toHaveCount(0);
  await expect(read).toContainText("New contact: Girish at Jain College");
  await expect(read).toContainText("“Reach out to Girish”");
  await expect(line).toBeFocused();
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("New contact: Girish at Jain College");
  await expect.poll(people).toContainEqual({ name: "Jain College", person: "Girish", tasks: ["Reach out to Girish"] });

  // Nobody worth keeping: Enter on an empty answer is "only a task", said the way a task is.
  await line.fill("Farhan asked me to call back tomorrow");
  const other = page.getByRole("textbox", { name: "Where is Farhan from?" });
  await line.press("Enter");
  await expect(other).toBeFocused();
  await other.press("Enter");
  await expect(other).toHaveCount(0);
  await expect(read).toContainText("Call Farhan back");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Call Farhan back");
  expect((await people()).some((each) => each.person === "Farhan")).toBe(false);

  // Somebody who is not a name is not asked about.
  await line.fill("the client asked me to send the invoice tomorrow");
  await expect(page.getByRole("textbox", { name: /Where is .* from\?/ })).toHaveCount(0);
});

test("a rule the company keeps goes to its page in How we work, is replaced on a yes, and is there when a quote is written", async () => {
  const page = await openApp();
  const line = page.getByLabel("Anything, in one line");
  const read = page.locator(".quickadd__read");
  const added = page.locator(".quickadd__added");

  // A rule has a page of its own, named before Enter - not the page of everything.
  await line.fill("we never discount retainers");
  await expect(read).toContainText("a rule, on Pricing and discounts in How we work");
  await line.press("Enter");
  await expect(added).toContainText("Remembered, on Pricing and discounts");

  await line.fill("we invoice on the 1st");
  await expect(read).toContainText("a rule, on Billing and payment in How we work");
  await line.press("Enter");
  await expect(added).toContainText("Remembered, on Billing and payment");

  // Said again another way: asked whether it is instead of the first, and the first let go only on a yes.
  await line.fill("we invoice on the 15th now");
  await line.press("Enter");
  await expect(added).toContainText("Is it instead of “we invoice on the 1st”?");
  await added.getByRole("button", { name: "Yes, let that one go" }).click();
  await expect(added).toContainText("Replaced “we invoice on the 1st”");

  // Asked for, the line answers from the rules - on this computer.
  await line.fill("what is our policy on discounts");
  await expect(read).toContainText("we never discount retainers");
  await line.fill("");

  // Where the question comes up: the pricing and the terms beside a new quote.
  await goTo(page, "Money");
  await page.getByRole("tab", { name: "Quotes" }).click();
  await page.getByRole("button", { name: "New quote" }).click();
  const rules = page.getByRole("complementary", { name: "Your rules on this" });
  await expect(rules).toContainText("Pricing and discounts");
  await expect(rules).toContainText("we never discount retainers");
  await expect(rules).toContainText("we invoice on the 15th now");
  await expect(rules).not.toContainText("we invoice on the 1st");
  await page.keyboard.press("Escape");

  // A page of what was remembered before there were subjects, sorted: each line offered a home, moved on a yes.
  const pile = await page.evaluate(async () => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const companyId = activeCompanyId ?? "";
    const say = (said: string, pageId: string | null) =>
      window.caulder.brain.remember({ companyId, pageId, topic: pageId ? null : "Things to remember", said, fact: null, day: "2026-09-01" });
    const first = await say("we always take half up front", null);
    await say("the printer on fourth takes A3", first.pageId);
    await say("we don't take calls before 10", first.pageId);
    return first.pageId;
  });
  expect(pile).toBeTruthy();
  await openBrainSection(page, "Remembered");
  await page.getByRole("button", { name: /Things to remember/ }).first().click();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: /Sort this page/ }).click();
  const sorting = page.getByRole("region", { name: "Sort this page" });
  await expect(sorting).toContainText("2 of 3 lines would be better kept somewhere else");
  await expect(sorting).toContainText("To How we work · Billing and payment");
  await expect(sorting).toContainText("To How we work · Hours and replies");
  // One left where it is.
  await sorting.getByRole("checkbox", { name: "we don't take calls before 10" }).uncheck();
  await sorting.getByRole("button", { name: "Move 1 line" }).click();
  await expect(sorting).toHaveCount(0);
  await expect(page.locator(".bpage__card")).not.toContainText("we always take half up front");
  await expect(page.locator(".bpage__card")).toContainText("we don't take calls before 10");

  await openBrainSection(page, "How we work");
  await page.getByRole("button", { name: /Billing and payment/ }).first().click();
  await expect(page.locator(".bpage__card")).toContainText("we always take half up front");
  await expect(page.locator(".bpage__card")).toContainText("we invoice on the 15th now");
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

  // No shape the rules know, so they fall to a note; what it sounds like is
  // something to remember. (Chosen by reading candidates with the real model,
  // 10 October 2026: the rules read this one as a note they only guessed at.)
  await line.fill("the auditor signs off accounts in september");
  const reading = page.locator(".quickadd__reading");
  // The model starts in its own process the first time it is asked.
  await expect(reading.locator("[data-opinion]")).toHaveText(/it sounds like something to remember/, { timeout: 20_000 });

  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toBeVisible();
  const found = await page.evaluate(async () => {
    const { activeCompanyId } = await window.caulder.companies.list();
    return window.caulder.brain.search(activeCompanyId ?? "", "auditor signs off");
  });
  expect(JSON.stringify(found)).toMatch(/auditor/i);
});
