import { expect, test } from "@playwright/test";

import { fieldByLabel, login, uniqueSuffix } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("the Blueprint-integrated model renders the rich text widget", async ({
  page,
}) => {
  const title = `Landing page ${uniqueSuffix()}`;
  // Digit-only suffix: TipTap's typography extension rewrites "x" between
  // digits into a multiplication sign, which would break text matching.
  const body = `Rich text body ${Date.now()}`;

  await page.goto("/admin/content/demo_blog.landingpage");
  await page.getByRole("link", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/content\/demo_blog\.landingpage\/new$/);

  await fieldByLabel(page, "title").fill(title);

  // The HTMLField renders a TipTap editor, not a plain textarea.
  const editor = page.locator("div[contenteditable=true]");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type(body);

  await page.getByRole("button", { name: "Create" }).click();
  // Saving keeps the editor open; the route becomes the new object's.
  await expect(page).toHaveURL(/\/content\/demo_blog\.landingpage\/\d+$/);

  await page.getByRole("button", { name: "Back to the list" }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(title) }),
  ).toBeVisible();

  // Reopening shows the persisted rich text.
  await page.getByRole("row", { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(/\/content\/demo_blog\.landingpage\/\d+$/);
  await expect(page.getByText(body)).toBeVisible();
});
