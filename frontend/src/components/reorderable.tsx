import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PiDotsThreeVerticalBold } from "react-icons/pi";

import { DragHandle } from "@/components/ui/drag-handle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { useReorderableRow } from "@/hooks/use-reorderable-row";
import { getMove, type Move } from "@/lib/reorder";
import { cn } from "@/lib/utils";
import type { Id } from "@/types";

// Rows only move up and down.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

/**
 * The drag and drop context of a reorderable list: the rows inside
 * use useReorderableRow, and a drop calls onMove with the move the
 * endpoint takes. Rows can be picked up with the pointer or, from
 * their handle, with space or enter and moved with the arrow keys.
 */
export function Reorderable({
  ids,
  getLabel,
  onMove,
  children,
}: {
  // The ids of the rows, in their current order.
  ids: Id[];
  // The name of a row, for screen reader announcements.
  getLabel(id: Id): string;
  onMove(id: Id, move: Move): void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so a click on
    // the handle is still a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const label = (id: UniqueIdentifier | undefined) =>
    id === undefined ? "" : getLabel(id as Id);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) {
      return;
    }

    const move = getMove(ids, active.id as Id, over.id as Id);

    if (move) {
      onMove(active.id as Id, move);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: { draggable: t("reorder.instructions") },
        announcements: {
          onDragStart: ({ active }) =>
            t("reorder.picked_up", { item: label(active.id) }),
          onDragOver: ({ active, over }) =>
            over
              ? t("reorder.over", {
                  item: label(active.id),
                  over: label(over.id),
                })
              : undefined,
          onDragEnd: ({ active }) =>
            t("reorder.dropped", { item: label(active.id) }),
          onDragCancel: ({ active }) =>
            t("reorder.cancelled", { item: label(active.id) }),
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * The handle of a reorderable row, with the reason reordering is off
 * as its title when disabled.
 */
export function RowDragHandle({
  handleProps,
  disabledReason,
}: {
  handleProps: ReturnType<typeof useReorderableRow>["handleProps"];
  disabledReason?: string | null;
}) {
  const { t } = useTranslation();

  return (
    <DragHandle
      {...handleProps}
      disabled={!!disabledReason}
      title={disabledReason ?? t("reorder.drag")}
      aria-label={disabledReason ?? t("reorder.drag")}
    />
  );
}

/**
 * The row menu of a reorderable row: moves to either end of the list,
 * also across pages.
 */
export function MoveMenu({
  onMove,
  disabledReason,
  className,
}: {
  onMove(move: Move): void;
  disabledReason?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        disabled={!!disabledReason}
        title={disabledReason ?? t("reorder.menu")}
        aria-label={t("reorder.menu")}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "inline-flex items-center justify-center size-6 rounded-md text-muted-foreground outline-none cursor-pointer",
          "hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-40",
          className,
        )}
      >
        <PiDotsThreeVerticalBold />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem onSelect={() => onMove({ position: "first" })}>
          {t("reorder.move_first")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onMove({ position: "last" })}>
          {t("reorder.move_last")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
