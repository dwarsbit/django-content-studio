import { useTranslation } from "react-i18next";

import { TagInput } from "@/components/ui/tag-input";
import type { ModelField } from "@/types";

/**
 * A simple free-form tag input: tags are arbitrary strings, committed with
 * Enter, Tab or a comma. There are no options or suggestions — tags are
 * whatever the user types.
 */
export function TagWidget({
  value = [],
  onChange,
}: {
  field: ModelField;
  onChange(value: string[]): void;
  value?: string[];
}) {
  const { t } = useTranslation();

  // Values are string lists; tolerate anything else by normalizing to one.
  const tags = !value ? [] : Array.isArray(value) ? value : [value];

  return (
    <TagInput
      value={tags}
      onChange={onChange}
      placeholder={t("widgets.tag_widget.placeholder")}
    />
  );
}
