import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, newPage, openBrainSection, passSetup } from "./nav";

/**
 * The company brain, in a real window (PLAN.md, phase 6).
 *
 * One launch for the whole file, in order: what one test writes, the next
 * one finds - the way a founder fills the brain in over a week.
 *
 * Set CAULDER_SHOTS to a folder to keep a screenshot of each screen.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

async function shot(name: string) {
  const folder = process.env["CAULDER_SHOTS"];
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, `brain-${name}.png`) });
}

const rail = () => page.getByRole("navigation", { name: "Brain sections" });

async function openSection(name: string) {
  await openBrainSection(page, name);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function writeBody(text: string) {
  await page.getByLabel("Page", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
}

async function addContact(name: string, relationship?: string) {
  await goTo(page, "Contacts");
  await page.getByRole("button", { name: /^Add a? ?contact$/ }).first().click();
  await page.getByLabel("Name").fill(name);
  if (relationship) {
    await page.getByLabel("Relationship").click();
    await page.getByRole("option", { name: relationship }).click();
  }
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-brain-"));
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();
  await passSetup(page);
  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("the brain has its own row, a key, and a list of what to write first", async () => {
  await page.keyboard.press("b");
  await expect(page.getByRole("heading", { name: "Brain", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "0 of 12 written down" })).toBeVisible();
  // Home, the Map, All sections and Share and export: a section joins the rail when it holds something.
  await expect(rail().getByRole("button")).toHaveCount(4);
  await shot("home-empty");
});

test("the profile keeps its numbers masked, and ticks the list as it fills", async () => {
  await page.getByRole("button", { name: "Write the profile" }).click();

  // A page nobody has written opens ready to write.
  await page.getByLabel("One-liner").fill("Timetables for schools");
  await page.getByLabel("Entity type").click();
  await page.getByRole("option", { name: "LLP" }).click();
  await page.getByLabel("Sales tax, VAT or GST number").fill("29AAACU9876K1Z5");
  await page.getByLabel("Tax ID", { exact: true }).fill("AAACU9876K");
  await shot("profile-editing");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText("•••• 876K")).toBeVisible();
  await expect(page.getByText("AAACU9876K", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Show the Tax ID" }).click();
  await expect(page.getByText("AAACU9876K", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide the Tax ID" }).click();
  await expect(page.getByText("AAACU9876K", { exact: true })).toHaveCount(0);
  await shot("profile");

  await rail().getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("img", { name: "2 of 12 written down" })).toBeVisible();
  await expect(page.getByText("Timetables for schools")).toBeVisible();
  // The list shows what is left; the whole of it is a click away.
  await expect(page.getByRole("button", { name: /The one-liner/ })).toHaveCount(0);
  await page.getByRole("button", { name: "All 12" }).click();
  await expect(page.getByRole("button", { name: /The one-liner, written/ })).toBeVisible();
  await expect(rail().getByRole("button", { name: /^Company/ })).toBeVisible();
  await shot("home");
});

test("editing the profile without touching the PAN keeps it", async () => {
  await page.getByRole("button", { name: "Open the profile" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("One-liner").fill("Timetables that write themselves");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("•••• 876K")).toBeVisible();
});

test("a page keeps its versions, and an old one can be put back", async () => {
  await openSection("Plan");
  await newPage(page, "Risk");
  await page.getByLabel("Title").fill("Losing the pilot school");
  await writeBody("Oakridge might not renew.");
  await expect(page.getByRole("heading", { name: "Losing the pilot school" })).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  const history = page.getByRole("region", { name: "Page history" });
  await expect(history.getByText("2 versions.")).toBeVisible();
  await expect(history.locator(".diff__cell--added", { hasText: "Oakridge might not renew." })).toBeVisible();
  await expect(history.getByText(/Title: Risk → Losing the pilot school/)).toBeVisible();
  await shot("history");

  await history.getByRole("button", { name: "Put the first one back" }).click();
  await expect(page.getByRole("heading", { name: "What would happen" })).toBeVisible();
  await expect(page.getByText("Oakridge might not renew.", { exact: true })).toHaveCount(0);
  // The whole version comes back, title included.
  await expect(page.getByRole("heading", { name: "Risk", exact: true })).toBeVisible();
  await expect(history.getByText("3 versions.")).toBeVisible();
});

test("a playbook's steps tick in place, and stay ticked", async () => {
  await openSection("Playbooks");
  await newPage(page, "Playbook");
  await page.getByLabel("Title").fill("Onboarding a school");
  await writeBody("## Steps\n\n- [ ] Send the welcome pack\n- [ ] Book the training call");

  const step = page.getByRole("checkbox", { name: "Send the welcome pack" });
  await step.check();
  await expect(step).toBeChecked();

  await openSection("Playbooks");
  await page.getByRole("button", { name: /Onboarding a school/ }).click();
  await expect(page.getByRole("checkbox", { name: "Send the welcome pack" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Book the training call" })).not.toBeChecked();
  await shot("playbook");
});

test("Ctrl+K finds pages and contacts, and opens what it finds", async () => {
  await addContact("Oakridge School");

  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox", { name: "Search everything" });
  await expect(search).toBeFocused();

  await search.fill("oakr");
  const results = page.getByRole("listbox", { name: "Results" });
  await expect(results.getByRole("option", { name: /Contact\s*Oakridge School/ })).toBeVisible();

  // A page is found by its text as well as its title, and says its section.
  await search.fill("welcome pack");
  await expect(results.getByRole("option", { name: /Playbooks\s*Onboarding a school/ })).toBeVisible();
  await shot("search");
  await search.press("Enter");

  await expect(page.getByRole("dialog", { name: "Search everything" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Onboarding a school" })).toBeVisible();

  // Escape closes it without going anywhere.
  await page.keyboard.press("Control+k");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Search everything" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Onboarding a school" })).toBeVisible();
});

test("a caught note can be filed into Ideas, or put back", async () => {
  await goTo(page, "Today");
  const notes = page.getByLabel("Write a note");

  await notes.fill("Referral bonus for schools");
  await page.getByRole("button", { name: "Keep it" }).click();
  await page.getByRole("button", { name: 'File "Referral bonus for schools" in the brain' }).click();
  await page.getByRole("button", { name: "File it", exact: true }).click();
  await expect(page.getByText("Filed in Ideas as “Referral bonus for schools”.")).toBeVisible();
  await expect(page.locator(".note", { hasText: "Referral bonus for schools" })).toHaveCount(0);

  await notes.fill("Parents newsletter");
  await page.getByRole("button", { name: "Keep it" }).click();
  await page.getByRole("button", { name: 'File "Parents newsletter" in the brain' }).click();
  await page.getByRole("button", { name: "File it", exact: true }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".note", { hasText: "Parents newsletter" })).toBeVisible();

  await goTo(page, "Brain");
  await rail().getByRole("button", { name: /^Ideas/ }).click();
  await expect(page.getByRole("button", { name: /Referral bonus for schools/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Parents newsletter/ })).toHaveCount(0);
});

test("an accountant is a contact, not a deal", async () => {
  await addContact("Sharma & Co", "Accountant");
  await expect(page.getByText("Accountant", { exact: true })).toBeVisible();

  await goTo(page, "Deals");
  await expect(page.getByText("Oakridge School")).toBeVisible();
  await expect(page.getByText("Sharma & Co")).toHaveCount(0);

  await goTo(page, "Contacts");
  await page.getByLabel("Filter by relationship").click();
  await page.getByRole("option", { name: "Accountant" }).click();
  await expect(page.locator(".leadrow__name", { hasText: "Sharma & Co" })).toBeVisible();
  await expect(page.locator(".leadrow__name", { hasText: "Oakridge School" })).toHaveCount(0);
});

test("[[ links a page to a page and a contact, and both know it", async () => {
  // Products themselves are on Money now; this section is the thinking.
  await openSection("Products and pricing");
  await page.getByRole("button", { name: "Blank page" }).click();
  await page.getByLabel("Title").fill("Workshop");
  await writeBody("Our main offer.");

  await openSection("Decisions");
  await page.getByRole("button", { name: "Write down a decision" }).click();
  await page.getByLabel("Title").fill("Annual billing only");
  const text = page.getByLabel("Page", { exact: true });
  await text.fill("");
  await text.pressSequentially("We sell the [[Work");
  const picker = page.getByRole("listbox", { name: "Suggestions" });
  await expect(picker.getByRole("option", { name: /Workshop/ })).toBeVisible();
  await shot("linking");
  await text.press("Enter");
  await text.pressSequentially(" to [[Oak");
  await expect(picker.getByRole("option", { name: /Oakridge School/ })).toBeVisible();
  await text.press("Enter");
  await expect(picker).toHaveCount(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // The text shows chips; a chip opens what it points at.
  const chip = page.locator(".prose").getByRole("button", { name: "Workshop" });
  await expect(chip).toBeVisible();
  await expect(page.locator(".prose").getByRole("button", { name: "Oakridge School" })).toBeVisible();
  await shot("page-links");
  await chip.click();
  await expect(page.getByRole("heading", { name: "Workshop", exact: true })).toBeVisible();

  // The page linked to says so, and draws what is around it.
  const linkedHere = page.locator(".brainlinks");
  await expect(linkedHere.getByRole("button", { name: /Annual billing only/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /What is around this page/ })).toBeVisible();

  // Renaming the target renames the link where it is written.
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Title").fill("Workshop full day");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await linkedHere.getByRole("button", { name: /Annual billing only/ }).click();
  await expect(page.locator(".prose").getByRole("button", { name: "Workshop full day" })).toBeVisible();

  // And the contact knows too.
  await page.locator(".prose").getByRole("button", { name: "Oakridge School" }).click();
  await expect(page.getByRole("heading", { name: "Oakridge School" })).toBeVisible();
  await expect(page.locator(".brainlinks").getByRole("button", { name: /Annual billing only/ })).toBeVisible();
});

test("the map draws the company, and lists it for the keyboard", async () => {
  await goTo(page, "Brain");
  await expect(page.getByRole("img", { name: /A small map of the company: \d+ dots and 2 links/ })).toBeVisible();
  await shot("home-map");

  await rail().getByRole("button", { name: "Map" }).click();
  await expect(page.getByRole("img", { name: /The map: \d+ dots and 2 links/ })).toBeVisible();
  // Let the layout settle before the picture.
  await page.waitForTimeout(1500);
  await shot("map");

  await page.getByRole("button", { name: "As a list" }).click();
  const list = page.getByRole("list", { name: "Everything on the map" });
  const decision = list
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Annual billing only", exact: true }) });
  await expect(decision).toContainText("Linked to");
  await expect(decision).toContainText("Workshop full day");
  await expect(list.getByRole("button", { name: "Oakridge School" })).toBeVisible();

  // The filters are the legend: switching a kind off takes its dots away.
  await page.getByRole("group", { name: "Show on the map" }).getByRole("button", { name: "Contacts" }).click();
  await expect(list.getByRole("button", { name: "Oakridge School" })).toHaveCount(0);
  await shot("map-list");

  await page.getByRole("button", { name: "As a list" }).click();
  await page.getByRole("button", { name: "Replay" }).click();
  await expect(page.getByRole("button", { name: "Back to now" })).toBeVisible();
  await page.getByRole("button", { name: "Back to now" }).click();

  // A dot in the list opens its page.
  await page.getByRole("button", { name: "As a list" }).click();
  await list.getByRole("button", { name: "Annual billing only" }).click();
  await expect(page.getByRole("heading", { name: "Annual billing only" })).toBeVisible();
  await expect(page.getByRole("button", { name: "The map" })).toBeVisible();
});

test("the whole brain exports as Markdown, masked unless asked", async () => {
  const target = join(userDataDir, "exported");
  mkdirSync(target, { recursive: true });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] } as never);
  }, target);

  await goTo(page, "Brain");
  await rail().getByRole("button", { name: "Share and export" }).click();
  await page.getByRole("button", { name: "Export the brain" }).click();
  await expect(page.getByText(/files written to/)).toBeVisible();

  const [folder] = readdirSync(target);
  const root = join(target, folder ?? "");
  expect(existsSync(join(root, "README.md"))).toBe(true);
  const profile = readFileSync(join(root, "01 Company", "Company profile.md"), "utf8");
  expect(profile).toContain("- **Tax ID:** •••• 876K");
  expect(profile).not.toContain("**Tax ID:** AAACU9876K");
  expect(readdirSync(join(root, "08 Playbooks"))).toEqual(["Onboarding a school.md"]);

  // A link is a link in the files too: relative to the page it points at.
  const decision = readFileSync(join(root, "11 Decisions", "Annual billing only.md"), "utf8");
  expect(decision).toContain(
    "We sell the [Workshop full day](../03%20Products%20and%20pricing/Workshop%20full%20day.md) to **Oakridge School**",
  );
});
