import { expect, test } from "@playwright/test";

import { fieldByLabel, login, rowByText, uniqueSuffix } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("navigates to a model through the menu", async ({ page }) => {
  await page.getByRole("button", { name: "Content" }).click();
  await page.getByRole("link", { name: "articles" }).click();
  await expect(page).toHaveURL(/\/content\/demo_blog\.article/);
  await expect(
    page.getByRole("columnheader", { name: "title", exact: true }),
  ).toBeVisible();
});

test("creates, edits and deletes an article", async ({ page }) => {
  const title = `E2E article ${uniqueSuffix()}`;
  const editedTitle = `${title} (edited)`;
  const dialog = page.getByRole("dialog");

  // Create
  await page.goto("/admin/content/demo_blog.article");
  await page.getByRole("link", { name: "Create" }).click();
  await expect(dialog).toBeVisible();
  await fieldByLabel(dialog, "title").fill(title);
  await fieldByLabel(dialog, "body").fill("Written by the e2e suite.");
  await dialog.locator("[data-slot=select-trigger]").click();
  await page.getByRole("option", { name: "Published" }).click();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rowByText(page, title)).toBeVisible();

  // Edit
  await rowByText(page, title).click();
  await expect(dialog).toBeVisible();
  await fieldByLabel(dialog, "title").fill(editedTitle);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rowByText(page, editedTitle)).toBeVisible();

  // Delete
  await rowByText(page, editedTitle).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("group").getByRole("button").last().click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(rowByText(page, editedTitle)).toHaveCount(0);
});

test("searches the list", async ({ page }) => {
  const title = `Searchable article ${uniqueSuffix()}`;

  await page.goto("/admin/content/demo_blog.article");
  await page.getByRole("link", { name: "Create" }).click();
  await fieldByLabel(page.getByRole("dialog"), "title").fill(title);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create" })
    .click();
  await expect(rowByText(page, title)).toBeVisible();

  await page.getByPlaceholder("Search").fill(title);
  await expect(rowByText(page, title)).toBeVisible();
  await expect(rowByText(page, "Hello, Content Studio")).toHaveCount(0);
});

test("adds an inline review to the seeded article", async ({ page }) => {
  const reviewText = `Inline review ${uniqueSuffix()}`;

  await page.goto("/admin/content/demo_blog.article");
  await rowByText(page, "Hello, Content Studio").click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByRole("tab", { name: "reviews" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create" })
    .click();

  const reviewDialog = page.getByRole("dialog").last();
  await expect(reviewDialog).toBeVisible();
  await fieldByLabel(reviewDialog, "text").fill(reviewText);
  await reviewDialog.getByRole("button", { name: "Create" }).click();
  await expect(
    // The inline column shows __str__, which the demo model truncates.
    rowByText(page, reviewText.slice(0, 20)),
  ).toBeVisible();
});

test("the active model's group starts expanded after a reload", async ({
  page,
}) => {
  await page.goto("/admin/content/demo_blog.landingpage");

  // Deep link into a model page: the group holding the active model is
  // already expanded, no click needed.
  await expect(page.getByRole("link", { name: "landing pages" })).toBeVisible();
});
