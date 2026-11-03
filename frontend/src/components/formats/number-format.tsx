import { useTranslation } from "react-i18next";

import {
  type FieldNumberOptions,
  formatFieldNumber,
  toNumber,
} from "@/lib/format-number";
import type { NumberFormatOptions } from "@/types";

interface Props {
  value: unknown;
  emptyValue?: string | null;
  options?: Record<string, unknown>;
}

function FieldNumber({
  value,
  emptyValue,
  options,
  style,
}: Props & { style: FieldNumberOptions["style"] }) {
  const { i18n } = useTranslation();

  if (value === null || value === undefined || value === "") {
    return <span>{emptyValue ?? ""}</span>;
  }
  const number = toNumber(value);

  if (number === null) {
    return <span>{String(value)}</span>;
  }
  const { decimals, compact, prefix, suffix, currency, fraction } = (options ??
    {}) as NumberFormatOptions;
  const shared = {
    decimals,
    style,
    currency,
    fraction,
    locale: i18n?.language,
  };
  const text = formatFieldNumber(number, { ...shared, compact: !!compact });
  // A compact number shows its exact value on hover.
  const exact = compact ? formatFieldNumber(number, shared) : undefined;

  return (
    <span className="tabular-nums whitespace-nowrap" title={exact}>
      {prefix && <span className="text-muted-foreground me-0.5">{prefix}</span>}
      {text}
      {suffix && <span className="text-muted-foreground ms-0.5">{suffix}</span>}
    </span>
  );
}

/** A number with grouped digits in the editor's language (45,940). */
export function NumberFormat(props: Props) {
  return <FieldNumber {...props} style="decimal" />;
}

/** An amount in the format's currency (€1,250.00). */
export function CurrencyFormat(props: Props) {
  return <FieldNumber {...props} style="currency" />;
}

/** A percentage: 91 (or 0.91 with fraction) is 91%. */
export function PercentFormat(props: Props) {
  return <FieldNumber {...props} style="percent" />;
}
