import type { Page } from "@playwright/test";

/**
 * Picks from the app's own dropdown, the way a person does.
 *
 * The native `<select>` answered to Playwright's `selectOption`, which sets the
 * value without opening anything. The app's picker is a button and a listbox,
 * so this opens it and clicks the row - which also means the suite now
 * exercises the list actually appearing, the part the old helper skipped.
 */
export async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** A choice made from a row of chips, found by the group's own label. */
export async function pick(page: Page, group: string, option: string): Promise<void> {
  await page
    .getByRole("radiogroup", { name: group, exact: true })
    .getByRole("radio", { name: option, exact: true })
    .click();
}
