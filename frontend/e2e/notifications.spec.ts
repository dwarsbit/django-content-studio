import { expect, test } from "@playwright/test";

import { login, rowByText } from "./helpers";

test("the main menu opens the notifications", async ({ page }) => {
  await login(page);

  // The seeded notification: the editor updated the demo article.
  const item = page.getByRole("button", {
    name: /^Notifications, \d+ unread$/,
  });
  await expect(item).toBeVisible();
  await item.click();

  const popover = page.getByRole("dialog", { name: "Notifications" });
  await expect(
    popover.getByRole("link", {
      name: /editor updated the article Hello, Content Studio/,
    }),
  ).toBeVisible();

  await popover.getByRole("tab", { name: "All" }).click();
  await popover.getByRole("link", { name: "Notification settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Notification settings" }),
  ).toBeVisible();
});

test("following an article lists it on the settings page", async ({ page }) => {
  await login(page);
  await page.goto("/admin/content/demo_blog.article");
  await rowByText(page, "Hello, Content Studio").click();

  const follow = page.getByRole("button", { name: "Follow", exact: true });
  await follow.click();
  await expect(
    page.getByRole("button", { name: "Following", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.goto("/admin/notifications/settings");
  await expect(page.getByText("Hello, Content Studio")).toBeVisible();
  await page
    .getByRole("button", { name: "Unfollow Hello, Content Studio" })
    .click();
  await expect(
    page.getByText("You follow nothing yet.", { exact: false }),
  ).toBeVisible();
});
