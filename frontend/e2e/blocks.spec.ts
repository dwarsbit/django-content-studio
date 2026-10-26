import { expect, test } from "@playwright/test";

import { fieldByLabel, login, uniqueSuffix } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("the BlockField builds a page from blocks", async ({ page }) => {
  const title = `Block page ${uniqueSuffix()}`;
  const body = `Block text ${Date.now()}`;

  await page.goto("/admin/content/demo_blog.landingpage/new");
  await fieldByLabel(page, "title").fill(title);
  await expect(page.getByText("No blocks yet")).toBeVisible();

  await page.getByRole("button", { name: "Add block" }).click();
  await page.getByRole("option", { name: /Text/ }).click();
  await page.getByTestId("block").locator("div[contenteditable=true]").click();
  await page.keyboard.type(body);

  // An image block without an image fails validation on that block.
  await page.getByRole("button", { name: "Add block" }).click();
  await page.getByRole("option", { name: /Image/ }).click();
  await expect(page.getByText("2 of 20 blocks")).toBeVisible();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("This field cannot be blank.")).toBeVisible();

  // Removing it keeps the text block's edits, and the page saves.
  await page.getByRole("button", { name: "More actions for Image" }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/content\/demo_blog\.landingpage\/\d+$/);

  await page.reload();
  await expect(page.getByText("1 of 20 blocks")).toBeVisible();
  await expect(
    page.getByTestId("block").locator("div[contenteditable=true]"),
  ).toHaveText(body);
});
