import { describe, expect, it } from "vitest";

import {
  getEditorDialogWidth,
  getMainColumnWidth,
} from "@/components/content-editor/edit-width";
import type { Model } from "@/types";

function model(sidebar: Model["admin"]["edit"]["sidebar"]): Model {
  return { admin: { edit: { sidebar } } } as unknown as Model;
}

const formSet = { title: "", description: "", fields: [] };

describe("getMainColumnWidth", () => {
  it("caps the main column by default", () => {
    expect(getMainColumnWidth()).toBe("max-w-[800px]");
    expect(getMainColumnWidth("default")).toBe("max-w-[800px]");
  });

  it("lets a wide studio fill the page", () => {
    expect(getMainColumnWidth("wide")).toBe("");
  });
});

describe("getEditorDialogWidth", () => {
  it("fits the main column without a sidebar", () => {
    expect(getEditorDialogWidth(model([]))).toContain("848px");
  });

  it("makes room for the sidebar", () => {
    expect(getEditorDialogWidth(model([formSet]))).toContain("1192px");
  });

  it("keeps the full width for a wide studio", () => {
    expect(getEditorDialogWidth(model([]), "wide")).toContain("1200px");
  });
});
