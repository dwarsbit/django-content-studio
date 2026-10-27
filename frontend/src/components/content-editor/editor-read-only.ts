import { createContext } from "react";

/**
 * Whether the editor only shows the object: every field is read-only
 * and there is no save button, such as an inline row the editor may
 * view but not change.
 */
export const EditorReadOnlyContext = createContext(false);
