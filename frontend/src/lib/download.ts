/**
 * The file name a download's Content-Disposition header gives, or the
 * fallback when it gives none (or is not exposed to the admin).
 */
export function getDownloadFilename(
  disposition: string | null | undefined,
  fallback: string,
): string {
  if (!disposition) {
    return fallback;
  }

  const encoded = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disposition);

  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // A malformed encoding: fall through to the plain name.
    }
  }

  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/.exec(
    disposition,
  );
  const name = plain?.[1] ?? plain?.[2]?.trim();

  return name || fallback;
}

/** Save a blob as a file through a temporary link. */
export function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoked on the next tick: some browsers start the download after
  // the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The message of a failed download. Its error body arrives as a blob
 * holding the usual JSON error ({"detail": ...} or a list of messages).
 */
export async function getDownloadErrorMessage(error: unknown): Promise<string> {
  const data = (error as { response?: { data?: unknown } })?.response?.data;

  try {
    const body: unknown =
      data instanceof Blob ? JSON.parse(await data.text()) : data;

    if (Array.isArray(body) && typeof body[0] === "string") {
      return body[0];
    }

    const detail = (body as { detail?: unknown } | null)?.detail;

    if (typeof detail === "string") {
      return detail;
    }
  } catch {
    // Not JSON: the generic message below.
  }

  return "Error";
}
