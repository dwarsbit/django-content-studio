import { useState } from "react";
import { get, useFormContext, useFormState, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";

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

  function add(definition: BlockDefinition) {
    const block = createBlock(definition);

    open(block.id);
    update([...blocks, block]);
  }

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
      {blocks.map((block, index) => (
        <BlockCard
          key={block.id}
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
            const { blocks: next, copy } = duplicateBlock(blocks, index);

            open(copy.id);
            update(next);
          }}
          onRemove={() => update(blocks.filter((b) => b.id !== block.id))}
        />
      ))}
      <BlockPicker blocks={definitions} disabled={isFull} onSelect={add} />
      {isFull && (
        <div className="text-xs text-muted-foreground text-center">
          {t("widgets.block_widget.max_reached", { max: maxNum })}
        </div>
      )}
    </div>
  );
}
