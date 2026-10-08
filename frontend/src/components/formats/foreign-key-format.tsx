import * as R from "ramda";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDiscover } from "@/hooks/use-discover";
import { cn } from "@/lib/utils";
import type { ModelField } from "@/types";

function relatedLabel(value: object): string {
  if (!("__str__" in value)) {
    return String(value);
  }
  const str = value.__str__;
  return str === null || str === undefined ? String(value) : String(str);
}

export function ForeignKeyFormat({
  value,
  field,
}: {
  value: unknown;
  field?: ModelField;
}) {
  const { data: discover } = useDiscover();
  const isUser =
    field?.related_model?.toLowerCase() === discover?.user_model.toLowerCase();
  const model = discover?.models.find(
    R.whereEq({ label: field?.related_model }),
  );
  const label =
    typeof value === "object" && value !== null ? relatedLabel(value) : null;

  return (
    <div className="flex items-center gap-1.5">
      {!isUser && model?.admin.icon && (
        <span className={cn(model.admin.icon, "text-gray-500")} />
      )}
      {isUser && Boolean(value) && (
        <Tooltip>
          <TooltipContent>{label}</TooltipContent>
          <TooltipTrigger asChild>
            <Avatar className="size-6">
              <AvatarFallback className="text-xs">
                {(label ?? "").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </TooltipTrigger>
        </Tooltip>
      )}
      {!isUser && (value ? (label ?? String(value)) : "-")}
    </div>
  );
}
