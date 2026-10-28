import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JSONSchemaWidget } from "@/components/widgets/json-schema-widget";
import { FieldType, type ModelField } from "@/types";

const field: ModelField = {
  type: FieldType.FlexField,
  json_schema: {
    type: "object",
    properties: {
      title: { type: "string", title: "Page title" },
      slug: { type: "string" },
    },
  },
};

describe("JSONSchemaWidget", () => {
  it("renders an input per schema property", () => {
    render(
      <JSONSchemaWidget
        field={field}
        value={{ title: "Spring launch" }}
        onChange={() => {}}
      />,
    );

    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.getByDisplayValue("Spring launch")).toBeInTheDocument();
  });

  it("labels inputs with the property title, or else its key", () => {
    render(<JSONSchemaWidget field={field} value={{}} onChange={() => {}} />);

    expect(screen.getByText("Page title")).toBeInTheDocument();
    expect(screen.getByText("slug")).toBeInTheDocument();
  });
});
