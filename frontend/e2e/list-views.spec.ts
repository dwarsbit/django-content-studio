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
  // the meta badge from the demo's custom get_status_display.
  await expect(page).toHaveURL(/view=list/);
  const row = page.getByText("Hello, Content Studio");
  await expect(row).toBeVisible();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/view=list/);

  // A row opens the editor.
  await row.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Edit article" }),
  ).toBeVisible();

  // Close the editor before reloading: the hash persists across reloads.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Reload keeps the chosen view.
  await page.reload();
  await expect(page.getByTitle("List view")).toBeVisible();
  await expect(page.getByText("Hello, Content Studio")).toBeVisible();
});
