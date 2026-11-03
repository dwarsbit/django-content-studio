import { useMemo } from "react";

import { htmlToText, renderSafeHtml } from "@/lib/html";
import type { FormatDisplay } from "@/types";

/**
 * Rich text: a plain-text excerpt of two lines in a table cell, the
 * formatted text in a read-only field.
 */
export function HtmlFormat({
  value,
  emptyValue,
  display = "cell",
}: {
  value: unknown;
  emptyValue?: string | null;
  display?: FormatDisplay;
}) {
  const html = typeof value === "string" ? value : "";
  const content = useMemo(
    () => (display === "field" ? renderSafeHtml(html) : htmlToText(html)),
    [display, html],
  );

  if (!html.trim()) {
    return <span>{emptyValue ?? ""}</span>;
  }
  return display === "field" ? (
    <div
      data-slot="html-format"
      className="py-2 text-sm leading-relaxed space-y-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul,&_ol]:pl-5 [&_strong]:font-semibold [&_b]:font-semibold [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:font-mono [&_code]:text-xs [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:overflow-x-auto [&_h1,&_h2,&_h3,&_h4,&_h5,&_h6]:font-semibold [&_h1]:text-lg [&_h2]:text-base"
    >
      {content}
    </div>
  ) : (
    <span className="line-clamp-2 max-w-md">{content}</span>
  );
}
