import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  PiArrowDownBold,
  PiArrowUpBold,
  PiCaretDownBold,
  PiCaretRightBold,
  PiDotsSixVerticalBold,
  PiDotsThreeBold,
  PiWarningBold,
} from "react-icons/pi";

import { Button } from "@/components/ui/button";
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
  FieldWidget,
  type Model,
} from "@/types";

import { BlockIcon } from "./block-icon";
import { blockSummary } from "./blocks";

export function BlockCard({
  name,
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
  // The BlockField's name in the form.
  name: string;
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
  const { t } = useTranslation();
  const label = definition?.verbose_name ?? block.type;
  const summary = definition ? blockSummary(definition, block) : "";
  const isOpen = open && definition !== undefined;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  return (
    <div
      ref={setNodeRef}
      // Translate, not transform: blocks differ in height and must not
      // be scaled to each other's size while sorting.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "rounded-lg border bg-card shadow-xs",
        isDragging && "relative z-10 shadow-lg",
      )}
      data-testid="block"
    >
      <div
        className={cn(
          "flex items-center gap-1 py-1.5 pl-1 pr-1.5",
          isOpen && "border-b bg-muted rounded-t-lg",
        )}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("widgets.block_widget.drag", { block: label })}
          className="size-7 shrink-0 flex items-center justify-center rounded-md text-muted-foreground cursor-grab touch-none hover:bg-accent outline-none focus-visible:ring-3 focus-visible:ring-ring active:cursor-grabbing"
        >
          <PiDotsSixVerticalBold aria-hidden className="size-4" />
        </button>
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
              path={`${name}.${index}.data.${fieldName}`}
              relationName={`${name}.${definition.name}.${fieldName}`}
              fieldName={fieldName}
              definition={definition}
              model={model}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One field of a block, rendered with the regular widgets. The widget sees
 * a model whose fields are the block's, keyed by
 * "<block field>.<block type>.<field>": the name the relations endpoint
 * resolves for related object pickers.
 */
function BlockFieldInput({
  path,
  relationName,
  fieldName,
  definition,
  model,
}: {
  path: string;
  relationName: string;
  fieldName: string;
  definition: BlockDefinition;
  model: Model;
}) {
  const form = useFormContext();
  const { data: info } = useAdminInfo();
  const modelField = definition.fields[fieldName];
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
