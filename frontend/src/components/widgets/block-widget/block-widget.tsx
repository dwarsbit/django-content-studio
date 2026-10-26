import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
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
import { useState } from "react";
import { get, useFormContext, useFormState, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PiPlusBold } from "react-icons/pi";

import { cn } from "@/lib/utils";
import type {
  BlockDefinition,
  BlockValue,
  Model,
  ModelField,
  WidgetProps,
} from "@/types";

import { BlockCard } from "./block-card";
import { BlockPicker } from "./block-picker";
import { createBlock, duplicateBlock, moveBlock } from "./blocks";

// Pages with more blocks than this start with every block collapsed.
const OPEN_ALL_MAX = 3;

export function BlockWidget({
  value,
  onChange,
  field,
  model,
  name,
}: {
  field: ModelField;
  model: Model;
  name: string;
} & WidgetProps<BlockValue[] | null>) {
  const { t } = useTranslation();
  const form = useFormContext();
  const { errors } = useFormState({ name });
  // Each block field is its own form field, so edits inside blocks update
  // the form state but not this widget's value: read the blocks from the
  // form, or a structural change would overwrite those edits.
  const watched: unknown = useWatch({ name });
  const current = watched === undefined ? value : watched;
  const blocks = Array.isArray(current) ? (current as BlockValue[]) : [];
  const definitions = field.blocks ?? [];
  const maxNum = field.max_num ?? null;
  const isFull = maxNum !== null && blocks.length >= maxNum;

  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(blocks.length <= OPEN_ALL_MAX ? blocks.map((b) => b.id) : []),
  );

  // Blocks with errors stay open, so the errors are seen.
  const blockErrors: unknown = get(errors, name);
  const hasErrors = (index: number) =>
    typeof blockErrors === "object" &&
    blockErrors !== null &&
    index in blockErrors;

  function update(next: BlockValue[]) {
    // Errors are keyed by index, which a structural change invalidates.
    form.clearErrors(name);
    onChange(next);
  }

  function open(id: string) {
    setOpenIds((ids) => new Set(ids).add(id));
  }

  function toggle(id: string) {
    setOpenIds((ids) => {
      const next = new Set(ids);

      if (!next.delete(id)) {
        next.add(id);
      }

      return next;
    });
  }

  function add(definition: BlockDefinition, index = blocks.length) {
    const block = createBlock(definition);

    open(block.id);
    update([...blocks.slice(0, index), block, ...blocks.slice(index)]);
  }

  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so clicking the
    // handle stays a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    const from = blocks.findIndex((block) => block.id === active.id);
    const to = blocks.findIndex((block) => block.id === over?.id);

    if (from !== -1 && to !== -1 && from !== to) {
      update(moveBlock(blocks, from, to));
    }
  }

  // Screen reader announcements while dragging with the keyboard.
  const labelOf = (id: UniqueIdentifier) => {
    const block = blocks.find((b) => b.id === id);
    return (
      definitions.find((d) => d.name === block?.type)?.verbose_name ??
      block?.type ??
      ""
    );
  };
  const positionOf = (id?: UniqueIdentifier) =>
    blocks.findIndex((block) => block.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t("widgets.block_widget.drag_start", { block: labelOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("widgets.block_widget.drag_over", {
            block: labelOf(active.id),
            position: positionOf(over.id),
            count: blocks.length,
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("widgets.block_widget.drag_end", {
            block: labelOf(active.id),
            position: positionOf(over.id),
            count: blocks.length,
          })
        : undefined,
    onDragCancel: ({ active }) =>
      t("widgets.block_widget.drag_cancel", { block: labelOf(active.id) }),
  };

  return (
    <div className="rounded-lg border bg-muted p-3 space-y-3">
      {maxNum !== null && (
        <div className="text-xs text-muted-foreground tabular-nums text-right">
          {t("widgets.block_widget.count", {
            count: blocks.length,
            max: maxNum,
          })}
        </div>
      )}
      {blocks.length === 0 && (
        <div className="py-4 text-center text-sm text-muted-foreground select-none">
          {t("widgets.block_widget.empty")}
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: t("widgets.block_widget.drag_instructions"),
          },
        }}
      >
        <SortableContext
          items={blocks.map((block) => block.id)}
          strategy={verticalListSortingStrategy}
        >
          <div>
            {blocks.map((block, index) => (
              <div key={block.id}>
                {index > 0 && (
                  <InsertPoint
                    blocks={definitions}
                    disabled={isFull}
                    onSelect={(definition) => add(definition, index)}
                  />
                )}
                <BlockCard
                  name={name}
                  index={index}
                  count={blocks.length}
                  block={block}
                  definition={definitions.find((d) => d.name === block.type)}
                  model={model}
                  open={openIds.has(block.id) || hasErrors(index)}
                  canDuplicate={!isFull}
                  onToggle={() => toggle(block.id)}
                  onMove={(to) => update(moveBlock(blocks, index, to))}
                  onDuplicate={() => {
                    const { blocks: next, copy } = duplicateBlock(
                      blocks,
                      index,
                    );

                    open(copy.id);
                    update(next);
                  }}
                  onRemove={() =>
                    update(blocks.filter((b) => b.id !== block.id))
                  }
                />
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <BlockPicker blocks={definitions} disabled={isFull} onSelect={add} />
      {isFull && (
        <div className="text-xs text-muted-foreground text-center">
          {t("widgets.block_widget.max_reached", { max: maxNum })}
        </div>
      )}
    </div>
  );
}

/**
 * The "+" between two blocks, which adds a block at that position. It
 * shows on hover and keyboard focus, and always on touch screens.
 */
function InsertPoint({
  blocks,
  disabled,
  onSelect,
}: {
  blocks: BlockDefinition[];
  disabled: boolean;
  onSelect(definition: BlockDefinition): void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (disabled) {
    return <div className="h-3" />;
  }

  return (
    <div className="group/insert relative h-3 flex items-center justify-center">
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-3 top-1/2 border-t border-dashed border-ring/40 opacity-0 transition-opacity group-hover/insert:opacity-100",
          open && "opacity-100",
        )}
      />
      <BlockPicker
        blocks={blocks}
        onSelect={onSelect}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            aria-label={t("widgets.block_widget.insert")}
            className={cn(
              "relative z-10 size-5 flex items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs cursor-pointer opacity-0 transition-opacity outline-none hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring group-hover/insert:opacity-100 pointer-coarse:opacity-100",
              open && "opacity-100",
            )}
          >
            <PiPlusBold aria-hidden className="size-3" />
          </button>
        }
      />
    </div>
  );
}
