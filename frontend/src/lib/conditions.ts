import type { ConditionTree } from "@/types";

/**
 * Evaluates the edit page's conditions (`when=` on fields, components,
 * form sets and tabs) against the form's values. The server evaluates
 * the same trees when an object is saved (content_studio/conditions.py),
 * with the same rules: tests/conditions_cases.json keeps both in step.
 */

export interface ConditionContext {
  // The current time.
  now: Date;
  // The server's time zone, in which an instant has its date and time
  // of day; the browser's when unset.
  timeZone?: string;
  // The answer of a server-side Condition: undefined while unknown.
  server?: (id: string) => boolean | undefined;
}

type Temporal =
  | { kind: "instant"; ms: number }
  | { kind: "date"; value: string }
  | { kind: "time"; value: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const TIME = /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const NUMBER = /^\s*-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;

/** A form value as conditions see it: related objects by id. */
export function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value && typeof value === "object" && "id" in value) {
    return (value as { id: unknown }).id;
  }

  return value;
}

/** The field names a condition reads, server-side Conditions' too. */
export function conditionFields(tree: ConditionTree | null | undefined) {
  const names = new Set<string>();

  function visit(node: ConditionTree) {
    if ("condition" in node) {
      node.fields.forEach((name) => names.add(name));
    } else if ("children" in node) {
      node.children.forEach(visit);
    } else {
      names.add(node.field);
      const value = node.value as Record<string, unknown> | null;

      if (value && typeof value === "object" && "$field" in value) {
        names.add(String(value.$field));
      }
    }
  }

  if (tree) {
    visit(tree);
  }

  return [...names];
}

/** The server-side Conditions inside a condition. */
export function serverConditions(
  tree: ConditionTree | null | undefined,
): { condition: string; fields: string[] }[] {
  if (!tree) {
    return [];
  }

  if ("condition" in tree) {
    return [tree];
  }

  if ("children" in tree) {
    return tree.children.flatMap(serverConditions);
  }

  return [];
}

/**
 * Whether values meet the condition: true, false, or undefined while a
 * server-side Condition's answer is unknown. No condition is met.
 */
export function evaluate(
  tree: ConditionTree | null | undefined,
  values: Record<string, unknown>,
  context: ConditionContext,
): boolean | undefined {
  if (!tree) {
    return true;
  }

  return evaluateNode(tree, values, context);
}

function evaluateNode(
  node: ConditionTree,
  values: Record<string, unknown>,
  context: ConditionContext,
): boolean | undefined {
  if ("condition" in node) {
    return context.server?.(node.condition);
  }

  if ("children" in node) {
    const results = node.children.map((child) =>
      evaluateNode(child, values, context),
    );
    let result: boolean | undefined;

    if (node.connector === "OR") {
      result = results.includes(true)
        ? true
        : results.includes(undefined)
          ? undefined
          : false;
    } else if (node.connector === "XOR") {
      result = results.includes(undefined)
        ? undefined
        : results.filter(Boolean).length % 2 === 1;
    } else {
      result = results.includes(false)
        ? false
        : results.includes(undefined)
          ? undefined
          : true;
    }

    if (result === undefined) {
      return undefined;
    }

    return node.negated ? !result : result;
  }

  const lhs = normalize(values[node.field]) ?? null;
  const rhs = resolve(node.value, values, context);

  if (node.lookup === "isnull") {
    const empty = lhs === null || (Array.isArray(lhs) && lhs.length === 0);
    return empty === Boolean(rhs);
  }

  // Many-to-many fields and lists: a match on any item.
  if (Array.isArray(lhs)) {
    return lhs.some((item) =>
      matchOne(node.lookup, item ?? null, rhs, context),
    );
  }

  return matchOne(node.lookup, lhs, rhs, context);
}

function resolve(
  value: unknown,
  values: Record<string, unknown>,
  context: ConditionContext,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolve(item, values, context));
  }

  if (value && typeof value === "object") {
    const tagged = value as Record<string, unknown>;

    if ("$field" in tagged) {
      return normalize(values[String(tagged.$field)]) ?? null;
    }

    if ("$now" in tagged) {
      return {
        kind: "instant",
        ms: context.now.getTime() + Number(tagged.$now) * 1000,
      } satisfies Temporal;
    }

    if ("$datetime" in tagged) {
      return instant(String(tagged.$datetime));
    }

    if ("$date" in tagged) {
      return { kind: "date", value: String(tagged.$date) } satisfies Temporal;
    }

    if ("$time" in tagged) {
      return { kind: "time", value: timeValue(String(tagged.$time)) };
    }
  }

  return value ?? null;
}

function instant(text: string): Temporal | null {
  const ms = Date.parse(text.replace(" ", "T"));

  return Number.isNaN(ms) ? null : { kind: "instant", ms };
}

// A time of day as HH:MM:SS.ffffff, so times compare as text.
function timeValue(text: string): string {
  const [clock, fraction = ""] = text.split(".");
  const [hours, minutes, seconds = "00"] = clock.split(":");

  return `${hours}:${minutes}:${seconds}.${fraction.padEnd(6, "0").slice(0, 6)}`;
}

