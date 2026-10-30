import * as R from "ramda";

import type { EditWidth, Model } from "@/types";

// At the default width the main column stops at a readable 800px and
// the sidebar sits next to it; "wide" lets the column fill the page.
export function getMainColumnWidth(width: EditWidth = "default") {
  return width === "wide" ? "" : "max-w-[800px]";
}

// Dialogs fit the editor they hold: the main column, the sidebar when
// the model has one, and the editor's 24px padding on either side.
export function getEditorDialogWidth(
  model: Model,
  width: EditWidth = "default",
) {
  if (width === "wide") {
    return "sm:max-w-[min(1200px,calc(100vw-48px))]";
  }

  return R.isEmpty(model.admin.edit.sidebar ?? [])
    ? "sm:max-w-[min(848px,calc(100vw-48px))]"
    : "sm:max-w-[min(1192px,calc(100vw-48px))]";
}
