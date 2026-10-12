import type { Model, ModelField } from "@/types";

/**
 * The URL values of one filter field, keyed by lookup suffix: "" is the
 * plain field (exact match), "gte"/"lte" the range bounds.
 */
export type FilterValues = Record<string, string>;

/**
 * A change to one filter field: lookup suffix to new value. A null (or
 * empty) value removes the parameter. All changes of one interaction
 * arrive in a single call, so range filters can update both bounds
 * atomically.
 */
export type FilterChanges = Record<string, string | null>;

export interface FilterComponentProps {
  /** The field being filtered. */
  field: ModelField;
  /** The name of the field on the model. */
  name: string;
  /** The model being listed. */
  model: Model;
  /** The current URL values, keyed by lookup suffix. */
  values: FilterValues;
  /**
   * Apply changes, keyed by lookup suffix; null values remove the
   * parameter.
   */
  onChange(changes: FilterChanges): void;
}
