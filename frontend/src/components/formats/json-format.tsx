export function JSONFormat({ value }: { value: unknown }) {
  return (
    <code className="text-sm bg-muted font-mono text-foreground p-3 rounded-md whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </code>
  );
}
