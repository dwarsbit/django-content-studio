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

test("opens an uploaded media item for editing", async ({ page }) => {
  // The item editor renders the retrieved item — a tags value that is
  // not a list crashes it ("e.map is not a function").
  await page.getByRole("link", { name: "Media library" }).click();

  const fileName = `e2e-open-${uniqueSuffix()}.png`;
  await page.locator("input[type=file]").setInputFiles({
    name: fileName,
    mimeType: "image/png",
    buffer: Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
        "0d0a2db40000000049454e44ae426082",
      "hex",
    ),
  });
  const card = page.getByRole("button", { name: new RegExp(fileName) });
  await expect(card).toBeVisible();

  // Opening the item renders the edit dialog: the crop preview, the
  // name field and the tags input (empty, not crashed).
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveValue(fileName);
  await expect(dialog.getByText("Tags")).toBeVisible();

  // Saving works: renaming the item and saving updates it.
  const renamed = `${fileName} (renamed)`;
  await dialog.getByLabel("Name").fill(renamed);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByRole("button", { name: renamed })).toBeVisible();
});

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
    "0d0a2db40000000049454e44ae426082",
  "hex",
);

async function upload(page: import("@playwright/test").Page, name: string) {
  await page.locator("input[type=file]").setInputFiles({
    name,
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(
    page.getByRole("button", { name: new RegExp(name) }),
  ).toBeVisible();
}

test("offers list and table views with URL-lived type filters", async ({
  page,
}) => {
  await page.getByRole("link", { name: "Media library" }).click();

  const image = `e2e-image-${uniqueSuffix()}.png`;
  const document = `e2e-doc-${uniqueSuffix()}.txt`;
  await upload(page, image);
  await page.locator("input[type=file]").setInputFiles({
    name: document,
    mimeType: "text/plain",
    buffer: Buffer.from("note"),
  });

  // The table view renders sortable headers and the type filter narrows.
  await page.getByTitle("Table view").click();
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
  await expect(page.getByRole("cell", { name: document })).toBeVisible();

  await page.getByRole("button", { name: "Type" }).first().click();
  await page.getByRole("menuitemcheckbox", { name: "File" }).click();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("cell", { name: document })).toBeVisible();
  await expect(page.getByRole("cell", { name: new RegExp(image) })).toHaveCount(
    0,
  );

  // The filter lives in the URL.
  await expect(page).toHaveURL(/type=file/);

  // The list view renders rows (scoped: the uploads panel shows the
  // name briefly as well) and carries no selection: clicking a row
  // opens the item for editing.
  await page.getByTitle("List view").click();
  const row = page.getByRole("button", { name: new RegExp(document) });
  await expect(row).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Select item" })).toHaveCount(
    0,
  );

  await row.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveValue(document);

  // A table row click opens the editor too; the checkboxes carry the
  // selection.
  await page.keyboard.press("Escape");
  await page.getByTitle("Table view").click();
  await page.getByRole("cell", { name: document }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(/selected/)).toHaveCount(0);

  // Grid cards carry no selection either: clicking a card opens the
  // editor, and only the table's checkboxes select.
  await page.keyboard.press("Escape");
  await page.getByTitle("Grid view").click();
  await expect(page.getByRole("checkbox", { name: "Select item" })).toHaveCount(
    0,
  );
});

test("bulk deletes the selected items", async ({ page }) => {
  await page.getByRole("link", { name: "Media library" }).click();

  const doomed = `e2e-doomed-${uniqueSuffix()}.png`;
  await upload(page, doomed);

  await page.getByTitle("Table view").click();
  await page
    .getByRole("row")
    .filter({ hasText: doomed })
    .getByRole("checkbox")
    .first()
    .check();

  await expect(page.getByText(/1 selected/)).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("cell", { name: doomed })).toHaveCount(0);
});

test("bulk moves the selected items to a folder", async ({ page }) => {
  await page.getByRole("link", { name: "Media library" }).click();

  // A folder to move into.
  const folderName = `Move target ${uniqueSuffix()}`;
  await page.getByRole("button", { name: "New folder" }).click();
  const folderGroup = page
    .locator("[data-slot=input-group]")
    .filter({ has: page.getByRole("button", { name: "Create" }) });
  await folderGroup.locator("input").fill(folderName);
  await folderGroup.getByRole("button", { name: "Create" }).click();

  const moved = `e2e-moved-${uniqueSuffix()}.png`;
  await upload(page, moved);
  await page.getByTitle("Table view").click();
  await page
    .getByRole("row")
    .filter({ hasText: moved })
    .getByRole("checkbox")
    .first()
    .check();

  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page.getByRole("menuitem", { name: folderName }).click();

  // The item left the current folder for the new one.
  await expect(page.getByRole("cell", { name: moved })).toHaveCount(0);
});

test("filters by tag through the searchable select", async ({ page }) => {
  await page.getByRole("link", { name: "Media library" }).click();

  const tagged = `e2e-tagged-${uniqueSuffix()}.png`;
  const untagged = `e2e-untagged-${uniqueSuffix()}.png`;
  await upload(page, tagged);
  await upload(page, untagged);

  // Tag one item through the editor.
  await page.getByRole("button", { name: tagged }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Add a tag...").fill("hero");
  await dialog.getByPlaceholder("Add a tag...").press("Enter");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);

  // The tags select offers the library's tags; picking one narrows
  // the items and lives in the URL.
  await page.getByPlaceholder("Tags").click();
  await page.getByRole("option", { name: "hero" }).click();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("button", { name: tagged })).toBeVisible();
  await expect(page.getByRole("button", { name: untagged })).toHaveCount(0);
  await expect(page).toHaveURL(/tags=hero/);
});
