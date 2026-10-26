import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  PiArrowDownBold,
  PiArrowUpBold,
  PiCaretDownBold,
  PiCaretRightBold,
  PiDotsThreeBold,
  PiWarningBold,
} from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { DragHandle } from "@/components/ui/drag-handle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { WidgetRenderer } from "@/components/widgets/renderer";
import { useAdminInfo } from "@/hooks/use-admin-info";
import { cn } from "@/lib/utils";
import {
  type BlockDefinition,
  type BlockValue,
  FieldType,
  FieldWidget,
  type Model,
} from "@/types";

import { BlockIcon } from "./block-icon";
import type { DragData } from "./block-tree";
import { BlockList } from "./block-widget";
import { blockSummary, type ListId, nestedListId } from "./blocks";

export function BlockCard({
  list,
  depth,
  parentId,
  path,
  relationPrefix,
  index,
  count,
  block,
  definition,
  model,
  open,
  canDuplicate,
  onToggle,
  onMove,
  onDuplicate,
  onRemove,
}: {
  // The list the block is in, and its place in the form and for the
  // related object pickers.
  list: ListId;
  depth: number;
  parentId?: string;
  path: string;
  relationPrefix: string;
  index: number;
  count: number;
  block: BlockValue;
  // Missing when the block's type no longer exists.
  definition?: BlockDefinition;
  model: Model;
  open: boolean;
  canDuplicate: boolean;
  onToggle(): void;
  onMove(to: number): void;
  onDuplicate(): void;
  onRemove(): void;
}) {
  const data: DragData = { type: "block", list, depth, parentId };
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id, data });
  const { t } = useTranslation();
  const label = definition?.verbose_name ?? block.type;
  const summary = definition ? blockSummary(definition, block) : "";
  const isOpen = open && definition !== undefined;
  return (
    <div
      ref={setNodeRef}
      // Translate, not transform: blocks differ in height and must not
      // be scaled to each other's size while sorting.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative rounded-lg border bg-card shadow-xs",
        // The overlay follows the pointer; the block stays as a placeholder.
        isDragging && "opacity-40",
      )}
      data-testid="block"
    >
      <div
        className={cn(
          "flex items-center gap-1 py-1.5 pl-1.5 pr-1.5",
          isOpen && "border-b bg-muted rounded-t-lg",
        )}
      >
        <DragHandle
          {...attributes}
          {...listeners}
          aria-label={t("widgets.block_widget.drag", { block: label })}
        />
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={!definition}
          aria-expanded={isOpen}
          aria-label={t(
            isOpen
              ? "widgets.block_widget.collapse"
              : "widgets.block_widget.expand",
            { block: label },
          )}
          onClick={onToggle}
        >
          {isOpen ? <PiCaretDownBold /> : <PiCaretRightBold />}
        </Button>
        <span className="flex items-center gap-1.5 font-semibold text-sm shrink-0 ml-1">
          <span className="size-6 flex items-center justify-center rounded-md bg-accent text-accent-foreground">
            {definition ? (
              <BlockIcon icon={definition.icon} className="text-sm size-3.5" />
            ) : (
              <PiWarningBold aria-hidden className="size-3.5" />
            )}
          </span>
          {definition
            ? label
            : t("widgets.block_widget.unknown_type", { type: block.type })}
        </span>
        <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground">
          {summary}
        </span>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={index === 0}
          aria-label={t("widgets.block_widget.move_up", { block: label })}
          onClick={() => onMove(index - 1)}
        >
          <PiArrowUpBold />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={index === count - 1}
          aria-label={t("widgets.block_widget.move_down", { block: label })}
          onClick={() => onMove(index + 1)}
        >
          <PiArrowDownBold />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={t("widgets.block_widget.more_actions", {
                block: label,
              })}
            >
              <PiDotsThreeBold />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {definition && (
              <DropdownMenuItem disabled={!canDuplicate} onSelect={onDuplicate}>
                {t("widgets.block_widget.duplicate")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive" onSelect={onRemove}>
              {t("widgets.block_widget.remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {definition && (
        // Collapsed blocks stay mounted, so their errors and unsaved
        // input survive collapsing.
        <div className="p-4 space-y-5" hidden={!isOpen}>
          {Object.keys(definition.fields).map((fieldName) => (
            <BlockFieldInput
              key={fieldName}
              path={`${path}.${index}.data.${fieldName}`}
              relationName={`${relationPrefix}.${definition.name}.${fieldName}`}
              fieldName={fieldName}
              block={block}
              definition={definition}
              model={model}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** The block under the pointer while it is dragged. */
export function BlockPreview({
  block,
  definition,
}: {
  block: BlockValue;
  definition?: BlockDefinition;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card py-2.5 px-3 shadow-lg cursor-grabbing">
      <span className="size-6 flex items-center justify-center rounded-md bg-accent text-accent-foreground">
        <BlockIcon
          icon={definition?.icon ?? null}
          className="text-sm size-3.5"
        />
      </span>
      <span className="font-semibold text-sm shrink-0">
        {definition?.verbose_name ?? block.type}
      </span>
      <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground">
        {definition ? blockSummary(definition, block) : ""}
      </span>
    </div>
  );
}

/**
 * One field of a block, rendered with the regular widgets. The widget sees
 * a model whose fields are the block's, keyed by
 * "<block field>.<block type>.<field>": the name the relations endpoint
 * resolves for related object pickers. A block field in the block is a
 * list of blocks of its own, in the same drag and drop context.
 */
function BlockFieldInput({
  path,
  relationName,
  fieldName,
  block,
  definition,
  model,
}: {
  path: string;
  relationName: string;
  fieldName: string;
  block: BlockValue;
  definition: BlockDefinition;
  model: Model;
}) {
  const form = useFormContext();
  const { data: info } = useAdminInfo();
  const modelField = definition.fields[fieldName];

  if (modelField.type === FieldType.BlockField) {
    return (
      <FormField
        control={form.control}
        name={path}
        render={() => (
          <FormItem>
            <FormLabel>{modelField.verbose_name}</FormLabel>
            <BlockList
              list={nestedListId(block.id, fieldName)}
              path={path}
              relationPrefix={relationName}
              field={modelField}
              depth={1}
              parentId={block.id}
            />
            {modelField.help_text && (
              <FormDescription>{modelField.help_text}</FormDescription>
            )}
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }

  const blockModel: Model = {
    ...model,
    fields: { [relationName]: modelField },
  };
  const widgetClass =
    modelField.widget_class ?? info?.widgets[modelField.type]?.name;
  const isCheckbox = widgetClass === FieldWidget.CheckboxWidget;

  return (
    <FormField
      control={form.control}
      name={path}
      render={({ field }) => {
        const control = (
          <FormControl>
            <WidgetRenderer
              model={blockModel}
              name={relationName}
              value={field.value}
              onChange={field.onChange}
            />
          </FormControl>
        );

        return (
          <FormItem className={isCheckbox ? "gap-1" : undefined}>
            {isCheckbox ? (
              <div className="flex items-center gap-2">
                {control}
                <FormLabel className="cursor-pointer">
                  {modelField.verbose_name}
                </FormLabel>
              </div>
            ) : (
              <>
                <FormLabel>{modelField.verbose_name}</FormLabel>
                {control}
              </>
            )}
            {modelField.help_text && (
              <FormDescription>{modelField.help_text}</FormDescription>
            )}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
