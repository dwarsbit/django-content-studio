import type { Resource } from "@/types";

import { RelationGlyph } from "./relation-glyph";

/**
 * Renders one related-object option, shared by the relation widgets: the
 * relation display glyph (avatar, initials or icon), the title, and an
 * optional description. All come from the related model admin's
 * get_relation_display.
 */
export function RelationOption({ option }: { option: Resource }) {
  const description =
    typeof option.description === "string" ? option.description : null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <RelationGlyph
        avatar={option.avatar}
        initials={option.initials}
        icon={option.icon}
        size="size-5"
        text="text-xs"
      />
      <div className="min-w-0">
        <div className="line-clamp-1">{option.__str__}</div>
        {description ? (
          <div className="text-xs text-muted-foreground line-clamp-1">
            {description}
          </div>
        ) : null}
      </div>
    </div>
  );
}
