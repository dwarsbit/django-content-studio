import { useEditorState, useTiptap } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import {
  PiArrowArcLeftBold,
  PiArrowArcRightBold,
  PiListBulletsBold,
  PiListNumbersBold,
  PiTextBBold,
  PiTextItalicBold,
  PiTextStrikethroughBold,
  PiTextUnderlineBold,
} from "react-icons/pi";
import { TbClearFormatting } from "react-icons/tb";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import type { HeadingLevel, RichTextFeature } from "@/types";

import { HeadingMenu } from "./heading-menu";
import { LinkButton } from "./link-button";

export function FormattingMenu({
  features,
  headingLevels,
}: {
  // The features the editor has; the others get no button.
  features: RichTextFeature[];
  headingLevels: HeadingLevel[];
}) {
  const { t } = useTranslation();
  const { editor } = useTiptap();
  const has = (feature: RichTextFeature) => features.includes(feature);
  const hasBlockTypes =
    has("heading") || has("blockquote") || has("code_block");
  const hasMarks =
    has("bold") || has("italic") || has("underline") || has("strike");
  const hasLists = has("ordered_list") || has("bullet_list");
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      orderedList: editor.isActive("orderedList"),
      bulletList: editor.isActive("bulletList"),
    }),
  });

  return (
    <div className="border-b flex items-center gap-2 p-1 overflow-x-auto overflow-y-hidden">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => editor?.chain().focus().undo().run()}
      >
        <PiArrowArcLeftBold />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => editor?.chain().focus().redo().run()}
      >
        <PiArrowArcRightBold />
      </Button>

      {hasBlockTypes && (
        <div className="w-[140px]">
          <HeadingMenu features={features} headingLevels={headingLevels} />
        </div>
      )}

      {has("bold") && (
        <Toggle
          aria-label={t("widgets.rich_text_widget.bold")}
          pressed={state.bold}
          onPressedChange={() => editor?.chain().focus().toggleBold().run()}
        >
          <PiTextBBold />
        </Toggle>
      )}
      {has("italic") && (
        <Toggle
          aria-label={t("widgets.rich_text_widget.italic")}
          pressed={state.italic}
          onPressedChange={() => editor?.chain().focus().toggleItalic().run()}
        >
          <PiTextItalicBold />
        </Toggle>
      )}
      {has("underline") && (
        <Toggle
          aria-label={t("widgets.rich_text_widget.underline")}
          pressed={state.underline}
          onPressedChange={() =>
            editor?.chain().focus().toggleUnderline().run()
          }
        >
          <PiTextUnderlineBold />
        </Toggle>
      )}
      {has("strike") && (
        <Toggle
          aria-label={t("widgets.rich_text_widget.strike")}
          pressed={state.strike}
          onPressedChange={() => editor?.chain().focus().toggleStrike().run()}
        >
          <PiTextStrikethroughBold />
        </Toggle>
      )}

      {hasMarks && (
        <Separator orientation="vertical" className="h-auto! self-stretch" />
      )}

      <Toggle
        pressed={state.orderedList}
        onClick={() =>
          editor?.chain().focus().unsetAllMarks().setNode("paragraph").run()
        }
      >
        <TbClearFormatting />
      </Toggle>

      {hasLists && (
        <Separator orientation="vertical" className="h-auto! self-stretch" />
      )}

      {has("ordered_list") && (
        <Toggle
          aria-label={t("widgets.rich_text_widget.ordered_list")}
          pressed={state.orderedList}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <PiListNumbersBold />
        </Toggle>
      )}
      {has("bullet_list") && (
        <Toggle
          aria-label={t("widgets.rich_text_widget.bullet_list")}
          pressed={state.bulletList}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <PiListBulletsBold />
        </Toggle>
      )}

      {has("link") && (
        <>
          <Separator orientation="vertical" className="h-auto! self-stretch" />
          <LinkButton />
        </>
      )}
    </div>
  );
}
