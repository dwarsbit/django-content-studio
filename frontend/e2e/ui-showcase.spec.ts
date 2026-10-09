import { expect, type Locator, test } from "@playwright/test";

import { login } from "./helpers";

function widgetCard(page: Locator, label: RegExp): Locator {
  return page.locator("div.border.rounded-lg").filter({ hasText: label });
}

// The demo runs with DEBUG=True, so the showcase route exists there; on
// production installs the route is absent entirely.
test("the UI showcase renders all sections", async ({ page }) => {
  await login(page);
  await page.goto("/admin/ui");

  await expect(
    page.getByRole("heading", { name: "UI showcase", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Field widgets", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Format renderers", exact: true }),
  ).toBeVisible();

  // Every registered widget renders a card.
  await expect(
    page.getByRole("heading", { name: /Rich text field/ }),
  ).toBeVisible();

  // The relation display section shows the avatar, initials and icon
  // variants, with the avatar winning where several are set.
  await expect(
    page.getByRole("heading", { name: "Relation display", exact: true }),
  ).toBeVisible();
  const displayRow = page
    .locator("div.px-4")
    .filter({ hasText: "Grace Hopper" });
  await expect(displayRow.getByText("G", { exact: true })).toBeVisible();

  // The table example renders a live relation whose display comes from the
  // demo's custom get_relation_display.
  const cell = page.getByRole("cell", { name: /General/ });
  await expect(cell).toBeVisible();
  await expect(cell.locator("span.ph-tag")).toBeVisible();
});

test("the relation widgets on the showcase resolve real options", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/ui");

  // The foreign key widget is wired to the demo article's author field and
  // lists the seeded admin user.
  await widgetCard(page, /Foreign key field/)
    .getByRole("button")
    .click();
  await expect(
    page.getByRole("dialog").getByRole("option", { name: "admin" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // The many-to-many widget lists the seeded category, with the customized
  // relation display from the demo: description and icon.
  await widgetCard(page, /Many-to-many field/)
    .getByRole("combobox")
    .click();
  const category = page
    .getByRole("dialog")
    .getByRole("option", { name: /General 1 article/ });
  await expect(category).toBeVisible();
  await expect(category.locator("span.ph-tag")).toBeVisible();
});
