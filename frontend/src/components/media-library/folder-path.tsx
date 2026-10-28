import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import { useFolderPath } from "@/hooks/use-folder-path";
import { cn } from "@/lib/utils";

/**
 * The breadcrumb above the files: the library's root, then the path to
 * the current folder; each segment navigates.
 */
export function FolderPath({
  folder,
  onSelect,
  className,
}: {
  folder: string | null;
  onSelect(folder: string | null): void;
  className?: string;
}) {
  const { t } = useTranslation();
  const { isFetching, data } = useFolderPath(folder);
  const path = folder ? (data ?? []) : [];

  return (
    <nav
      aria-label={t("media_library.folder_path")}
      className={cn(
        "flex items-center gap-1.5 text-sm min-h-7 min-w-0",
        { "animate-pulse": isFetching },
        className,
      )}
    >
      <button
        type="button"
        className={cn(
          "truncate cursor-pointer hover:text-foreground outline-none focus-visible:underline",
          path.length ? "text-muted-foreground" : "font-medium",
        )}
        onClick={() => onSelect(null)}
      >
        {t("media_library.title")}
      </button>
      {path.map((entry, index) => (
        <Fragment key={entry.id}>
          <span className="text-muted-foreground/50 select-none">/</span>
          <button
            type="button"
            className={cn(
              "truncate cursor-pointer hover:text-foreground outline-none focus-visible:underline",
              index === path.length - 1
                ? "font-medium"
                : "text-muted-foreground",
            )}
            onClick={() => onSelect(entry.id)}
          >
            {entry.name}
          </button>
        </Fragment>
      ))}
    </nav>
  );
}
