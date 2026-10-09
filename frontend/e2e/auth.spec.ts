import { expect, test } from "@playwright/test";

import { ADMIN_USERNAME, login } from "./helpers";

test("unauthenticated visits land on the login page", async ({ page }) => {
  await page.goto("/admin/");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});

test("wrong credentials show an error", async ({ page }) => {
  await page.goto("/admin/");
  await page.getByPlaceholder("Enter your username").fill(ADMIN_USERNAME);
  await page.getByPlaceholder("Enter your password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("signs in and out through the user menu", async ({ page }) => {
  await login(page);

  // The dashboard renders the configured widgets.
  await expect(page.getByRole("button", { name: "admin" })).toBeVisible();

  await page.getByRole("button", { name: "admin" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});
