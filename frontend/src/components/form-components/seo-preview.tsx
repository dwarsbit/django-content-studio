import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PiGlobeBold } from "react-icons/pi";

import {
  cutOff,
  DESCRIPTION_LIMIT,
  displayUrl,
  joinUrl,
  snippetText,
  TITLE_LIMIT,
} from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { FormField, Model } from "@/types";

/**
 * An SEOPreview component: how the object would show in a search
 * result, from the form's title, description and path values as the
 * editor types. Titles and descriptions over what search engines show
 * are cut off, with a note.
 */
export function SEOPreview({
  formField,
}: {
  model: Model;
  formField: FormField;
}) {
  const { t } = useTranslation();
  const titleField = formField.title_field ?? "";
  const descriptionField = formField.description_field ?? "";
  const pathField = formField.path_field ?? "";
  // Unset fields watch a name no form has, which reads as undefined.
  const [titleValue, descriptionValue, pathValue] = useWatch({
    name: [
      titleField || "__seo_preview_unset__",
      descriptionField || "__seo_preview_unset__",
      pathField || "__seo_preview_unset__",
    ],
  }) as unknown[];
  const title = snippetText(titleValue);
  const description = descriptionField ? snippetText(descriptionValue) : "";
  const url = joinUrl(formField.base_url, pathField ? pathValue : "");
  const siteName = formField.site_name ?? "";
  const titleOver = title.length > TITLE_LIMIT;
  const descriptionOver = description.length > DESCRIPTION_LIMIT;

  return (
    <div data-testid="seo-preview" className="space-y-2">
      <div className="rounded-md border bg-background p-4">
        {(siteName || url) && (
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
            >
              <PiGlobeBold className="size-3.5" />
            </span>
            <div className="min-w-0 text-xs leading-tight">
              {siteName && (
                <p className="truncate text-foreground">{siteName}</p>
              )}
              {url && (
                <p className="truncate text-muted-foreground">
                  {displayUrl(url)}
                </p>
              )}
            </div>
          </div>
        )}
        <p
          className={cn(
            "mt-1.5 text-lg leading-snug text-blue-700 dark:text-blue-400",
            !title && "text-muted-foreground italic",
          )}
        >
          {title
            ? cutOff(title, TITLE_LIMIT)
            : t("form_components.seo_preview.no_title")}
        </p>
        {descriptionField && (
          <p
            className={cn(
              "mt-1 text-sm leading-normal text-muted-foreground",
              !description && "italic",
            )}
          >
            {description
              ? cutOff(description, DESCRIPTION_LIMIT)
              : t("form_components.seo_preview.no_description")}
          </p>
        )}
      </div>
      {(titleOver || descriptionOver) && (
        <ul className="space-y-0.5 text-xs text-warning">
          {titleOver && (
            <li>
              {t("form_components.seo_preview.title_over", {
                count: title.length,
                limit: TITLE_LIMIT,
              })}
            </li>
          )}
          {descriptionOver && (
            <li>
              {t("form_components.seo_preview.description_over", {
                count: description.length,
                limit: DESCRIPTION_LIMIT,
              })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
