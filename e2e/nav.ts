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
