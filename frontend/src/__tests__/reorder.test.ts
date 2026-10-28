import { describe, expect, it } from "vitest";

import { applyMove, getEdges, getMove } from "@/lib/reorder";

const ids = ["a", "b", "c", "d"];
const rows = ids.map((id) => ({ id }));
const order = (items: { id: string }[]) => items.map((item) => item.id);

describe("getMove", () => {
  it("places a row moved down after the row it was dropped on", () => {
    expect(getMove(ids, "a", "c")).toEqual({ after: "c" });
  });

  it("places a row moved up before the row it was dropped on", () => {
    expect(getMove(ids, "d", "b")).toEqual({ before: "b" });
  });

  it("is null when the row did not move or is unknown", () => {
    expect(getMove(ids, "b", "b")).toBeNull();
    expect(getMove(ids, "x", "b")).toBeNull();
  });
});

describe("applyMove", () => {
  it("applies moves next to another row", () => {
    expect(order(applyMove(rows, "a", { after: "c" }))).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
    expect(order(applyMove(rows, "d", { before: "b" }))).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
  });

  it("applies moves to either end of the page", () => {
    expect(order(applyMove(rows, "c", { position: "first" }))).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
    expect(order(applyMove(rows, "a", { position: "last" }))).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
  });

  it("applies steps up and down within the page", () => {
    expect(order(applyMove(rows, "c", { position: "up" }))).toEqual([
      "a",
      "c",
      "b",
      "d",
    ]);
    expect(order(applyMove(rows, "a", { position: "down" }))).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });

  it("leaves the page alone for a step off the page", () => {
    expect(applyMove(rows, "a", { position: "up" })).toBe(rows);
    expect(applyMove(rows, "d", { position: "down" })).toBe(rows);
  });

  it("leaves the page alone for rows or targets it does not show", () => {
    expect(applyMove(rows, "x", { position: "first" })).toBe(rows);
    expect(applyMove(rows, "a", { after: "x" })).toBe(rows);
  });

  it("agrees with getMove", () => {
    for (const from of ids) {
      for (const to of ids) {
        const move = getMove(ids, from, to);
        if (!move) continue;

        const expected = [...ids];
        expected.splice(ids.indexOf(from), 1);
        expected.splice(ids.indexOf(to), 0, from);

        expect(order(applyMove(rows, from, move))).toEqual(expected);
      }
    }
  });
});

describe("numeric ids", () => {
  // The API sends integer primary keys as JSON numbers.
  const numeric = [1, 2, 3].map((id) => ({ id: id as unknown as string }));

  it("are matched whatever their type", () => {
    expect(getMove(["1", "2", "3"], 3 as unknown as string, "1")).toEqual({
      before: "1",
    });
    expect(
      order(applyMove(numeric, "3", { before: 1 as unknown as string })).map(
        String,
      ),
    ).toEqual(["3", "1", "2"]);
  });
});

describe("getEdges", () => {
  const pages = (isFirstPage: boolean, isLastPage: boolean) => ({
    isFirstPage,
    isLastPage,
  });

  it("marks the ends of the whole list", () => {
    expect(getEdges(0, 3, pages(true, true))).toEqual({
      atStart: true,
      atEnd: false,
    });
    expect(getEdges(2, 3, pages(true, true))).toEqual({
      atStart: false,
      atEnd: true,
    });
  });

  it("does not mark the ends of a page in the middle of the list", () => {
    expect(getEdges(0, 3, pages(false, false))).toEqual({
      atStart: false,
      atEnd: false,
    });
    expect(getEdges(2, 3, pages(false, false))).toEqual({
      atStart: false,
      atEnd: false,
    });
  });
});
