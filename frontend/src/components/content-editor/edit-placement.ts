import { createContext } from "react";

/**
 * Where a form field or component sits on the edit page: the main
 * column or the sidebar. Components that adapt to the room they get,
 * like Analytics, read it.
 */
export const EditPlacementContext = createContext<"main" | "sidebar">("main");
