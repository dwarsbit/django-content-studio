import { expect, type Locator, test } from "@playwright/test";

import { fieldByLabel, login, uniqueSuffix } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("the BlockField builds a page from blocks", async ({ page }) => {
  const title = `Block page ${uniqueSuffix()}`;
  const body = `Block text ${Date.now()}`;

  await page.goto("/admin/content/demo_blog.landingpage/new");
  await fieldByLabel(page, "title").fill(title);
  await expect(page.getByText("No blocks yet")).toBeVisible();

  await page.getByRole("button", { name: "Add block", exact: true }).click();
  await page.getByRole("option", { name: /Text/ }).click();
  await page.getByTestId("block").locator("div[contenteditable=true]").click();
  await page.keyboard.type(body);

  // An image block without an image fails validation on that block.
  await page.getByRole("button", { name: "Add block", exact: true }).click();
  await page.getByRole("option", { name: /Image/ }).click();
  await expect(page.getByText("2 of 20 blocks")).toBeVisible();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("This field cannot be blank.")).toBeVisible();

  // Removing it keeps the text block's edits, and the page saves.
  await page.getByRole("button", { name: "More actions for Image" }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/content\/demo_blog\.landingpage\/\d+$/);

  await page.reload();
  await expect(page.getByText("1 of 20 blocks")).toBeVisible();
  await expect(
    page.getByTestId("block").locator("div[contenteditable=true]"),
  ).toHaveText(body);
});

test("blocks are reordered by dragging and added in between", async ({
  page,
}) => {
  await page.goto("/admin/content/demo_blog.landingpage/new");
  await fieldByLabel(page, "title").fill(`Drag page ${uniqueSuffix()}`);

  const blocks = page.getByTestId("block");
  const captions = blocks.locator("input");
  // Collapsed blocks keep their inputs, hidden.
  const order = () =>
    captions.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );

  async function addImage(caption: string) {
    await page.getByRole("button", { name: "Add block", exact: true }).click();
    await page.getByRole("option", { name: /Image/ }).click();
    await captions.last().fill(caption);
  }

  await addImage("First");
  await addImage("Second");

  // A block between the two, from the "+" that shows on hover.
  await blocks.nth(1).hover();
  await page.getByRole("button", { name: "Add block here" }).hover();
  await page.getByRole("button", { name: "Add block here" }).click();
  await page.getByRole("option", { name: /Image/ }).click();
  await captions.nth(1).fill("Middle");
  await expect.poll(order).toEqual(["First", "Middle", "Second"]);

  // Collapse the blocks, so they are small enough to drag past each other.
  for (const label of ["Collapse Image", "Collapse Image", "Collapse Image"]) {
    await page.getByRole("button", { name: label }).first().click();
  }

  // The mouse: drag the last block onto the first.
  const handles = page.getByRole("button", { name: "Drag Image to reorder" });
  const from = (await handles.nth(2).boundingBox())!;
  const to = (await handles.nth(0).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 - 10, {
    steps: 10,
  });
  await page.mouse.up();
  await expect.poll(order).toEqual(["Second", "First", "Middle"]);

  // The keyboard: pick up the first block and move it down one place.
  // dnd-kit starts listening for arrow keys in a timeout after the pick
  // up, and Chrome may handle input before timers: let a later timeout
  // run first, which runs after dnd-kit's.
  await handles.nth(0).focus();
  await page.keyboard.press("Space");
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve)));
  await page.keyboard.press("ArrowDown");
  // Drop once the move is through, as the announcement tells.
  await expect(page.getByText("Image 1 is over Image 2.")).toBeAttached();
  await page.keyboard.press("Space");
  await expect.poll(order).toEqual(["First", "Second", "Middle"]);
});

test("blocks move between the lists of blocks inside blocks", async ({
  page,
}) => {
  await page.goto("/admin/content/demo_blog.landingpage/new");
  await fieldByLabel(page, "title").fill(`Columns page ${uniqueSuffix()}`);

  const root = page.getByTestId("block-list");
  await root
    .getByRole("button", { name: "Add block", exact: true })
    .last()
    .click();
  await page.getByRole("option", { name: /Columns/ }).click();

  const columns = page.getByTestId("nested-block-list");
  const addText = async (column: number, text: string) => {
    await columns
      .nth(column)
      .getByRole("button", { name: "Add block", exact: true })
      .click();
    await page.getByRole("option", { name: /Text/ }).click();
    await columns.nth(column).locator("[contenteditable=true]").last().click();
    await page.keyboard.type(text);
  };
  await addText(0, "Left one");
  await addText(0, "Left two");
  await addText(1, "Right one");

  // The texts of a column's blocks, from their (collapsed) summaries.
  const texts = (scope: Locator) =>
    scope
      .getByTestId("block")
      .locator("[contenteditable=true]")
      .allTextContents();

  for (const column of [0, 1]) {
    const collapse = columns
      .nth(column)
      .getByRole("button", { name: "Collapse Text" });
    while ((await collapse.count()) > 0) {
      await collapse.first().click();
    }
  }

  async function drag(handle: Locator, target: Locator, offset: number) {
    const from = (await handle.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + offset, {
      steps: 15,
    });
    await page.mouse.up();
  }

  // The second block of the left column, below the block on the right.
  const rightBlock = columns.nth(1).getByTestId("block").first();
  await drag(
    columns.nth(0).getByRole("button", { name: "Drag Text to reorder" }).nth(1),
    rightBlock,
    (await rightBlock.boundingBox())!.height - 5,
  );
  await expect.poll(() => texts(columns.nth(0))).toEqual(["Left one"]);
  await expect
    .poll(() => texts(columns.nth(1)))
    .toEqual(["Right one", "Left two"]);

  // A columns block does not go inside a column.
  await drag(
    page.getByRole("button", { name: "Drag Columns to reorder" }),
    columns.nth(0).getByTestId("block").first(),
    10,
  );
  await expect(columns).toHaveCount(2);

  // dnd-kit ignores clicks for 50ms after a drag, so the click that ends
  // a drag never counts as one; a click this fast only happens in a test.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 60)));
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/content\/demo_blog\.landingpage\/\d+$/);
  await page.reload();
  await expect
    .poll(() => texts(page.getByTestId("nested-block-list").nth(1)))
    .toEqual(["Right one", "Left two"]);
});
