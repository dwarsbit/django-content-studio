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
  const dialog = page.getByRole("dialog");

  await page.goto("/admin/content/demo_blog.landingpage");
  await page.getByRole("link", { name: "Create" }).click();
  await expect(dialog).toBeVisible();

  await fieldByLabel(dialog, "title").fill(title);

  // The HTMLField renders a TipTap editor, not a plain textarea.
  const editor = dialog.locator("div[contenteditable=true]");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type(body);

  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("row", { name: new RegExp(title) }),
  ).toBeVisible();

  // Reopening shows the persisted rich text.
  await page.getByRole("row", { name: new RegExp(title) }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(body)).toBeVisible();
});
