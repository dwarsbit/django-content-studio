import { expect, test } from "@playwright/test";

import { fieldByLabel, login, rowByText } from "./helpers";

// The demo's site settings have a MapWidget, whose map (Leaflet) loads
// on demand as a chunk next to index.js. The tiles would come from
// OpenStreetMap; the test answers those requests itself, so it runs
// offline and asks nothing of the tile server.
test("picks a location on the map and by its coordinates", async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ status: 204 }),
  );
  await login(page);
  await page.goto("/admin/content/demo_blog.sitesettings");

  const latitude = page.getByRole("textbox", { name: "Latitude" });
  const longitude = page.getByRole("textbox", { name: "Longitude" });
  const map = page.locator(".leaflet-container");
  await expect(map).toBeVisible();

  // An earlier run may have left a location; start without one.
  const clear = page
    .locator("[data-slot=map-widget]")
    .getByRole("button", { name: "Clear" });
  if (await clear.count()) {
    await clear.click();
  }
  await expect(page.locator(".dcs-map-pin")).toHaveCount(0);

  // A click places the pin, and the boxes follow it.
  await map.click({ position: { x: 200, y: 120 } });
  await expect(page.locator(".dcs-map-pin")).toHaveCount(1);
  await expect(latitude).not.toHaveValue("");
  await expect(longitude).not.toHaveValue("");

  // Typed coordinates move the pin and are what is saved.
  await latitude.fill("52.3731");
  await longitude.fill("4.8922");

  const saved = page.waitForResponse(
    (response) =>
      ["PUT", "PATCH"].includes(response.request().method()) &&
      response.url().includes("demo_blog.sitesettings") &&
      response.ok(),
  );
  await page.getByRole("button", { name: "Save" }).click();
  const body = (await (await saved).json()) as {
    office_location: { lat: number; lng: number };
  };
  expect(body.office_location).toEqual({ lat: 52.3731, lng: 4.8922 });

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Latitude" })).toHaveValue(
    "52.3731",
  );
  await expect(page.locator(".dcs-map-pin")).toHaveCount(1);

  // The map's chunk loaded next to index.js, and index.js only once.
  const scripts = await page.evaluate(() =>
    [...document.scripts].map((script) => script.src),
  );
  expect(scripts.filter((src) => /\/index\.js/.test(src))).toHaveLength(1);
});

// The demo article has an EmbedWidget and an SEOPreview: the preview
// follows the title as it is typed, and the embed asks the server for
// its preview (which reaches YouTube, or says why it could not).
test("previews the search result and an embedded video", async ({ page }) => {
  await login(page);
  await page.goto("/admin/content/demo_blog.article");
  await rowByText(page, "Hello, Content Studio").click();

  const preview = page.getByTestId("seo-preview");
  await expect(preview).toContainText("Hello, Content Studio");
  await expect(preview).toContainText(
    "example.com › blog › hello-content-studio",
  );

  const title = fieldByLabel(page, "title");
  await title.fill(
    "A much longer new title for the search result snippet of this article",
  );
  await expect(preview).toContainText("A much longer new title");
  await expect(preview).toContainText("search engines show about 60");

  // The preview comes from the server: the video's card when the
  // server reaches YouTube, otherwise a note, and the URL either way.
  const embed = page.locator("[data-slot=embed-widget]");
  await expect(embed.getByRole("textbox")).toHaveValue(
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  await expect(
    embed.locator("[data-testid=embed-preview], [role=status]").first(),
  ).toBeVisible();
});
