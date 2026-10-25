import { expect, type Locator, type Page, test } from "@playwright/test";

import { login } from "./helpers";

// The tests reorder shared seeded rows, so they run one after another.
test.describe.configure({ mode: "serial" });

// The body rows of a table.
const rows = (scope: Locator | Page) => scope.locator("tbody tr");

test("categories are dragged into order and keep it", async ({ page }) => {
  await login(page);
  await page.goto("/admin/content/demo_blog.category");

  await expect(rows(page).first()).toContainText("General");

  // Drag Opinion (the last seeded category) onto General with the pointer.
  const handle = rows(page)
    .filter({ hasText: "Opinion" })
    .getByRole("button", { name: "Drag to reorder" });
  const target = rows(page).filter({ hasText: "General" });
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 12 });
  await page.mouse.up();

  await expect(rows(page).first()).toContainText("Opinion");
  await page.reload();
  await expect(rows(page).first()).toContainText("Opinion");

  // The row menu moves it back to the bottom.
  await rows(page)
    .filter({ hasText: "Opinion" })
    .getByRole("button", { name: "Move" })
    .click();
  await page.getByRole("menuitem", { name: "Move to bottom" }).click();
  await expect(rows(page).last()).toContainText("Opinion");
  await expect(page).toHaveURL(/\/content\/demo_blog\.category$/);

  // Sorting by a column turns reordering off.
  await page.getByRole("button", { name: "name" }).click();
  await expect(
    page
      .getByRole("button", {
        name: "Switch to the default ordering to reorder",
      })
      .first(),
  ).toHaveAttribute("aria-disabled", "true");
  // Back to the default ordering.
  await page.getByRole("button", { name: "name" }).click();
  await page.getByRole("button", { name: "name" }).click();
});

test("inline reviews are reordered with the keyboard", async ({ page }) => {
  await login(page);
  await page.goto("/admin/content/demo_blog.article");
  await page.getByText("Reviews in order").first().click();
  await page.getByRole("tab", { name: "reviews" }).click();

  const inline = page.getByRole("table").filter({ hasText: "First review" });
  await expect(rows(inline).first()).toContainText("First review");

  // Pick the first review up, move it down one row and drop it.
  await rows(inline)
    .first()
    .getByRole("button", { name: "Drag to reorder" })
    .focus();
  // dnd-kit measures the rows after the pick-up before arrows move.
  await page.keyboard.press("Space");
  await expect(rows(inline).first()).toHaveClass(/bg-muted/);
  await page.waitForTimeout(300);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(300);
  await page.keyboard.press("Space");

  await expect(rows(inline).first()).toContainText("Second review");
  await page.reload();
  await page.getByRole("tab", { name: "reviews" }).click();
  await expect(rows(inline).nth(1)).toContainText("First review");

  // The row menu moves it one step back up; the editor does not open.
  await rows(inline).nth(1).getByRole("button", { name: "Move" }).click();
  await page.getByRole("menuitem", { name: "Move up" }).click();
  await expect(rows(inline).first()).toContainText("First review");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
