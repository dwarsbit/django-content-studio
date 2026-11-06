import { keepPreviousData, useQueries } from "@tanstack/react-query";
import { useContext, useEffect, useMemo, useState } from "react";
import { useWatch } from "react-hook-form";

import { ResourcePathContext } from "@/components/content-editor/resource-path";
import { useDebounced } from "@/hooks/use-debounced";
import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import {
  conditionFields,
  evaluate,
  normalize,
  serverConditions,
} from "@/lib/conditions";
import type { ConditionTree } from "@/types";

// How long the form's values rest before server-side conditions are
// asked again, like the live duplicate check.
const SERVER_CONDITION_DEBOUNCE_MS = 400;

// Conditions on the current time are evaluated again every minute, so
// "publish date in the future" changes by itself.
const NOW_REFRESH_MS = 60_000;

// A name no form has, for useWatch without fields: it reads undefined.
const NO_FIELD = "__condition_unset__";

function readsNow(tree: ConditionTree | null | undefined): boolean {
  if (!tree || "condition" in tree) {
    return false;
  }

  if ("children" in tree) {
    return tree.children.some(readsNow);
  }

  return JSON.stringify(tree.value ?? null).includes('"$now"');
}

/**
 * Whether each condition holds for the form's current values (`when=`
 * on fields, components, form sets and tabs). No condition always
 * holds; a condition with a server-side Condition holds only once the
 * server has answered.
 */
export function useConditions(
  trees: (ConditionTree | null | undefined)[],
): boolean[] {
  const http = useHttp();
  const resourcePath = useContext(ResourcePathContext);
  const discover = useDiscover()?.data;
  const fields = useMemo(
    () => [...new Set(trees.flatMap(conditionFields))],
    [trees],
  );
  const watched = useWatch({
    name: fields.length ? fields : [NO_FIELD],
  }) as unknown[];
  const values: Record<string, unknown> = Object.fromEntries(
    fields.map((name, idx) => [name, watched?.[idx]]),
  );

  // The current time, for conditions that read it.
  const needsNow = trees.some(readsNow);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!needsNow) {
      return;
    }

    const interval = setInterval(() => setNow(new Date()), NOW_REFRESH_MS);

    return () => clearInterval(interval);
  }, [needsNow]);

  // Server-side Conditions get their own fields' values, once the form
  // rests.
  const servers = useMemo(() => {
    const byId = new Map<string, string[]>();

    for (const leaf of trees.flatMap(serverConditions)) {
      byId.set(leaf.condition, leaf.fields);
    }

    return [...byId.entries()];
  }, [trees]);
  const serverInput = JSON.stringify(
    servers.map(([, names]) =>
      Object.fromEntries(names.map((name) => [name, normalize(values[name])])),
    ),
  );
  const debouncedInput = useDebounced(
    serverInput,
    SERVER_CONDITION_DEBOUNCE_MS,
  );
  const answers = useQueries({
    queries: servers.map(([id], idx) => {
      const input = (JSON.parse(debouncedInput) as unknown[])[idx] ?? {};

      return {
        enabled: resourcePath !== null,
        retry: false,
        placeholderData: keepPreviousData,
        queryKey: ["condition", resourcePath, id, JSON.stringify(input)],
        async queryFn() {
          const { data } = await http.post<{ result: boolean }>(
            `${resourcePath}/conditions/${id}`,
            { values: input },
          );

          return data.result;
        },
      };
    }),
  });
  const results = new Map(
    servers.map(([id], idx) => [
      id,
      answers[idx]?.isError ? undefined : answers[idx]?.data,
    ]),
  );
  const context = {
    now,
    timeZone: discover?.time_zone,
    server: (id: string) => results.get(id),
  };

  return trees.map((tree) => evaluate(tree, values, context) === true);
}

/** Whether a condition holds; see useConditions. */
export function useCondition(tree: ConditionTree | null | undefined) {
  return useConditions([tree])[0];
}
