/** The formatting the MarkdownWidget's toolbar applies. */
export type MarkdownAction =
  "heading" | "bold" | "italic" | "link" | "bullet_list" | "ordered_list";

export interface MarkdownEdit {
  text: string;
  // The selection after the edit.
  start: number;
  end: number;
}

const WRAPS: Partial<Record<MarkdownAction, string>> = {
  bold: "**",
  italic: "_",
};

function wrap(
  text: string,
  start: number,
  end: number,
  marker: string,
): MarkdownEdit {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);

  // Already wrapped: unwrap.
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return {
      text:
        before.slice(0, -marker.length) + selected + after.slice(marker.length),
      start: start - marker.length,
      end: end - marker.length,
    };
  }

  return {
    text: before + marker + selected + marker + after,
    start: start + marker.length,
    end: end + marker.length,
  };
}

/** The lines the selection touches, as [from, to] offsets. */
function lineRange(text: string, start: number, end: number) {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const next = text.indexOf("\n", end);

  return [from, next === -1 ? text.length : next] as const;
}

function prefixLines(
  text: string,
  start: number,
  end: number,
  prefix: (index: number) => string,
  pattern: RegExp,
): MarkdownEdit {
  const [from, to] = lineRange(text, start, end);
  const lines = text.slice(from, to).split("\n");
  // Every line has the prefix: take it off; otherwise put it on.
  const remove = lines.every((line) => pattern.test(line));
  const changed = lines.map((line, index) =>
    remove
      ? line.replace(pattern, "")
      : prefix(index) + line.replace(pattern, ""),
  );
  const block = changed.join("\n");

  return {
    text: text.slice(0, from) + block + text.slice(to),
    start: from,
    end: from + block.length,
  };
}

/**
 * The text with an action applied to the selection (start to end):
 * bold and italic wrap it (or unwrap it), a link wraps it as the
 * link's text and selects the URL to type over, and headings and
 * lists prefix (or unprefix) the lines it touches.
 */
export function applyMarkdown(
  action: MarkdownAction,
  text: string,
  start: number,
  end: number,
): MarkdownEdit {
  const marker = WRAPS[action];

  if (marker) {
    return wrap(text, start, end, marker);
  }

  if (action === "link") {
    const label = text.slice(start, end);
    const url = "https://";
    const inserted = `[${label}](${url})`;
    const urlStart = start + label.length + 3;

    return {
      text: text.slice(0, start) + inserted + text.slice(end),
      start: urlStart,
      end: urlStart + url.length,
    };
  }

  if (action === "heading") {
    return prefixLines(text, start, end, () => "## ", /^#{1,6} /);
  }

  if (action === "bullet_list") {
    return prefixLines(text, start, end, () => "- ", /^[-*+] /);
  }

  return prefixLines(text, start, end, (index) => `${index + 1}. `, /^\d+\. /);
}
