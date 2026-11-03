import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { IconType } from "react-icons";
import {
  PiLinkBold,
  PiListBulletsBold,
  PiListNumbersBold,
  PiTextBBold,
  PiTextHBold,
  PiTextItalicBold,
} from "react-icons/pi";

import { MarkdownText } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { applyMarkdown, type MarkdownAction } from "@/lib/markdown-edit";
import { cn } from "@/lib/utils";
import type { ModelField, TextAreaWidgetOptions, WidgetProps } from "@/types";

import { CharacterCount } from "./character-count";

const ACTIONS: { action: MarkdownAction; icon: IconType; label: string }[][] = [
  [{ action: "heading", icon: PiTextHBold, label: "heading" }],
  [
    { action: "bold", icon: PiTextBBold, label: "bold" },
    { action: "italic", icon: PiTextItalicBold, label: "italic" },
    { action: "link", icon: PiLinkBold, label: "link" },
  ],
  [
    { action: "bullet_list", icon: PiListBulletsBold, label: "bullet_list" },
    { action: "ordered_list", icon: PiListNumbersBold, label: "ordered_list" },
  ],
];

const SHORTCUTS: Record<string, MarkdownAction> = {
  b: "bold",
  i: "italic",
  k: "link",
};

/**
 * Markdown typed as text, with a toolbar for the common formatting
 * and a Preview tab that shows it rendered (raw HTML is not).
 */
export function MarkdownWidget({
  field,
  value,
  onChange,
  options = {},
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  field?: ModelField;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
} & WidgetProps<string | null, TextAreaWidgetOptions>) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const text = value ?? "";
  const { rows = 8, placeholder } = options;

  function apply(action: MarkdownAction) {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    const edit = applyMarkdown(
      action,
      text,
      textarea.selectionStart,
      textarea.selectionEnd,
    );

    onChange(edit.text);
    // Once the new text is rendered, select what the edit points at.
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(edit.start, edit.end);
    });
  }

  return (
    <div>
      <div className="rounded-md border bg-background focus-within:border-ring">
        <div className="flex items-center gap-1 border-b p-1">
          <div role="group" className="flex items-center gap-0.5">
            {[false, true].map((isPreview) => (
              <button
                key={String(isPreview)}
                type="button"
                aria-pressed={preview === isPreview}
                onClick={() => setPreview(isPreview)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground",
                  preview === isPreview && "bg-accent text-foreground",
                )}
              >
                {t(
                  isPreview
                    ? "widgets.markdown_widget.preview"
                    : "widgets.markdown_widget.write",
                )}
              </button>
            ))}
          </div>
          {!preview && (
            <div
              role="toolbar"
              aria-label={t("widgets.markdown_widget.formatting")}
              className="ml-auto flex items-center gap-0.5 overflow-x-auto"
            >
              {ACTIONS.map((group, index) => (
                <div key={index} className="flex items-center gap-0.5">
                  {index > 0 && (
                    <Separator orientation="vertical" className="mx-1 h-4!" />
                  )}
                  {group.map(({ action, icon: Icon, label }) => (
                    <Button
                      key={action}
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={t(`widgets.markdown_widget.${label}`)}
                      title={t(`widgets.markdown_widget.${label}`)}
                      // Keep the selection in the text area.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => apply(action)}
                    >
                      <Icon />
                    </Button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        {preview ? (
          <div
            className="min-h-24 px-3 py-2"
            style={{ minHeight: `calc(${rows}lh + 1rem)` }}
          >
            {text.trim() ? (
              <MarkdownText className="text-foreground [&_h1]:text-lg [&_h2]:text-md [&_h3,&_h4,&_h5,&_h6]:text-base [&_h1,&_h2,&_h3,&_h4,&_h5,&_h6]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_a]:text-foreground">
                {text}
              </MarkdownText>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("widgets.markdown_widget.nothing_to_preview")}
              </p>
            )}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            id={id}
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            aria-label={field?.verbose_name}
            value={text}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              const action = (e.metaKey || e.ctrlKey) && SHORTCUTS[e.key];

              if (action) {
                e.preventDefault();
                apply(action);
              }
            }}
            className="scrollbar block field-sizing-content w-full resize-none bg-transparent px-3 py-2 font-mono text-xs leading-relaxed outline-none placeholder:text-muted-foreground"
            style={{ minHeight: `calc(${rows}lh + 1rem)` }}
          />
        )}
      </div>
      <CharacterCount
        value={text}
        maxLength={field?.max_length}
        options={options}
      />
    </div>
  );
}
