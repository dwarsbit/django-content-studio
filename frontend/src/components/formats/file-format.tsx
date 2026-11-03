import { PiFileBold } from "react-icons/pi";

import { isSafeHref } from "@/lib/html";

// A click on a link in a table row opens the file, not the row.
function stop(event: React.MouseEvent) {
  event.stopPropagation();
}

/** The file's name and URL; a plain path (a CharField) has no URL. */
function fileOf(value: unknown): { name: string; url: string | null } | null {
  if (typeof value === "string") {
    const name = value.split("/").pop() ?? "";
    return name ? { name, url: null } : null;
  }
  if (typeof value === "object" && value !== null && "name" in value) {
    const { name, url } = value as { name?: unknown; url?: unknown };

    return typeof name === "string" && name
      ? { name, url: typeof url === "string" ? url : null }
      : null;
  }
  return null;
}

/** A file (a FileField or ImageField): its name, linked to the file. */
export function FileFormat({
  value,
  emptyValue,
}: {
  value: unknown;
  emptyValue?: string | null;
}) {
  const file = fileOf(value);

  if (!file) {
    return <span>{emptyValue ?? ""}</span>;
  }
  const label = (
    <>
      <PiFileBold className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{file.name}</span>
    </>
  );

  if (!file.url || !isSafeHref(file.url)) {
    return (
      <span className="inline-flex max-w-xs items-center gap-1">{label}</span>
    );
  }
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stop}
      title={file.name}
      className="inline-flex max-w-xs items-center gap-1 underline-offset-2 hover:underline"
    >
      {label}
    </a>
  );
}
