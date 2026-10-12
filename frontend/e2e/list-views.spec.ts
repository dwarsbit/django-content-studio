import { expect, test } from "@playwright/test";

import { login } from "./helpers";

test("the article list offers both views and toggles between them", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/content/demo_blog.article");

  // The table is the default view.
  await expect(
    page.getByRole("columnheader", { name: "title", exact: true }),
  ).toBeVisible();

  // Both views are offered: the toggle appears.
  await page.getByTitle("List view").click();

  // The list view renders the resolved display: title, description and
  // the meta badge from the demo's custom get_status_display. Parallel
  // tests add more published articles, so scope to the first badge —
  // the seeded article leads the pk-ordered list.
  await expect(page).toHaveURL(/view=list/);
  const row = page.getByText("Hello, Content Studio");
  await expect(row).toBeVisible();
  await expect(
    page.getByText("Published", { exact: true }).first(),
  ).toBeVisible();
  await expect(page).toHaveURL(/view=list/);

  // A row opens the editor as its own route.
  await row.click();
  await expect(page).toHaveURL(/\/content\/demo_blog\.article\/\d+$/);
  await expect(page.getByRole("heading", { name: "articles" })).toBeVisible();

  // The back button returns to the list.
  await page.getByRole("button", { name: "Back to the list" }).click();
  await expect(page).toHaveURL(/\/content\/demo_blog\.article$/);

  // Reload keeps the chosen view; the choice lives in the URL.
  await page.getByTitle("List view").click();
  await page.reload();
  await expect(page.getByTitle("List view")).toBeVisible();
  await expect(page.getByText("Hello, Content Studio")).toBeVisible();
});
