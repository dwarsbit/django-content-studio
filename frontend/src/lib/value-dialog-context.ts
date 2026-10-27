import React from "react";

/**
 * Shows a value once, such as a generated secret, in a dialog with a
 * copy button. Provided by ValueDialogProvider at the app's root, so
 * the dialog survives the navigation that follows creating an object.
 */
export const ValueDialogContext = React.createContext<{
  showValue(value: string): void;
}>({
  showValue: () => {},
});
