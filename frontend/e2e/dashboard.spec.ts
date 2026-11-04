import { expect, test } from "@playwright/test";

import { login } from "./helpers";

test("the dashboard shows the configured widgets", async ({ page }) => {
  await login(page);

  // Statistic widget
  await expect(page.getByText("Articles", { exact: true })).toBeVisible();

  // Content list widget with the seeded article. The analytics top pages
  // widget links it too, so look inside the widget.
  const latest = page.locator("section", {
    has: page.getByRole("heading", { name: "Latest articles" }),
  });
  await expect(latest).toBeVisible();
  await expect(
    latest.getByRole("link", { name: /^Hello, Content Studio/ }),
  ).toBeVisible();

  // Analytics widgets, from the demo's made-up provider
  await expect(page.getByRole("heading", { name: "Top pages" })).toBeVisible();

  // Notifications widget with the seeded notification
  const notifications = page.locator("section", {
    has: page.getByRole("heading", { name: "Notifications" }),
  });
  await expect(notifications.getByLabel("1 unread notification")).toHaveText(
    "1",
  );
  await expect(
    notifications.getByRole("button", { name: "Mark all as read" }),
  ).toBeVisible();
  await expect(notifications.getByRole("listitem")).toHaveCount(1);
});

test("the task dashboard shows the demo adapter's tasks", async ({ page }) => {
  await login(page);
  await page.goto("/admin/tasks/");

  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await expect(page.getByText("Failed (24h)", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Periodic tasks" }),
  ).toBeVisible();
  await expect(page.getByText("Send the newsletter")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent runs" }),
  ).toBeVisible();
});
