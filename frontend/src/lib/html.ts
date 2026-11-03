import { createElement, Fragment, type ReactNode } from "react";

// The markup HtmlFormat renders in a read-only field: the rich text
// editor's formatting. Anything else is dropped, keeping its text.
const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "strike",
  "strong",
  "sub",
  "sup",
  "u",
  "ul",
]);

// Elements whose content is not text to show.
const DROPPED_TAGS = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
]);

const VOID_TAGS = new Set(["br", "hr"]);

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** Whether an href is safe to link to: http(s), mailto or relative. */
export function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);

  return scheme
    ? ["http", "https", "mailto"].includes(scheme[1].toLowerCase())
    : !trimmed.startsWith("//");
}

/** The text of an HTML string, whitespace collapsed, for an excerpt. */
export function htmlToText(html: string): string {
  const doc = parse(html);
  doc.body
    .querySelectorAll([...DROPPED_TAGS].join(","))
    .forEach((node) => node.remove());
  // Blocks end with a space, so "<p>One</p><p>Two</p>" reads "One Two".
  doc.body
    .querySelectorAll("p, li, br, h1, h2, h3, h4, h5, h6, blockquote, pre")
    .forEach((node) => node.after(" "));

  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

function toReact(node: Node, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const element = node as Element;
  const tag = element.tagName.toLowerCase();

  if (DROPPED_TAGS.has(tag)) {
    return null;
  }
  const children = Array.from(element.childNodes).map(toReact);

  if (!ALLOWED_TAGS.has(tag)) {
    return createElement(Fragment, { key }, ...children);
  }
  if (VOID_TAGS.has(tag)) {
    return createElement(tag, { key });
  }
  if (tag === "a") {
    const href = element.getAttribute("href");

    return href && isSafeHref(href)
      ? createElement(
          "a",
          { key, href, target: "_blank", rel: "noopener noreferrer" },
          ...children,
        )
      : createElement(Fragment, { key }, ...children);
  }
  return createElement(tag, { key }, ...children);
}

/**
 * HTML as React elements, keeping only the rich text editor's
 * formatting: no attributes but a safe link's href, no scripts, styles
 * or embeds. The HTML is never set as markup.
 */
export function renderSafeHtml(html: string): ReactNode {
  return Array.from(parse(html).body.childNodes).map(toReact);
}
