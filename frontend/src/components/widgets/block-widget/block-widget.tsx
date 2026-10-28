import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  pointerWithin,
  type UniqueIdentifier,
  useDroppable,
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

import { BlockCard, BlockPreview } from "./block-card";
import { BlockPicker } from "./block-picker";
import {
  type BlockTree,
  BlockTreeContext,
  type DragData,
  useBlockTree,
} from "./block-tree";
import {
  canMoveInto,
  createBlock,
  duplicateBlock,
  findBlock,
  getList,
  type ListId,
  moveBlockTo,
  ROOT_LIST,
  setList,
} from "./blocks";

// Pages with more blocks than this start with every block collapsed.
const OPEN_ALL_MAX = 3;

// Blocks only move up and down.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

const asBlocks = (value: unknown) =>
  Array.isArray(value) ? (value as BlockValue[]) : [];

const dataOf = (data: { current?: unknown } | undefined) =>
  data?.current as DragData | undefined;

/**
 * The widget of a BlockField: its list of blocks, and the lists of the
 * block fields inside those blocks, which share one drag and drop
 * context so blocks can move between them.
 */
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

  // Each block field is its own form field, so edits inside blocks update
  // the form state but not this widget's value: read the blocks from the
  // form, or a structural change would overwrite those edits.
  const getRoot = () => {
    const current: unknown = form.getValues(name);
    return asBlocks(current === undefined ? value : current);
  };

  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const blocks = asBlocks(value);

    if (blocks.length > OPEN_ALL_MAX) {
      return new Set();
    }

    return new Set(
      blocks.flatMap((block) => [
        block.id,
        ...Object.values(block.data ?? {}).flatMap((nested) =>
          asBlocks(nested).map((inner) => inner?.id),
        ),
      ]),
    );
  });
  const [drag, setDrag] = useState<{
    activeId: string;
    overList: ListId | null;
  } | null>(null);

  function listInfo(list: ListId) {
    if (list === ROOT_LIST) {
      return { definitions: field.blocks ?? [], maxNum: field.max_num ?? null };
    }

    const at = list.lastIndexOf(":");
    const parent = getRoot().find((block) => block.id === list.slice(0, at));
    const nested = field.blocks?.find((d) => d.name === parent?.type)?.fields[
      list.slice(at + 1)
    ];

    return {
      definitions: nested?.blocks ?? [],
      maxNum: nested?.max_num ?? null,
    };
  }

  // Whether the dragged block may drop into a list other than its own.
  function accepts(activeId: string, list: ListId) {
    const root = getRoot();
    const from = findBlock(root, activeId);

    if (!from || from.list === list) {
      return false;
    }

    return canMoveInto(getList(root, from.list)[from.index], list, {
      ...listInfo(list),
      count: getList(root, list).length,
    });
  }

  const tree: BlockTree = {
    model,
    getRoot,
    update(next) {
      // Errors are keyed by index, which a structural change invalidates.
      form.clearErrors(name);
      onChange(next);
    },
    listInfo,
    isOpen: (id) => openIds.has(id),
    open: (id) => setOpenIds((ids) => new Set(ids).add(id)),
    toggle: (id) =>
      setOpenIds((ids) => {
        const next = new Set(ids);

        if (!next.delete(id)) {
          next.add(id);
        }

        return next;
      }),
    dropTarget:
      drag?.overList && accepts(drag.activeId, drag.overList)
        ? drag.overList
        : null,
  };

  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so a click on the
    // handle is still a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // The innermost target under the pointer: a block inside a block before
  // that block's list, before a block of the field's own list. A dragged
  // block never targets itself or the lists inside it.
  const collisionDetection: CollisionDetection = (args) => {
    const scoped = {
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => dataOf(container.data)?.parentId !== args.active.id,
      ),
    };
    const within = pointerWithin(scoped);

    if (within.length === 0) {
      return closestCenter(scoped);
    }

    const rank = (id: UniqueIdentifier) => {
      const data = dataOf(
        scoped.droppableContainers.find((container) => container.id === id)
          ?.data,
      );
      return (data?.depth ?? 0) * 2 + (data?.type === "block" ? 1 : 0);
    };

    return [...within].sort((a, b) => rank(b.id) - rank(a.id));
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    setDrag(null);

    const target = dataOf(over?.data);

    if (!over || !target) {
      return;
    }

    const root = getRoot();
    const activeId = String(active.id);
    const from = findBlock(root, activeId);

    if (!from) {
      return;
    }

    let index = getList(root, target.list).length;

    if (target.type === "block") {
      const overIndex = getList(root, target.list).findIndex(
        (block) => block.id === over.id,
      );

      if (target.list === from.list) {
        index = overIndex;
      } else {
        // Into another list: after the block it was dropped on when it
        // ended up below that block's middle.
        const dragged = active.rect.current.translated;
        const below =
          !!dragged &&
          dragged.top + dragged.height / 2 >
            over.rect.top + over.rect.height / 2;
        index = overIndex + (below ? 1 : 0);
      }
    } else if (target.list === from.list) {
      return;
    }

    if (target.list !== from.list && !accepts(activeId, target.list)) {
      return;
    }

    if (target.list === from.list && index === from.index) {
      return;
    }

    tree.update(moveBlockTo(root, activeId, target.list, index));
  }

  // Screen reader names: a block's type and position, as blocks of one
  // type look alike, or the name of a list.
  function labelOf(id: UniqueIdentifier) {
    const root = getRoot();
    const found = findBlock(root, String(id));

    if (!found) {
      return String(id).startsWith("list:") ? (field.verbose_name ?? "") : "";
    }

    const block = getList(root, found.list)[found.index];
    const label =
      listInfo(found.list).definitions.find((d) => d.name === block.type)
        ?.verbose_name ?? block.type;

    return `${label} ${found.index + 1}`;
  }

  return (
    <BlockTreeContext value={tree}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        modifiers={[restrictToVerticalAxis]}
        onDragStart={({ active }) =>
          setDrag({ activeId: String(active.id), overList: null })
        }
        onDragOver={({ over }) =>
          setDrag((current) =>
            current
              ? { ...current, overList: dataOf(over?.data)?.list ?? null }
              : current,
          )
        }
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrag(null)}
        accessibility={{
          screenReaderInstructions: { draggable: t("reorder.instructions") },
          announcements: {
            onDragStart: ({ active }) =>
              t("reorder.picked_up", { item: labelOf(active.id) }),
            onDragOver: ({ active, over }) =>
              over
                ? t("reorder.over", {
                    item: labelOf(active.id),
                    over: labelOf(over.id),
                  })
                : undefined,
            onDragEnd: ({ active }) =>
              t("reorder.dropped", { item: labelOf(active.id) }),
            onDragCancel: ({ active }) =>
              t("reorder.cancelled", { item: labelOf(active.id) }),
          },
        }}
      >
        <BlockList
          list={ROOT_LIST}
          path={name}
          relationPrefix={name}
          field={field}
          depth={0}
        />
        <DragOverlay>{drag && <DraggedBlock id={drag.activeId} />}</DragOverlay>
      </DndContext>
    </BlockTreeContext>
  );
}

