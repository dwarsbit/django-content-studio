import { expect, test } from "@playwright/test";

import { login, uniqueSuffix } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("uploads media and creates a folder", async ({ page }) => {
  await page.getByRole("link", { name: "Media library" }).click();
  await expect(page).toHaveURL(/\/media-library/);

  const fileName = `e2e-upload-${uniqueSuffix()}.png`;
  await page.locator("input[type=file]").setInputFiles({
    name: fileName,
    mimeType: "image/png",
    buffer: Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
        "0d0a2db40000000049454e44ae426082",
      "hex",
    ),
  });
  await expect(page.getByText(fileName)).toBeVisible();

  // A folder can be created and shows up in the folder tree.
  // The new-folder input group is the one holding the Create button; the
  // media search box lives in an input group too.
  const folderName = `Folder ${uniqueSuffix()}`;
  await page.getByRole("button", { name: "New folder" }).click();
  const folderGroup = page
    .locator("[data-slot=input-group]")
    .filter({ has: page.getByRole("button", { name: "Create" }) });
  await folderGroup.locator("input").fill(folderName);
  await folderGroup.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(folderName)).toBeVisible();
});
