import "./rich-text.css";

import { Image } from "@tiptap/extension-image";
import { Typography } from "@tiptap/extension-typography";
import { Tiptap, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useState } from "react";

import type {
  HeadingLevel,
  RichTextFeature,
  RichTextWidgetOptions,
} from "@/types";

import { FormattingMenu } from "./components/formatting-menu";

const ALL_FEATURES: RichTextFeature[] = [
  "heading",
  "blockquote",
  "code_block",
  "bold",
  "italic",
  "underline",
  "strike",
  "ordered_list",
  "bullet_list",
  "link",
];

const ALL_HEADING_LEVELS: HeadingLevel[] = [1, 2, 3, 4, 5, 6];

/**
 * The editor's extensions for the given features. A feature left out
 * is left out of the editor's schema too, so pasted text loses it.
 * Without a feature list, the editor has everything, including the
 * extras that have no toolbar button (inline code, rules, images).
 */
function getExtensions(
  features: RichTextFeature[] | undefined,
  headingLevels: HeadingLevel[],
) {
  const has = (feature: RichTextFeature) =>
    !features || features.includes(feature);
  const hasLists = has("ordered_list") || has("bullet_list");

  return [
    StarterKit.configure({
      heading: has("heading") ? { levels: headingLevels } : false,
      blockquote: has("blockquote") ? {} : false,
      codeBlock: has("code_block") ? {} : false,
      bold: has("bold") ? {} : false,
      italic: has("italic") ? {} : false,
      underline: has("underline") ? {} : false,
      strike: has("strike") ? {} : false,
      orderedList: has("ordered_list") ? {} : false,
      bulletList: has("bullet_list") ? {} : false,
      listItem: hasLists ? {} : false,
      listKeymap: hasLists ? {} : false,
      link: has("link")
        ? { autolink: true, linkOnPaste: true, openOnClick: false }
        : false,
      code: features ? false : {},
      horizontalRule: features ? false : {},
    }),
    Typography,
    ...(features
      ? []
      : [
          Image.configure({
            HTMLAttributes: {
              class: "rich-text-image",
            },
          }),
        ]),
  ];
}

export function RichTextWidget({
  value,
  onChange,
  disabled,
  options = {},
}: RichtTextProps) {
  const features = options.features;
  const headingLevels = options.heading_levels ?? ALL_HEADING_LEVELS;
  // The editor is created once; its extensions follow the options it
  // was created with.
  const [extensions] = useState(() => getExtensions(features, headingLevels));
  const editor = useEditor({
    extensions,
    content: value ?? "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "rich-text-field",
      },
    },
    onUpdate({ editor }) {
      onChange?.(editor.getHTML());
    },
  });
  /*
   * Update editor state if it doesn't match
   * the current value.
   */
  useEffect(() => {
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value ?? "");
    }
  }, [value, editor]);

  return (
    <Tiptap editor={editor}>
      <div className="border border-solid rounded-md bg-background focus-within:border-ring">
        <FormattingMenu
          features={features ?? ALL_FEATURES}
          headingLevels={headingLevels}
        />
        <div className="max-h-[600px] overflow-y-auto scrollbar">
          <Tiptap.Content />
        </div>
      </div>
    </Tiptap>
  );
}

interface RichtTextProps {
  value?: string | null;
  onChange?(value: string): void;
  disabled?: boolean;
  options?: RichTextWidgetOptions;
}
