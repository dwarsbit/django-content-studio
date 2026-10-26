// A field's errors: a list of messages, or errors keyed like the value
// (a BlockField's are body.<index>.data.<field>).
export type ServerErrors = string[] | { [key: string]: ServerErrors };

export function setServerErrors(
  setError: (name: string, error: { type: string; message: string }) => void,
  path: string,
  errors: ServerErrors,
) {
  if (Array.isArray(errors)) {
    setError(path, { type: "custom", message: String(errors[0] ?? "") });
    return;
  }

  for (const [key, nested] of Object.entries(errors ?? {})) {
    setServerErrors(setError, `${path}.${key}`, nested);
  }
}
