import { ChipList } from "./chip-list";

/** Tags as pills: the first three, then "+N". */
export function TagFormat({ value }: { value: unknown }) {
  const tags = Array.isArray(value)
    ? value.filter((tag) => tag !== null && tag !== "").map(String)
    : value
      ? [String(value)]
      : [];

  return <ChipList labels={tags} />;
}
