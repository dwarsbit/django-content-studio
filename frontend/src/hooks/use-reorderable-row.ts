import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, MouseEvent } from "react";

import type { Id } from "@/types";

/**
 * A row of a Reorderable (components/reorderable): ref and style go
 * on the row element, handleProps on its DragHandle. A disabled row
 * neither drags nor moves out of the way of others.
 */
export function useReorderableRow(id: Id, disabled = false) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: "relative",
    // Above the sticky table header while dragged.
    zIndex: isDragging ? 20 : undefined,
  };

  return {
    ref: setNodeRef,
    style,
    isDragging,
    handleProps: {
      ...attributes,
      ...(disabled ? {} : listeners),
      // Never open the row (the editor) from its handle.
      onClick: (event: MouseEvent) => event.stopPropagation(),
    },
  };
}
