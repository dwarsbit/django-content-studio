import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  colorForInitials,
  RelationGlyph,
} from "@/components/widgets/relation-glyph";

describe("RelationGlyph", () => {
  it("renders the avatar when everything is set", () => {
    render(
      <RelationGlyph
        avatar="/media/ada.png"
        initials="Ada"
        icon="ph-bold ph-tag"
        size="size-6"
      />,
    );

    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      "/media/ada.png",
    );
  });

  it("renders one initial on a colored circle when no avatar is set", () => {
    render(
      <RelationGlyph initials="Ada" icon="ph-bold ph-tag" size="size-6" />,
    );

    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("A").className).toContain(colorForInitials("Ada"));
  });

  it("renders the icon when neither avatar nor initials is set", () => {
    render(<RelationGlyph icon="ph-bold ph-tag" size="size-6" />);

    const icon = document.querySelector(".ph-bold");
    expect(icon).toBeInTheDocument();
  });

  it("renders nothing when no glyph option is set", () => {
    const { container } = render(<RelationGlyph size="size-6" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("derives the initials color deterministically from the full value", () => {
    // Same initials value always maps to the same color, and different
    // values spread over the palette.
    expect(colorForInitials("Ada")).toBe(colorForInitials("Ada"));
    expect(colorForInitials("Al")).not.toBe(colorForInitials("Am"));
    expect(colorForInitials("Zz")).toMatch(
      /^bg-(red|orange|amber|green|teal|sky|indigo|purple|pink)-100 text-/,
    );
  });
});
