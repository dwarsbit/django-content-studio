import { expect, test } from "@playwright/test";

import { login } from "./helpers";

// The demo's site settings have a CodeWidget, whose editor loads on
// demand (a chunk next to index.js), and a KeyValueWidget, which keeps
// a duplicate key from being saved.
test("edits code and key-value fields, refusing invalid input", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/content/demo_blog.sitesettings");

  const code = page.getByRole("textbox", { name: "head code" });
  await expect(code).toBeVisible();
  await code.click();
  await page.keyboard.type('<meta name="verify" content="e2e">');

  const saves: string[] = [];
  page.on("request", (request) => {
    if (["PUT", "POST"].includes(request.method())) saves.push(request.url());
  });

  const add = page.getByRole("button", { name: "Add row" });
  await add.click();
  await page
    .getByRole("textbox", { name: "Key", exact: true })
    .last()
    .fill("Mastodon");
  await page
    .getByRole("textbox", { name: "Value", exact: true })
    .last()
    .fill("https://example.social/@demo");
  await add.click();
  await page
    .getByRole("textbox", { name: "Key", exact: true })
    .last()
    .fill("Mastodon");
  await page
    .getByRole("textbox", { name: "Value", exact: true })
    .last()
    .fill("again");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/is used more than once/)).toBeVisible();
  expect(saves).toHaveLength(0);

  await page.getByRole("button", { name: "Remove Mastodon" }).last().click();
  await expect(page.getByText(/is used more than once/)).toHaveCount(0);

  const saved = page.waitForResponse(
    (response) =>
      ["PUT", "POST"].includes(response.request().method()) && response.ok(),
  );
  await page.getByRole("button", { name: "Save" }).click();
  await saved;

  await page.reload();
  await expect(page.getByRole("textbox", { name: "head code" })).toContainText(
    '<meta name="verify" content="e2e">',
  );
  await expect(
    page.getByRole("textbox", { name: "Value", exact: true }),
  ).toHaveValue("https://example.social/@demo");
});
