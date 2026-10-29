import axios from "axios";

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

// A save's field errors: only a 400 with a plain object body is a DRF
// field-error map. Anything else (a 403 detail, an HTML 500) is not.
export function getFieldErrors(
  error: unknown,
): Record<string, ServerErrors> | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 400) {
    return null;
  }
  const data: unknown = error.response.data;
  if (
    typeof data !== "object" ||
    data === null ||
    Object.getPrototypeOf(data) !== Object.prototype
  ) {
    return null;
  }
  return data as Record<string, ServerErrors>;
}

// Sets a save's field errors on the form. Returns false when the error
// is not a field-error map and should be reported as a message instead.
export function applyFieldErrors(
  error: unknown,
  setError: (name: string, error: { type: string; message: string }) => void,
): boolean {
  const errors = getFieldErrors(error);
  if (!errors) {
    return false;
  }
  for (const [key, nested] of Object.entries(errors)) {
    setServerErrors(setError, key, nested);
  }
  return true;
}
