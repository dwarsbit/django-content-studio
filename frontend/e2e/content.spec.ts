import { expect, test } from "@playwright/test";

import { fieldByLabel, login, rowByText, uniqueSuffix } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("navigates to a model through the menu", async ({ page }) => {
  // Groups start expanded; the heading collapses and expands them.
  const articles = page.getByRole("link", { name: "articles" });
  await expect(articles).toBeVisible();
  await page.getByRole("button", { name: "Content" }).click();
  await expect(articles).toBeHidden();
  await page.getByRole("button", { name: "Content" }).click();
  await articles.click();
  await expect(page).toHaveURL(/\/content\/demo_blog\.article/);
  await expect(
    page.getByRole("columnheader", { name: "title", exact: true }),
  ).toBeVisible();
});

test("creates, edits and deletes an article", async ({ page }) => {
  const title = `E2E article ${uniqueSuffix()}`;
  const editedTitle = `${title} (edited)`;
  const editorUrl = /\/content\/demo_blog\.article\/\d+/;
  const listUrl = /\/content\/demo_blog\.article$/;

  // Create
  await page.goto("/admin/content/demo_blog.article");
  await page.getByRole("link", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/content\/demo_blog\.article\/new$/);
  await fieldByLabel(page, "title").fill(title);
  await fieldByLabel(page, "body").fill("Written by the e2e suite.");
  await page.locator("[data-slot=select-trigger]").click();
  await page.getByRole("option", { name: "Published" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  // Saving keeps the editor open; after a create, the route becomes the
  // new object's.
  await expect(page).toHaveURL(editorUrl);

  await page.getByRole("button", { name: "Back to the list" }).click();
  await expect(page).toHaveURL(listUrl);
  await expect(rowByText(page, title)).toBeVisible();

  // Edit
  await rowByText(page, title).click();
  await expect(page).toHaveURL(editorUrl);
  await fieldByLabel(page, "title").fill(editedTitle);
  await page.getByRole("button", { name: "Save" }).click();
  // The header's breadcrumb shows the object's __str__, which refetches
  // after a successful save.
  await expect(page.getByText(editedTitle).first()).toBeVisible();
  await page.getByRole("button", { name: "Back to the list" }).click();
  await expect(page).toHaveURL(listUrl);
  await expect(rowByText(page, editedTitle)).toBeVisible();

  // Delete
  await rowByText(page, editedTitle).click();
  await expect(page).toHaveURL(editorUrl);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  // Deleting navigates back to the list.
  await expect(page).toHaveURL(listUrl);
  await expect(rowByText(page, editedTitle)).toHaveCount(0);
});

test("searches the list", async ({ page }) => {
  const title = `Searchable article ${uniqueSuffix()}`;

  await page.goto("/admin/content/demo_blog.article");
  await page.getByRole("link", { name: "Create" }).click();
  await fieldByLabel(page, "title").fill(title);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/content\/demo_blog\.article\/\d+/);

  await page.getByRole("button", { name: "Back to the list" }).click();
  await expect(rowByText(page, title)).toBeVisible();

  await page.getByPlaceholder("Search").fill(title);
  await expect(rowByText(page, title)).toBeVisible();
  await expect(rowByText(page, "Hello, Content Studio")).toHaveCount(0);
});

test("adds an inline review to the seeded article", async ({ page }) => {
  const reviewText = `Inline review ${uniqueSuffix()}`;

  await page.goto("/admin/content/demo_blog.article");
  await rowByText(page, "Hello, Content Studio").click();
  await expect(page).toHaveURL(/\/content\/demo_blog\.article\/\d+/);

  await page.getByRole("tab", { name: "reviews" }).click();
  await page.getByRole("button", { name: "Create" }).click();

  // Inline creation stays dialog-based.
  const reviewDialog = page.getByRole("dialog");
  await expect(reviewDialog).toBeVisible();
  await fieldByLabel(reviewDialog, "text").fill(reviewText);
  await reviewDialog.getByRole("button", { name: "Create" }).click();
  await expect(reviewDialog).toHaveCount(0);
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
