import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import * as R from "ramda";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PiPlusBold, PiXBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { DragHandle } from "@/components/ui/drag-handle";
import { Input } from "@/components/ui/input";
import { useReorderableRow } from "@/hooks/use-reorderable-row";
import { rowsToList } from "@/lib/widget-values";
import type { ModelField, WidgetProps } from "@/types";

let lastRowId = 0;

interface ListRow {
  id: string;
  value: string;
}

function row(value = ""): ListRow {
  lastRowId += 1;
  return { id: `row-${lastRowId}`, value };
}

function rowsOf(value: unknown): ListRow[] {
  return Array.isArray(value)
    ? value.map((item) => row(item == null ? "" : String(item)))
    : [];
}

function Row({
  row: r,
  index,
  onChange,
  onRemove,
  onEnter,
}: {
  row: ListRow;
  index: number;
  onChange(value: string): void;
  onRemove(): void;
  onEnter(): void;
}) {
  const { t } = useTranslation();
  const { ref, style, handleProps } = useReorderableRow(r.id);

  return (
    <div ref={ref} style={style} className="flex items-center gap-1">
      <DragHandle
        {...handleProps}
        aria-label={t("widgets.list_widget.move", { n: index + 1 })}
      />
      <Input
        value={r.value}
        data-row={r.id}
        aria-label={t("widgets.list_widget.item", { n: index + 1 })}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={t("widgets.list_widget.remove", { n: index + 1 })}
        onClick={onRemove}
      >
        <PiXBold />
      </Button>
    </div>
  );
}

/**
 * A JSONField list of strings, edited as rows that can be added,
 * removed and dragged into order. Enter adds a row below.
 */
export function ListWidget({
  field,
  value,
  onChange,
  id,
  "aria-describedby": ariaDescribedBy,
}: {
  field?: ModelField;
  id?: string;
  "aria-describedby"?: string;
} & WidgetProps<unknown>) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(() => rowsOf(value));
  const [reported, setReported] = useState<unknown>(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (value !== reported) {
    setReported(value);

    if (!R.equals(rowsToList(rows), Array.isArray(value) ? value : [])) {
      setRows(rowsOf(value));
    }
  }

  function update(next: ListRow[]) {
    const list = rowsToList(next);

    setRows(next);
    setReported(list);
    onChange(list);
  }

  function addAfter(index: number) {
    const added = row();

    setRows(R.insert(index + 1, added, rows));
    requestAnimationFrame(() =>
      containerRef.current
        ?.querySelector<HTMLInputElement>(`[data-row="${added.id}"]`)
        ?.focus(),
    );
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) {
      return;
    }

    const from = rows.findIndex((r) => r.id === active.id);
    const to = rows.findIndex((r) => r.id === over.id);

    update(arrayMove(rows, from, to));
  }

  return (
    <div
      ref={containerRef}
      id={id}
      role="group"
      aria-label={field?.verbose_name}
      aria-describedby={ariaDescribedBy}
      className="space-y-2"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={rows.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          {rows.map((r, index) => (
            <Row
              key={r.id}
              row={r}
              index={index}
              onChange={(next) =>
                update(R.update(index, { ...r, value: next }, rows))
              }
              onRemove={() => update(R.remove(index, 1, rows))}
              onEnter={() => addAfter(index)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => addAfter(rows.length - 1)}
      >
        <PiPlusBold />
        {t("widgets.list_widget.add")}
      </Button>
    </div>
  );
}
