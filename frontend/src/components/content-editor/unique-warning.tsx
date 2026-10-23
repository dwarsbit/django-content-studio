import { useQuery } from "@tanstack/react-query";
import { useContext, useEffect, useState } from "react";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PiWarningBold } from "react-icons/pi";

import { useHttp } from "@/hooks/use-http";
import type { Model } from "@/types";

import { ResourcePathContext } from "./resource-path";

const UNIQUE_CHECK_DEBOUNCE_MS = 400;

interface UniqueCheck {
  exists: boolean;
  __str__?: string;
  trashed?: boolean;
}

// The value to check: text and numbers as they are, relations by id.
function checkValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (value && typeof value === "object" && "id" in value) {
    return String(value.id ?? "");
  }

  return "";
}

/**
 * Warns while an editor types a value that another object already uses
 * in a unique field. Only a warning: saving is not blocked, the server's
 * uniqueness error stays the source of truth.
 */
export function UniqueWarning({ model, name }: { model: Model; name: string }) {
  const { t } = useTranslation();
  const http = useHttp();
  const resourcePath =
    useContext(ResourcePathContext) ?? `/content/${model.label}`;
  const value = checkValue(useWatch({ name }));
  const id = useWatch({ name: "id" }) as string | undefined;
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(
      () => setDebounced(value),
      UNIQUE_CHECK_DEBOUNCE_MS,
    );

    return () => clearTimeout(timeout);
  }, [value]);

  const { data } = useQuery({
    enabled: debounced !== "",
    retry: false,
    queryKey: ["unique-check", resourcePath, name, debounced, id ?? null],
    async queryFn() {
      const { data } = await http.get<UniqueCheck>(
        `${resourcePath}/unique-check`,
        { params: { field: name, value: debounced, exclude: id ?? undefined } },
      );

      return data;
    },
  });

  // A stale answer for a value that has changed since is not shown.
  if (!data?.exists || debounced === "" || debounced !== value) {
    return null;
  }

  const fieldName = model.fields[name]?.verbose_name ?? name;

  return (
    <div
      role="status"
      className="flex gap-1.5 text-sm text-warning"
      data-testid={`unique-warning-${name}`}
    >
      <PiWarningBold className="mt-0.5 shrink-0" aria-hidden />
      <div>
        <div>
          {data.__str__
            ? t(
                data.trashed
                  ? "editor.unique_warning_trashed"
                  : "editor.unique_warning",
                {
                  object: data.__str__,
                  modelName: model.verbose_name,
                  fieldName,
                },
              )
            : t("editor.unique_warning_hidden", { fieldName })}
        </div>
        <div className="text-muted-foreground">
          {t("editor.unique_warning_hint")}
        </div>
      </div>
    </div>
  );
}
