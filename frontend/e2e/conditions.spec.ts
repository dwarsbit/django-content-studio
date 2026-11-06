import { expect, test } from "@playwright/test";

import { fieldByLabel, login } from "./helpers";

// The demo's article editor shows the publication date only for
// published articles, and a house style callout while the search
// description breaks the house style, which a Condition checks on the
// server.
test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/admin/content/demo_blog.article/new");
});

test("shows a field once the select has a value", async ({ page }) => {
  const publishedAt = page
    .locator("label")
    .filter({ hasText: /^published at$/ });

  await expect(fieldByLabel(page, "title")).toBeVisible();
  await expect(publishedAt).toHaveCount(0);

  await page.locator("[data-slot=select-trigger]").first().click();
  await page.getByRole("option", { name: "Published" }).click();
  await expect(publishedAt).toBeVisible();

  await page.locator("[data-slot=select-trigger]").first().click();
  await page.getByRole("option", { name: "Draft" }).click();
  await expect(publishedAt).toHaveCount(0);
});

test("shows a callout while a server check fails", async ({ page }) => {
  const callout = page
    .getByTestId("callout")
    .filter({ hasText: "House style" });
  const description = fieldByLabel(page, "meta description");

  await expect(description).toBeVisible();
  await expect(callout).toHaveCount(0);

  const checked = page.waitForResponse(
    (response) =>
      response.url().includes("/conditions/") && response.status() === 200,
  );
  await description.fill("CLICK HERE FOR NEWS");
  await checked;
  await expect(callout).toBeVisible();

  await description.fill("News from the demo site, every week.");
  await expect(callout).toHaveCount(0);
});
