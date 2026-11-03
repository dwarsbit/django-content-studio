import Markdown from "markdown-to-jsx/react";

import { cn } from "@/lib/utils";

function ExternalLink(props: React.ComponentProps<"a">) {
  return (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:text-foreground"
    />
  );
}

/**
 * Markdown written in a studio's configuration (Text and Callout
 * components): emphasis, links, lists and paragraphs. Raw HTML is not
 * rendered, and unsafe URLs (such as javascript:) are dropped.
 */
export function MarkdownText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed space-y-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul,&_ol]:pl-5 [&_strong]:font-semibold [&_code]:font-mono [&_code]:text-xs",
        className,
      )}
    >
      <Markdown
        options={{
          disableParsingRawHTML: true,
          forceBlock: true,
          overrides: { a: { component: ExternalLink } },
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
