export function FileFormat({ value }: { value: unknown }) {
  return value ? <div className="size-5 rounded bg-muted" /> : null;
}
