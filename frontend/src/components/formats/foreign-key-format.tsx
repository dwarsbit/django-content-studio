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

export function ForeignKeyFormat({
  value,
  field,
}: {
  value: any;
  field: ModelField;
}) {
  const { data: discover } = useDiscover();
  const isUser =
    field.related_model?.toLowerCase() === discover?.user_model.toLowerCase();
  const model = discover?.models.find(
    R.whereEq({ label: field.related_model }),
  );

  return (
    <div className="flex items-center gap-1.5">
      {!isUser && model?.admin.icon && (
        <span className={cn(model.admin.icon, "text-gray-500")} />
      )}
      {isUser && value && (
        <Tooltip>
          <TooltipContent>{value.__str__}</TooltipContent>
          <TooltipTrigger asChild>
            <Avatar className="size-6">
              <AvatarFallback className="text-xs">
                {value.__str__.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </TooltipTrigger>
        </Tooltip>
      )}
      {!isUser && (value ? (value.__str__ ?? String(value)) : "-")}
    </div>
  );
}
