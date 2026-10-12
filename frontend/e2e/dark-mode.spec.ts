import { expect, test } from "@playwright/test";

/**
 * Dark mode regression: the surfaces of the studio follow the theme
 * tokens, so the hardcoded-color classes are forbidden — this pins a
 * few computed colors in light and dark mode. When a surface stops
 * flipping, a raw palette color crept back in.
 */

function computed(page: import("@playwright/test").Page, selector: string, prop: string) {
  return page.evaluate(
    ({ selector, prop }) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el)[prop] : null;
    },
    { selector, prop },
  );
}

test("the studio surfaces follow the theme tokens in light and dark mode", async ({
  page,
}) => {
  await page.goto("/admin/");
  await page
    .getByPlaceholder("Enter your username")
    .fill("admin");
  await page.getByPlaceholder("Enter your password").fill("admin1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Dashboard" }).waitFor();

  // Light mode: the root tokens.
  expect(await computed(page, "body", "backgroundColor")).toBe("oklch(1 0 0)");
  expect(await computed(page, "body", "color")).toContain("oklch(0.145");
  expect(
    await computed(page, 'nav button[title]', "borderColor"),
  ).toContain("oklch(0.922");

  // Dark mode: switch through the theme storage the provider reads.
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await page.reload();
  await page.getByRole("link", { name: "Dashboard" }).waitFor();

  expect(
    await computed(page, "body", "backgroundColor"),
  ).toBe("oklch(0.145 0.008 326)");
  expect(await computed(page, "body", "color")).toBe("oklch(0.985 0 0)");
  // Borders flip to translucent white, not a fixed gray.
  expect(
    await computed(page, 'nav button[title]', "borderColor"),
  ).toBe("oklch(1 0 0 / 0.1)");

  // The command palette renders with the dark popover tokens.
  await page.keyboard.press("Meta+k");
  await page.getByPlaceholder("Search or jump to...").waitFor();
  expect(
    await computed(page, '[role="dialog"]', "backgroundColor"),
  ).toBe("oklch(0.212 0.019 322.12)");
  expect(
    await computed(page, '[role="dialog"]', "borderColor"),
  ).toBe("oklch(1 0 0 / 0.1)");
  await page.keyboard.press("Escape");

  // The list view: table borders and headers flip too.
  await page.goto("/admin/content/demo_blog.article");
  await page.getByRole("columnheader", { name: "title" }).waitFor();

  expect(await computed(page, "tbody tr", "borderTopColor")).toBe(
    "oklch(1 0 0 / 0.1)",
  );
  expect(await computed(page, "th", "color")).toContain("oklch(0.711");

  // The status tokens flip with the theme too: lightened variants in
  // dark mode, like destructive.
  expect(
    await page.evaluate(() => {
      const success = document.createElement("span");
      success.className = "text-success";
      const warning = document.createElement("span");
      warning.className = "text-warning";
      document.body.append(success, warning);
      const colors = {
        success: getComputedStyle(success).color,
        warning: getComputedStyle(warning).color,
      };
      success.remove();
      warning.remove();
      return colors;
    }),
  ).toEqual({
    success: "oklch(0.792 0.155 152.935)",
    warning: "oklch(0.828 0.189 84.429)",
  });
});
