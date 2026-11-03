import { PiArrowSquareOutBold, PiEnvelopeSimpleBold } from "react-icons/pi";

import { isSafeHref } from "@/lib/html";

// A click on a link in a table row opens the link, not the row.
function stop(event: React.MouseEvent) {
  event.stopPropagation();
}

/** A URL as a link that opens in a new tab, without its scheme. */
export function LinkFormat({
  value,
  emptyValue,
}: {
  value: unknown;
  emptyValue?: string | null;
}) {
  const url = typeof value === "string" ? value.trim() : "";

  if (!url) {
    return <span>{emptyValue ?? ""}</span>;
  }
  const label = url.replace(/^https?:\/\//i, "").replace(/\/$/, "");

  if (!isSafeHref(url)) {
    return <span>{url}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stop}
      title={url}
      className="inline-flex max-w-xs items-center gap-1 underline-offset-2 hover:underline"
    >
      <span className="truncate">{label}</span>
      <PiArrowSquareOutBold className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

/** An email address as a mailto: link. */
export function EmailFormat({
  value,
  emptyValue,
}: {
  value: unknown;
  emptyValue?: string | null;
}) {
  const email = typeof value === "string" ? value.trim() : "";

  if (!email) {
    return <span>{emptyValue ?? ""}</span>;
  }
  return (
    <a
      href={`mailto:${email}`}
      onClick={stop}
      className="inline-flex max-w-xs items-center gap-1 underline-offset-2 hover:underline"
    >
      <PiEnvelopeSimpleBold className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{email}</span>
    </a>
  );
}
