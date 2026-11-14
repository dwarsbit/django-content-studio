import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import * as R from "ramda";
import { useContext, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { EditorReadOnlyContext } from "@/components/content-editor/editor-read-only";
import { FormatRenderer } from "@/components/formats/renderer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useHttp } from "@/hooks/use-http";
import { htmlToText } from "@/lib/html";
import { getErrorMessage } from "@/lib/utils";
import { diffWords } from "@/lib/word-diff";
import {
  type ActivityVersion,
  FieldType,
  type Model,
  type ModelField,
} from "@/types";

dayjs.extend(localizedFormat);

// Text the dialog compares word by word; other values show before and
// after in their format.
const TEXT_TYPES = new Set<string>([
  FieldType.CharField,
  FieldType.TextField,
  FieldType.HTMLField,
  FieldType.SlugField,
  FieldType.EmailField,
  FieldType.URLField,
]);

// Files are never taken from the editor, so a version cannot bring an
// old file back.
const FILE_TYPES = new Set<string>([FieldType.FileField, FieldType.ImageField]);

/** A write-only field's value: only whether it is set. */
function isSecret(value: unknown): value is { is_set: boolean } {
  return R.is(Object, value) && "is_set" in (value as object);
}

function capfirst(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * One version of the object, opened from the Activity card: what the
 * change did, field by field, and Restore, which puts the version's
 * values in the form as unsaved changes. Saving restores them like any
 * other edit: validation, save hooks and permissions apply.
 */
export function VersionDialog({
  model,
  resourcePath,
  objectId,
  entryId,
  onClose,
}: {
  model: Model;
  resourcePath: string;
  objectId: string;
  entryId: number | null;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const http = useHttp();
  const form = useFormContext();
  const readOnly = useContext(EditorReadOnlyContext);

  const { data: version, error } = useQuery({
    enabled: entryId !== null,
    retry: false,
    queryKey: [
      "activity",
      model.label,
      objectId,
      "version",
      entryId,
      resourcePath,
    ],
    async queryFn() {
      const { data } = await http.get<ActivityVersion>(
        `${resourcePath}/${objectId}/activity/${entryId}`,
      );
      return data;
    },
  });

  // A created object changed no fields: it shows the values it was
  // created with.
  const created = version?.fields.length === 0;
  const shown = useMemo(
    () =>
      !version
        ? []
        : created
          ? Object.keys(version.data).filter(
              (name) =>
                model.fields[name] &&
                !R.isNil(version.data[name]) &&
                !R.isEmpty(version.data[name]),
            )
          : version.fields.filter((name) => model.fields[name]),
    [version, created, model.fields],
  );

  function restore() {
    if (!version) {
      return;
    }

    const readonly = new Set<string>(
      (form.getValues("__readonly_fields__") as string[] | undefined) ?? [],
    );
    let restored = 0;

    for (const [name, value] of Object.entries(version.data)) {
      const field = model.fields[name];

      if (
        !field ||
        field.readonly ||
        readonly.has(name) ||
        FILE_TYPES.has(field.type) ||
        isSecret(value) ||
        R.equals(form.getValues(name), value)
      ) {
        continue;
      }

      form.setValue(name, value, { shouldDirty: true, shouldValidate: true });
      restored++;
    }

    if (restored) {
      toast.success(t("history.restored", { count: restored }));
    } else {
      toast.info(t("history.nothing_to_restore"));
    }
    onClose();
  }

  return (
    <Dialog open={entryId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle>
            {version
              ? t("history.title", {
                  date: dayjs(version.action_time).format("LLL"),
                })
              : t("history.loading")}
          </DialogTitle>
          <DialogDescription>
            {version &&
              [
                version.user?.__str__,
                created ? t("history.created") : version.message,
              ]
                .filter(Boolean)
                .join(" · ")}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto scrollbar -mx-6 px-6">
          {error ? (
            <div className="text-sm text-destructive">
              {getErrorMessage(error)}
            </div>
          ) : !version ? (
            <div className="py-6 flex items-center justify-center">
              <Spinner />
            </div>
          ) : R.isEmpty(shown) ? (
            <div className="text-sm text-muted-foreground">
              {t("history.no_changes")}
            </div>
          ) : (
            <dl className="divide-y" data-testid="version-fields">
              {shown.map((name) => (
                <div key={name} className="py-3 first:pt-0">
                  <dt className="text-sm font-medium mb-1.5">
                    {capfirst(model.fields[name].verbose_name ?? name)}
                  </dt>
                  <dd className="min-w-0">
                    {created ? (
                      <Value
                        field={model.fields[name]}
                        value={version.data[name]}
                      />
                    ) : (
                      <Change
                        field={model.fields[name]}
                        before={version.previous[name]}
                        after={version.data[name]}
                      />
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("history.close")}
          </Button>
          {!readOnly && (
            <Button disabled={!version} onClick={restore}>
              {t("history.restore")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Value({ field, value }: { field: ModelField; value: unknown }) {
  const { t } = useTranslation();

  if (isSecret(value)) {
    return (
      <span className="text-sm">
        {t(value.is_set ? "history.secret_set" : "history.secret_not_set")}
      </span>
    );
  }

  return (
    <div className="text-sm break-words [overflow-wrap:anywhere]">
      <FormatRenderer
        value={value}
        field={field}
        display="field"
        emptyValue={t("history.empty")}
      />
    </div>
  );
}

function Change({
  field,
  before,
  after,
}: {
  field: ModelField;
  before: unknown;
  after: unknown;
}) {
  const { t } = useTranslation();
  const isText =
    TEXT_TYPES.has(field.type) &&
    !field.choices &&
    (typeof before === "string" || R.isNil(before)) &&
    (typeof after === "string" || R.isNil(after));

  if (isText) {
    const toText = (value: unknown) => {
      const text = (value as string | null | undefined) ?? "";
      return field.type === FieldType.HTMLField ? htmlToText(text) : text;
    };

    return (
      <p
        className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed"
        data-testid="word-diff"
      >
        {diffWords(toText(before), toText(after)).map((part, index) =>
          part.type === "same" ? (
            <span key={index}>{part.text}</span>
          ) : part.type === "removed" ? (
            <del
              key={index}
              className="bg-red-500/15 text-red-700 dark:text-red-300 rounded-sm px-0.5"
            >
              {part.text}
            </del>
          ) : (
            <ins
              key={index}
              className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 no-underline rounded-sm px-0.5"
            >
              {part.text}
            </ins>
          ),
        )}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 items-baseline">
      <span className="text-xs text-muted-foreground">
        {t("history.before")}
      </span>
      <div className="text-muted-foreground line-through decoration-red-500/60">
        <Value field={field} value={before} />
      </div>
      <span className="text-xs text-muted-foreground">
        {t("history.after")}
      </span>
      <Value field={field} value={after} />
    </div>
  );
}
