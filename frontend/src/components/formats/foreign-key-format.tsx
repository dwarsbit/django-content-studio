import * as R from "ramda";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RelationGlyph } from "@/components/widgets/relation-glyph";
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
  const model = discover?.models.find(
    R.whereEq({ label: field?.related_model }),
  );
  const label =
    typeof value === "object" && value !== null ? relatedLabel(value) : null;
  const isUser =
    field?.related_model?.toLowerCase() === discover?.user_model.toLowerCase();
  // A customized relation display (avatar, initials or icon) takes
  // precedence over the user-model avatar heuristic.
  const hasDisplayGlyph =
    typeof value === "object" &&
    value !== null &&
    ("avatar" in value || "initials" in value || "icon" in value);

  if (isUser && !hasDisplayGlyph) {
    return (
      <div className="flex items-center gap-1.5">
        {Boolean(value) && (
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
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {hasDisplayGlyph ? (
        <RelationGlyph
          avatar={"avatar" in value ? String(value.avatar) : null}
          initials={"initials" in value ? String(value.initials) : null}
          icon={"icon" in value ? String(value.icon) : null}
          size="size-5"
          text="text-[10px]"
        />
      ) : model?.admin.icon ? (
        <span className={cn(model.admin.icon, "text-gray-500")} />
      ) : null}
      {value ? (label ?? String(value)) : "-"}
    </div>
  );
}