function DraggedBlock({ id }: { id: string }) {
  const tree = useBlockTree();
  const root = tree.getRoot();
  const found = findBlock(root, id);

  if (!found) {
    return null;
  }

  const block = getList(root, found.list)[found.index];

  return (
    <BlockPreview
      block={block}
      definition={tree
        .listInfo(found.list)
        .definitions.find((d) => d.name === block.type)}
    />
  );
}

/**
 * One list of blocks: the field's own, or a block field inside a block.
 * `path` is its place in the form, `relationPrefix` its name for the
 * related object pickers of its blocks.
 */
export function BlockList({
  list,
  path,
  relationPrefix,
  field,
  depth,
  parentId,
}: {
  list: ListId;
  path: string;
  relationPrefix: string;
  field: ModelField;
  depth: number;
  parentId?: string;
}) {
  const { t } = useTranslation();
  const tree = useBlockTree();
  const { errors } = useFormState({ name: path });
  const blocks = asBlocks(useWatch({ name: path }));
  const definitions = field.blocks ?? [];
  const maxNum = field.max_num ?? null;
  const isFull = maxNum !== null && blocks.length >= maxNum;
  const data: DragData = { type: "list", list, depth, parentId };
  const { setNodeRef } = useDroppable({ id: `list:${list}`, data });

  // Blocks with errors stay open, so the errors are seen.
  const blockErrors: unknown = get(errors, path);
  const hasErrors = (index: number) =>
    typeof blockErrors === "object" &&
    blockErrors !== null &&
    index in blockErrors;

  function updateList(change: (blocks: BlockValue[]) => BlockValue[]) {
    const root = tree.getRoot();
    tree.update(setList(root, list, change(getList(root, list))));
  }

  function add(definition: BlockDefinition, index = blocks.length) {
    const block = createBlock(definition);

    tree.open(block.id);
    updateList((current) => [
      ...current.slice(0, index),
      block,
      ...current.slice(index),
    ]);
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border bg-muted p-3 space-y-3 transition-shadow",
        tree.dropTarget === list && "ring-2 ring-ring",
      )}
      data-testid={depth ? "nested-block-list" : "block-list"}
    >
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
                list={list}
                depth={depth}
                parentId={parentId}
                path={path}
                relationPrefix={relationPrefix}
                index={index}
                count={blocks.length}
                block={block}
                definition={definitions.find((d) => d.name === block.type)}
                model={tree.model}
                open={tree.isOpen(block.id) || hasErrors(index)}
                canDuplicate={!isFull}
                onToggle={() => tree.toggle(block.id)}
                onMove={(to) =>
                  tree.update(moveBlockTo(tree.getRoot(), block.id, list, to))
                }
                onDuplicate={() =>
                  updateList((current) => {
                    const { blocks: next, copy } = duplicateBlock(
                      current,
                      current.findIndex((b) => b.id === block.id),
                    );

                    tree.open(copy.id);
                    return next;
                  })
                }
                onRemove={() =>
                  updateList((current) =>
                    current.filter((b) => b.id !== block.id),
                  )
                }
              />
            </div>
          ))}
        </div>
      </SortableContext>
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