function isTemporal(value: unknown): value is Temporal {
  return (
    !!value &&
    typeof value === "object" &&
    "kind" in value &&
    ["instant", "date", "time"].includes(String(value.kind))
  );
}

function temporal(value: unknown): Temporal | null {
  if (isTemporal(value)) {
    return value;
  }

  if (typeof value === "string") {
    if (DATE.test(value)) {
      return { kind: "date", value };
    }

    if (DATETIME.test(value)) {
      return instant(value);
    }

    if (TIME.test(value)) {
      return { kind: "time", value: timeValue(value) };
    }
  }

  return null;
}

// An instant's date (YYYY-MM-DD) and time of day in the time zone.
function localParts(ms: number, timeZone?: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  );
  const millis = String(((ms % 1000) + 1000) % 1000).padStart(3, "0");

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}.${millis}000`,
  };
}

function number(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && NUMBER.test(value)) {
    return Number(value);
  }

  return null;
}

type Comparable = [number, number] | [string, string] | [boolean, boolean];

/**
 * a and b as values of one kind that compare, or null when they are of
 * different kinds: numbers (numeric strings count), instants, dates,
 * times, text or booleans.
 */
function comparable(
  a: unknown,
  b: unknown,
  context: ConditionContext,
): Comparable | null {
  if (a === null || b === null) {
    return null;
  }

  if (typeof a === "boolean" || typeof b === "boolean") {
    return typeof a === "boolean" && typeof b === "boolean" ? [a, b] : null;
  }

  const numberA = number(a);
  const numberB = number(b);

  if (
    numberA !== null &&
    numberB !== null &&
    (typeof a !== "string" || typeof b !== "string")
  ) {
    return [numberA, numberB];
  }

  const temporalA = temporal(a);
  const temporalB = temporal(b);

  if (temporalA && temporalB) {
    return sameKind(temporalA, temporalB, context);
  }

  if (typeof a === "string" && typeof b === "string") {
    return [a, b];
  }

  return null;
}

// Two temporal values in one kind: an instant compares with a date by
// its local date, and with a time by its local time.
function sameKind(
  a: Temporal,
  b: Temporal,
  context: ConditionContext,
): Comparable | null {
  if (a.kind === "instant" && b.kind === "instant") {
    return [a.ms, b.ms];
  }

  const local = (value: Temporal, kind: "date" | "time"): string | null => {
    if (value.kind === "instant") {
      return localParts(value.ms, context.timeZone)[kind];
    }

    return value.kind === kind ? value.value : null;
  };
  const kind = a.kind === "instant" ? b.kind : a.kind;

  if (kind === "instant") {
    return null;
  }

  const localA = local(a, kind);
  const localB = local(b, kind);

  return localA !== null && localB !== null ? [localA, localB] : null;
}

function equal(a: unknown, b: unknown, context: ConditionContext) {
  // An empty text field holds "" once saved and nothing in a new form:
  // both are empty.
  if ((a === null || a === "") && (b === null || b === "")) {
    return true;
  }

  if (a === null || b === null) {
    return false;
  }

  const pair = comparable(a, b, context);

  return pair !== null && pair[0] === pair[1];
}

function order(
  a: unknown,
  b: unknown,
  context: ConditionContext,
  test: (a: number | string, b: number | string) => boolean,
) {
  const pair = comparable(a, b, context);

  if (pair === null || typeof pair[0] === "boolean") {
    return false;
  }

  return test(pair[0], pair[1] as number | string);
}

function text(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function matchOne(
  lookup: string,
  lhs: unknown,
  rhs: unknown,
  context: ConditionContext,
): boolean {
  switch (lookup) {
    case "exact":
      return equal(lhs, rhs, context);
    case "in":
      return ((rhs as unknown[]) ?? []).some((item) =>
        equal(lhs, item, context),
      );
    case "gt":
      return order(lhs, rhs, context, (a, b) => a > b);
    case "gte":
      return order(lhs, rhs, context, (a, b) => a >= b);
    case "lt":
      return order(lhs, rhs, context, (a, b) => a < b);
    case "lte":
      return order(lhs, rhs, context, (a, b) => a <= b);
    case "range": {
      const [low, high] = rhs as [unknown, unknown];
      return (
        order(lhs, low, context, (a, b) => a >= b) &&
        order(lhs, high, context, (a, b) => a <= b)
      );
    }
  }

  let textA = text(lhs);
  let textB = text(rhs);

  if (textA === null || textB === null) {
    return false;
  }

  let kind = lookup;

  if (kind.startsWith("i")) {
    textA = textA.toLowerCase();
    textB = textB.toLowerCase();
    kind = kind.slice(1);
  }

  switch (kind) {
    case "exact":
      return textA === textB;
    case "contains":
      return textA.includes(textB);
    case "startswith":
      return textA.startsWith(textB);
    case "endswith":
      return textA.endsWith(textB);
  }

  return false;
}
