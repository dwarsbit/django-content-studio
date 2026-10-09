import { expect, test } from "@playwright/test";

import { login } from "./helpers";

test("the dashboard shows the configured widgets", async ({ page }) => {
  await login(page);

  // Statistic widget
  await expect(page.getByText("Articles", { exact: true })).toBeVisible();

  // Content list widget with the seeded article
  await expect(
    page.getByRole("heading", { name: "Latest articles" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Hello, Content Studio/ }),
  ).toBeVisible();
});
