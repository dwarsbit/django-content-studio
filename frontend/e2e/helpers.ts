import { expect, type Locator, type Page } from "@playwright/test";

export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin1234";

/**
 * Log in through the login form and wait for the studio to appear.
 */
export async function login(page: Page) {
  await page.goto("/admin/");
  await page.getByPlaceholder("Enter your username").fill(ADMIN_USERNAME);
  await page.getByPlaceholder("Enter your password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
}

/**
 * The form widgets wrap their input in a div, so label htmlFor associations
 * do not reach the input itself. Locate a field through its label text and
 * the first input or textarea that follows it.
 */
export function fieldByLabel(scope: Locator, label: string): Locator {
  return scope
    .locator("label")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .locator("xpath=following::*[self::input or self::textarea][1]");
}

/**
 * A unique suffix so repeated runs never collide on names.
 */
export function uniqueSuffix() {
  return Date.now().toString(36);
}

/**
 * Match a table row by its text content. Prefer this over
 * getByRole({ name }) with a RegExp built from user data: names are not
 * escaped, so parentheses in test data would silently break the pattern.
 */
export function rowByText(page: Page, text: string): Locator {
  return page.getByRole("row").filter({ hasText: text });
}
