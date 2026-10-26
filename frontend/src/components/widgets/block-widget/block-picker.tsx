import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { PiPlusBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BlockDefinition } from "@/types";

import { BlockIcon } from "./block-icon";

export function BlockPicker({
  blocks,
  disabled,
  trigger,
  onSelect,
  onOpenChange,
}: {
  blocks: BlockDefinition[];
  disabled?: boolean;
  // The button that opens the picker; by default a full-width
  // "Add block" button.
  trigger?: ReactNode;
  onSelect(definition: BlockDefinition): void;
  onOpenChange?(open: boolean): void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  function changeOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full border-dashed shadow-none text-accent-foreground"
          >
            <PiPlusBold />
            {t("widgets.block_widget.add_block")}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="center">
        <Command>
          <CommandInput placeholder={t("widgets.block_widget.search")} />
          <CommandList className="scrollbar">
            <CommandEmpty>{t("widgets.block_widget.no_results")}</CommandEmpty>
            <CommandGroup>
              {blocks.map((definition) => (
                <CommandItem
                  key={definition.name}
                  value={`${definition.verbose_name} ${definition.description}`}
                  onSelect={() => {
                    changeOpen(false);
                    onSelect(definition);
                  }}
                  className="gap-2.5"
                >
                  <span className="size-8 shrink-0 flex items-center justify-center rounded-md border bg-background text-accent-foreground">
                    <BlockIcon icon={definition.icon} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {definition.verbose_name}
                    </span>
                    {definition.description && (
                      <span className="block text-xs text-muted-foreground">
                        {definition.description}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
