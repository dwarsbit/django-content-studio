import { useEditorState, useTiptap } from "@tiptap/react";
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

import { HeadingMenu } from "./heading-menu";
import { LinkButton } from "./link-button";

export function FormattingMenu() {
  const { editor } = useTiptap();
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

      <div className="w-[140px]">
        <HeadingMenu />
      </div>

      <Toggle
        pressed={state.bold}
        onPressedChange={() => editor?.chain().focus().toggleBold().run()}
      >
        <PiTextBBold />
      </Toggle>
      <Toggle
        pressed={state.italic}
        onPressedChange={() => editor?.chain().focus().toggleItalic().run()}
      >
        <PiTextItalicBold />
      </Toggle>
      <Toggle
        pressed={state.underline}
        onPressedChange={() => editor?.chain().focus().toggleUnderline().run()}
      >
        <PiTextUnderlineBold />
      </Toggle>
      <Toggle
        pressed={state.strike}
        onPressedChange={() => editor?.chain().focus().toggleStrike().run()}
      >
        <PiTextStrikethroughBold />
      </Toggle>

      <Separator orientation="vertical" className="h-auto! self-stretch" />

      <Toggle
        pressed={state.orderedList}
        onClick={() =>
          editor?.chain().focus().unsetAllMarks().setNode("paragraph").run()
        }
      >
        <TbClearFormatting />
      </Toggle>

      <Separator orientation="vertical" className="h-auto! self-stretch" />

      <Toggle
        pressed={state.orderedList}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <PiListNumbersBold />
      </Toggle>
      <Toggle
        pressed={state.bulletList}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <PiListBulletsBold />
      </Toggle>

      <Separator orientation="vertical" className="h-auto! self-stretch" />

      <LinkButton />
    </div>
  );
}
