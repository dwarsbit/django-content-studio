import { useQuery } from "@tanstack/react-query";
import {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type Control, useFormContext, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PiWarningBold } from "react-icons/pi";

import { useHttp } from "@/hooks/use-http";
import type { Model, UniqueSet } from "@/types";

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

  if (typeof value === "number" || typeof value === "boolean") {
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
  const http = useHttp();
  const resourcePath =
    useContext(ResourcePathContext) ?? `/content/${model.label}`;
  const value = checkValue(useWatch({ name }));
  const id = useWatch({ name: "id" }) as string | undefined;
  const debounced = useDebounced(value);

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

  return <Warning model={model} name={name} data={data} />;
}

function useDebounced<T>(value: T): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(
      () => setDebounced(value),
      UNIQUE_CHECK_DEBOUNCE_MS,
    );

    return () => clearTimeout(timeout);
  }, [value]);

  return debounced;
}

// The fields of each set that render a warning, per form: a set's warning
// shows under one of them only.
const hosts = new WeakMap<Control, Map<string, Set<string>>>();
const hostListeners = new Set<() => void>();
let hostsVersion = 0;

function setHosts(control: Control, setId: string) {
  let sets = hosts.get(control);
  if (!sets) {
    sets = new Map();
    hosts.set(control, sets);
  }

  let names = sets.get(setId);
  if (!names) {
    names = new Set();
    sets.set(setId, names);
  }

  return names;
}

function notifyHosts() {
  hostsVersion += 1;
  hostListeners.forEach((listener) => listener());
}

function subscribeHosts(listener: () => void) {
  hostListeners.add(listener);

  return () => {
    hostListeners.delete(listener);
  };
}

/**
 * Warns when the combination of values in the form matches another
 * object, for unique_together or a UniqueConstraint over several fields.
 * Every field of the set renders this; the warning shows under the field
 * of the set edited last (before any edit, the set's last field) and
 * names the others.
 */
export function UniqueSetWarning({
  model,
  uniqueSet,
  name,
}: {
  model: Model;
  uniqueSet: UniqueSet;
  name: string;
}) {
  const http = useHttp();
  const { control } = useFormContext();
  const resourcePath =
    useContext(ResourcePathContext) ?? `/content/${model.label}`;
  const id = useWatch({ name: "id" }) as string | undefined;

  useEffect(() => {
    setHosts(control, uniqueSet.id).add(name);
    notifyHosts();

    return () => {
      setHosts(control, uniqueSet.id).delete(name);
      notifyHosts();
    };
  }, [control, uniqueSet.id, name]);
  useSyncExternalStore(subscribeHosts, () => hostsVersion);

  // The values of the set and its condition the form holds; the server
  // takes the others from the object being edited.
  const names = [
    ...uniqueSet.fields,
    ...(uniqueSet.condition_fields ?? []).filter(
      (field) => !uniqueSet.fields.includes(field),
    ),
  ];
  const watched = useWatch({ name: names }) as unknown[];
  const values: Record<string, string> = {};
  names.forEach((field, index) => {
    if (watched[index] !== undefined) {
      values[field] = checkValue(watched[index]);
    }
  });
  const serialized = JSON.stringify(values);
  const debounced = useDebounced(serialized);

  // The field of the set edited last.
  const [lastEdited, setLastEdited] = useState<string | null>(null);
  const previous = useRef(values);
  useEffect(() => {
    const changed = uniqueSet.fields.find(
      (field) => previous.current[field] !== values[field],
    );
    previous.current = values;
    if (changed) {
      setLastEdited(changed);
    }
    // values follows serialized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  // An empty value clashes with nothing, unless nulls are equal.
  const complete = uniqueSet.fields.every(
    (field) => uniqueSet.nulls_equal || values[field] !== "",
  );

  const { data } = useQuery({
    enabled: complete && debounced === serialized,
    retry: false,
    queryKey: [
      "unique-check",
      resourcePath,
      uniqueSet.id,
      debounced,
      id ?? null,
    ],
    async queryFn() {
      const { data } = await http.get<UniqueCheck>(
        `${resourcePath}/unique-check`,
        {
          params: {
            set: uniqueSet.id,
            values: debounced,
            exclude: id ?? undefined,
          },
        },
      );

      return data;
    },
  });

  const rendered = setHosts(control, uniqueSet.id);
  const target =
    lastEdited && rendered.has(lastEdited)
      ? lastEdited
      : [...uniqueSet.fields].reverse().find((field) => rendered.has(field));

  // A stale answer for values that have changed since is not shown.
  if (
    !data?.exists ||
    !complete ||
    debounced !== serialized ||
    target !== name
  ) {
    return null;
  }

  return (
    <Warning
      model={model}
      name={name}
      data={data}
      otherFields={uniqueSet.fields.filter((field) => field !== name)}
    />
  );
}

function Warning({
  model,
  name,
  data,
  otherFields = [],
}: {
  model: Model;
  name: string;
  data: UniqueCheck;
  otherFields?: string[];
}) {
  const { t, i18n } = useTranslation();
  const verboseName = (field: string) =>
    model.fields[field]?.verbose_name ?? field;
  const fieldName = verboseName(name);
  // The set's other fields, as a list in the admin's language.
  const prefix = otherFields.length > 0 ? "editor.unique_set" : "editor.unique";
  const values = {
    object: data.__str__,
    modelName: model.verbose_name,
    fieldName,
    otherFields: new Intl.ListFormat(i18n?.language ?? "en", {
      type: "conjunction",
    }).format(otherFields.map(verboseName)),
  };

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
                  ? `${prefix}_warning_trashed`
                  : `${prefix}_warning`,
                values,
              )
            : t(`${prefix}_warning_hidden`, values)}
        </div>
        <div className="text-muted-foreground">
          {t(`${prefix}_warning_hint`)}
        </div>
      </div>
    </div>
  );
}
