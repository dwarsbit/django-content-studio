import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { TagInput } from "@/components/ui/tag-input";

function setup(initial: string[] = []) {
  const onChange = vi.fn();
  render(<ControlledTagInput onChange={onChange} initial={initial} />);
  return { onChange };
}

function ControlledTagInput({
  onChange,
  initial,
}: {
  onChange: (next: string[]) => void;
  initial: string[];
}) {
  const [tags, setTags] = useState(initial);
  return (
    <>
      <TagInput
        value={tags}
        onChange={(next) => {
          setTags(next);
          onChange(next);
        }}
      />
      <button type="button">next focus stop</button>
    </>
  );
}

async function commitWith(input: HTMLElement, tag: string, key: string) {
  await userEvent.type(input, tag);
  await userEvent.type(input, key);
}

describe("TagInput", () => {
  it("commits a tag on Enter", async () => {
    const { onChange } = setup();
    const input = screen.getByRole("textbox");

    await commitWith(input, "django", "{Enter}");

    expect(onChange).toHaveBeenCalledWith(["django"]);
  });

  it("commits a tag on Tab and lets focus move on", async () => {
    const { onChange } = setup();
    const input = screen.getByRole("textbox");

    await commitWith(input, "django", "{Tab}");

    expect(onChange).toHaveBeenCalledWith(["django"]);
    expect(
      screen.getByRole("button", { name: "next focus stop" }),
    ).toHaveFocus();
  });

  it("commits a tag on a comma", async () => {
    const { onChange } = setup();
    const input = screen.getByRole("textbox");

    await userEvent.type(input, "hello, world");
    // The first comma commits "hello"; the second part commits on Enter.
    await userEvent.type(input, "{Enter}");

    expect(onChange).toHaveBeenLastCalledWith(["hello", "world"]);
  });

  it("ignores duplicate tags case-insensitively", async () => {
    const { onChange } = setup(["Django"]);
    const input = screen.getByRole("textbox");

    await commitWith(input, "django", "{Enter}");

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Django")).toBeInTheDocument();
  });

  it("commits pending text on blur", async () => {
    const { onChange } = setup();
    const input = screen.getByRole("textbox");

    await userEvent.type(input, "pending");
    await screen.getByRole("button", { name: "next focus stop" }).focus();

    expect(onChange).toHaveBeenCalledWith(["pending"]);
  });

  it("removes the last tag on backspace when the input is empty", async () => {
    const { onChange } = setup(["a", "b"]);
    const input = screen.getByRole("textbox");
    input.focus();

    await userEvent.type(input, "{Backspace}");

    expect(onChange).toHaveBeenCalledWith(["a"]);
  });

  it("removes a tag through its remove button", async () => {
    const { onChange } = setup(["a", "b"]);

    await userEvent.click(screen.getByRole("button", { name: "Remove a" }));

    expect(onChange).toHaveBeenCalledWith(["b"]);
  });
});
