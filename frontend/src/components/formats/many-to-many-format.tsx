import { ChipList } from "./chip-list";
import { relatedLabel } from "./related-label";

/** Related objects as chips: the first three, then "+N". */
export function ManyToManyFormat({ value }: { value: unknown }) {
  const labels = Array.isArray(value) ? value.map(relatedLabel) : [];

  return <ChipList labels={labels} variant="outline" />;
}
