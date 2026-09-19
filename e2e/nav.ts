import type { Page } from "@playwright/test";

/**
 * Goes to a screen the way a person does.
 *
 * Import is a button on Contacts rather than a sidebar row, so a test that
 * wants it clicks its way in through the screen it lives on, which is also
 * what makes the test honest about where the thing is.
 */
export async function goTo(page: Page, screen: string): Promise<void> {
  const nav = page.getByLabel("Main");

  switch (screen) {
    case "Import":
      await nav.getByRole("button", { name: "Contacts", exact: true }).click();
      await page.locator(".leads__toolbar").getByRole("button", { name: "Import", exact: true }).click();
      return;
    default:
      // Today carries the overdue count in its accessible name ("Today 1"),
      // so the match allows a trailing number and nothing else.
      await nav.getByRole("button", { name: new RegExp("^" + screen + "( [0-9]+)?$") }).click();
  }
}

/**
 * Past the setup guide, which a new company lands on.
 *
 * Connecting Google and an AI happens in somebody else's console, so a real
 * company opens on the guide for it. A suite that is about something else
 * skips it, the way a person would.
 */
export async function passSetup(page: Page): Promise<void> {
  const skip = page.getByRole("button", { name: "Skip this for now" });
  if (await skip.count()) await skip.click();
}

/**
 * A section of the company's brain. The rail lists only the sections that
 * hold something, so an empty one is opened from All sections, the way a
 * person starting one would.
 */
export async function openBrainSection(page: Page, name: string): Promise<void> {
  await goTo(page, "Brain");
  const rail = page.getByRole("navigation", { name: "Brain sections" });
  const onRail = rail.getByRole("button", { name: new RegExp("^" + name) });
  if (await onRail.count()) {
    await onRail.first().click();
    return;
  }
  await rail.getByRole("button", { name: "All sections" }).click();
  await page.getByRole("list").filter({ has: page.locator(".sectionsindex__item") }).getByRole("button", { name: new RegExp("^" + name) }).click();
}

/** A new page of one kind, from a section's New page menu. */
export async function newPage(page: Page, kind: string): Promise<void> {
  await page.getByRole("button", { name: "New page" }).click();
  await page.getByRole("menuitem", { name: new RegExp("^" + kind) }).click();
}
