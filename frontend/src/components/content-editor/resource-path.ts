import { createContext } from "react";

/**
 * The API path of the resource the editor edits: the content endpoints
 * for registered models, the parent's inline endpoints for inlines.
 * Unset outside an editor; consumers fall back to the content endpoints.
 */
export const ResourcePathContext = createContext<string | null>(null);
