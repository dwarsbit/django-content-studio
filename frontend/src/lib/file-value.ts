import type { PickedFile, SavedFile } from "@/types";

/** A file picked in the editor: uploaded, attached on save. */
export const isPickedFile = (value: unknown): value is PickedFile =>
  typeof value === "object" && value !== null && "upload" in value;

/** A file saved on the object. */
export const isSavedFile = (value: unknown): value is SavedFile =>
  typeof value === "object" &&
  value !== null &&
  "url" in value &&
  !("upload" in value);
