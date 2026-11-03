import { isSavedFile } from "@/lib/file-value";
import { isSafeHref } from "@/lib/html";

// A click on the image in a table row opens the image, not the row.
function stop(event: React.MouseEvent) {
  event.stopPropagation();
}

/**
 * An ImageField as a small thumbnail (the server's, or the image itself
 * when there is none), linked to the image.
 */
export function ImageFormat({
  value,
  emptyValue,
}: {
  value: unknown;
  emptyValue?: string | null;
}) {
  if (!isSavedFile(value)) {
    return <span>{emptyValue ?? ""}</span>;
  }
  const src = [value.thumbnail, value.url].find(
    (url): url is string => typeof url === "string" && isSafeHref(url),
  );

  if (!src) {
    return <span>{value.name}</span>;
  }
  const image = (
    <img
      src={src}
      alt={value.name}
      loading="lazy"
      draggable={false}
      className="size-8 rounded object-cover bg-muted"
    />
  );

  return isSafeHref(value.url) ? (
    <a
      href={value.url}
      target="_blank"
      rel="noopener noreferrer"
      title={value.name}
      onClick={stop}
      className="inline-block"
    >
      {image}
    </a>
  ) : (
    image
  );
}
