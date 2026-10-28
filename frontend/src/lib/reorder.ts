import type { Id } from "@/types";

// Ids arrive as JSON numbers or strings, and drag and drop reports
// them as given: compare them as strings.
const same = (a: Id, b: Id) => String(a) === String(b);
const indexOf = (ids: Id[], id: Id) =>
  ids.findIndex((other) => same(other, id));

// A move as the move endpoint takes it: next to another object of the
// list, to either end of it, or one step up or down.
export type Move =
  | { after: Id }
  | { before: Id }
  | { position: "first" | "last" | "up" | "down" };

/**
 * The move that takes the dragged row from its index to the index of
 * the row it was dropped on: after it when moving down, before it when
 * moving up. Null when the row did not move.
 */
export function getMove(ids: Id[], activeId: Id, overId: Id): Move | null {
  const from = indexOf(ids, activeId);
  const to = indexOf(ids, overId);

  if (from === -1 || to === -1 || from === to) {
    return null;
  }

  return from < to ? { after: ids[to] } : { before: ids[to] };
}

/**
 * The rows of a page with the move applied, for the optimistic update.
 * A move to either end puts the row at that end of the page, a step
 * up or down swaps it with its neighbor on the page (a step off the
 * page leaves the page alone); the refetch afterwards shows where it
 * really landed.
 */
export function applyMove<T extends { id: Id }>(
  items: T[],
  id: Id,
  move: Move,
): T[] {
  const item = items.find((item) => same(item.id, id));

  if (!item) {
    return items;
  }

  const rest = items.filter((item) => !same(item.id, id));

  if ("position" in move) {
    if (move.position === "first") {
      return [item, ...rest];
    }

    if (move.position === "last") {
      return [...rest, item];
    }

    const from = items.indexOf(item);
    const to = from + (move.position === "down" ? 1 : -1);

    if (to < 0 || to >= items.length) {
      return items;
    }

    return [...rest.slice(0, to), item, ...rest.slice(to)];
  }

  const targetId = "after" in move ? move.after : move.before;
  const index = indexOf(
    rest.map((item) => item.id),
    targetId,
  );

  if (index === -1) {
    return items;
  }

  const at = "after" in move ? index + 1 : index;

  return [...rest.slice(0, at), item, ...rest.slice(at)];
}

/**
 * Whether the row at index on a page of count rows is the first or the
 * last of the whole list, which it is only on the list's first or last
 * page.
 */
export function getEdges(
  index: number,
  count: number,
  { isFirstPage, isLastPage }: { isFirstPage: boolean; isLastPage: boolean },
) {
  return {
    atStart: isFirstPage && index === 0,
    atEnd: isLastPage && index === count - 1,
  };
}
