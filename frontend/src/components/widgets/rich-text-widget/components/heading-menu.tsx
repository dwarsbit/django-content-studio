import { useEditorState, useTiptap } from "@tiptap/react";
import { useTranslation } from "react-i18next";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

import { getNodeType } from "../utils";

const NODE_TYPES = [
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
  "paragraph",
  "blockquote",
  "codeBlock",
];

export function HeadingMenu() {
  const { t } = useTranslation();
  const { editor } = useTiptap();
  const value = useEditorState({
    editor,
    selector: ({ editor }) => getNodeType(editor),
  });

  return (
    <Select
      value={value}
      onValueChange={(nodeType) => {
        const baseCommands = editor!.chain().focus().clearNodes();

        if (nodeType.startsWith("heading")) {
          baseCommands
            .setHeading({
              level: Number(nodeType.at(-1)) as 1 | 2 | 3 | 4 | 5 | 6,
            })
            .run();
        }
        if (nodeType === "blockquote") {
          baseCommands.setBlockquote().run();
        }
        if (nodeType === "codeBlock") {
          baseCommands.setCodeBlock().run();
        }
        if (nodeType === "paragraph") {
          baseCommands.setParagraph().run();
        }
      }}
    >
      <SelectTrigger className="w-full">
        {t(`widgets.rich_text_widget.${value}`)}
      </SelectTrigger>
      <SelectContent>
        {NODE_TYPES.map((nodeType) => (
          <SelectItem key={nodeType} value={nodeType}>
            {t(`widgets.rich_text_widget.${nodeType}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
