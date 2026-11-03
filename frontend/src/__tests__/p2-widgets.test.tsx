import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JSONWidget } from "@/components/widgets/code-widget";
import { IconPickerWidget } from "@/components/widgets/icon-picker-widget";
import { KeyValueWidget } from "@/components/widgets/key-value-widget";
import { ListWidget } from "@/components/widgets/list-widget";
import { MarkdownWidget } from "@/components/widgets/markdown-widget";
import { RatingWidget } from "@/components/widgets/rating-widget";
import { iconName, matchesIcon, parseIconNames } from "@/lib/icons";
import {
  contentFormSchema,
  findInvalidInput,
  InvalidInput,
} from "@/lib/invalid-input";
import { applyMarkdown } from "@/lib/markdown-edit";
import {
  formatJSON,
  parseJSON,
  rowsToList,
  rowsToValue,
} from "@/lib/widget-values";
import { FieldType, type ModelField } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { language: "en" },
  }),
}));

// CodeMirror needs a layout engine; a text area stands in for it.
vi.mock("@/components/ui/code-editor", () => ({
  CodeEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange(value: string): void;
  }) => (
    <textarea
      aria-label="code"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A widget wired to state, as the form wires it. */
function Controlled<T>({
  initial,
  onChange,
  children,
}: {
  initial: T;
  onChange?: (value: T) => void;
  children: (value: T, setValue: (value: T) => void) => React.ReactNode;
}) {
  const [value, setValue] = useState(initial);

  return children(value, (next) => {
    setValue(next);
    onChange?.(next);
  });
}

describe("applyMarkdown", () => {
  it("wraps the selection in bold, and unwraps it again", () => {
    const bold = applyMarkdown("bold", "a word here", 2, 6);
    expect(bold).toEqual({ text: "a **word** here", start: 4, end: 8 });

    expect(applyMarkdown("bold", bold.text, bold.start, bold.end)).toEqual({
      text: "a word here",
      start: 2,
      end: 6,
    });
  });

  it("makes a link of the selection and selects its URL", () => {
    const edit = applyMarkdown("link", "see docs", 4, 8);
    expect(edit.text).toBe("see [docs](https://)");
    expect(edit.text.slice(edit.start, edit.end)).toBe("https://");
  });

  it("prefixes and unprefixes the selected lines", () => {
    const list = applyMarkdown("bullet_list", "one\ntwo\nthree", 0, 7);
    expect(list.text).toBe("- one\n- two\nthree");
    expect(applyMarkdown("bullet_list", list.text, 0, 3).text).toBe(
      "one\n- two\nthree",
    );
    expect(applyMarkdown("ordered_list", "a\nb", 0, 3).text).toBe("1. a\n2. b");
    expect(applyMarkdown("heading", "Intro\nbody", 2, 2).text).toBe(
      "## Intro\nbody",
    );
  });
});

describe("MarkdownWidget", () => {
  it("formats the selected text from the toolbar", async () => {
    const onChange = vi.fn();
    render(<MarkdownWidget value="make it bold" onChange={onChange} />);

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(8, 12);
    fireEvent.click(
      screen.getByRole("button", { name: "widgets.markdown_widget.bold" }),
    );

    expect(onChange).toHaveBeenCalledWith("make it **bold**");
  });

  it("previews the Markdown, without raw HTML", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MarkdownWidget
        value={"## Title\n\nSome **bold** text <script>x()</script>"}
        onChange={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "widgets.markdown_widget.preview" }),
    );

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("script")).toBeNull();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("JSON values", () => {
  it("formats and parses JSON, empty text being null", () => {
    expect(formatJSON({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatJSON(null)).toBe("");
    expect(parseJSON(" ", "bad")).toBeNull();
    expect(parseJSON("[1, 2]", "bad")).toEqual([1, 2]);

    const invalid = parseJSON("{ oops", "bad");
    expect(invalid).toBeInstanceOf(InvalidInput);
    expect(invalid).toMatchObject({ text: "{ oops", message: "bad" });
  });

  it("keeps invalid input from being saved, also inside a value", () => {
    const invalid = new InvalidInput("{", "Not JSON");

    expect(contentFormSchema.safeParse({ data: { a: 1 } }).success).toBe(true);

    const result = contentFormSchema.safeParse({ title: "x", data: invalid });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["data"],
      message: "Not JSON",
    });

    expect(findInvalidInput({ blocks: [{ value: invalid }] })).toBe(invalid);
  });

  it("edits a JSONField as text and reports what it parses to", () => {
    const onChange = vi.fn();
    render(
      <Controlled initial={{ theme: "dark" } as unknown} onChange={onChange}>
        {(value, setValue) => <JSONWidget value={value} onChange={setValue} />}
      </Controlled>,
    );

    const editor = screen.getByRole("textbox");
    expect(editor).toHaveValue('{\n  "theme": "dark"\n}');

    fireEvent.change(editor, { target: { value: '{"theme": "light"}' } });
    expect(onChange).toHaveBeenLastCalledWith({ theme: "light" });

    fireEvent.change(editor, { target: { value: '{"theme": ' } });
    expect(onChange.mock.lastCall?.[0]).toBeInstanceOf(InvalidInput);
    // The text stays as typed.
    expect(editor).toHaveValue('{"theme": ');
  });

  it("shows a new value from outside, such as a reset", () => {
    const { rerender } = render(
      <JSONWidget value={{ a: 1 }} onChange={vi.fn()} />,
    );
    rerender(<JSONWidget value={[1, 2]} onChange={vi.fn()} />);

    expect(screen.getByRole("textbox")).toHaveValue("[\n  1,\n  2\n]");
  });
});

describe("KeyValueWidget", () => {
  const messages = {
    emptyKey: "empty",
    duplicateKey: (key: string) => `duplicate ${key}`,
  };

  it("turns rows into a dict, refusing empty and duplicate keys", () => {
    expect(
      rowsToValue(
        [
          { key: " size ", value: "L" },
          { key: "", value: "" },
        ],
        messages,
      ),
    ).toEqual({ size: "L" });
    expect(rowsToValue([{ key: "", value: "x" }], messages)).toMatchObject({
      message: "empty",
    });
    expect(
      rowsToValue(
        [
          { key: "a", value: "1" },
          { key: "a", value: "2" },
        ],
        messages,
      ),
    ).toMatchObject({ message: "duplicate a" });
  });

  it("edits rows of a key and a value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Controlled initial={{ color: "Blue" } as unknown} onChange={onChange}>
        {(value, setValue) => (
          <KeyValueWidget value={value} onChange={setValue} />
        )}
      </Controlled>,
    );

    await user.click(
      screen.getByRole("button", { name: "widgets.key_value_widget.add" }),
    );
    const keys = screen.getAllByRole("textbox", {
      name: "widgets.key_value_widget.key",
    });
    const values = screen.getAllByRole("textbox", {
      name: "widgets.key_value_widget.value",
    });

    await user.type(keys[1], "size");
    await user.type(values[1], "L");
    expect(onChange).toHaveBeenLastCalledWith({ color: "Blue", size: "L" });

    await user.clear(keys[1]);
    await user.type(keys[1], "color");
    expect(onChange.mock.lastCall?.[0]).toBeInstanceOf(InvalidInput);
    expect(keys[1]).toHaveAttribute("aria-invalid", "true");

    await user.click(
      screen.getAllByRole("button", {
        name: /widgets.key_value_widget.remove/,
      })[0],
    );
    expect(onChange).toHaveBeenLastCalledWith({ color: "L" });
  });
});

describe("ListWidget", () => {
  it("drops blank rows from the list", () => {
    expect(
      rowsToList([{ value: "a" }, { value: " " }, { value: "a" }]),
    ).toEqual(["a", "a"]);
  });

  it("adds a row with Enter and removes rows", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Controlled initial={["Mix"] as unknown} onChange={onChange}>
        {(value, setValue) => <ListWidget value={value} onChange={setValue} />}
      </Controlled>,
    );

    await user.click(screen.getByRole("textbox", { name: /item.*1/ }));
    await user.keyboard("{End}{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /item.*2/ })).toHaveFocus(),
    );
    await user.keyboard("Bake");
    expect(onChange).toHaveBeenLastCalledWith(["Mix", "Bake"]);

    await user.click(
      screen.getByRole("button", { name: /widgets.list_widget.remove.*1/ }),
    );
    expect(onChange).toHaveBeenLastCalledWith(["Bake"]);
  });
});

describe("RatingWidget", () => {
  const field: ModelField = { type: FieldType.IntegerField, required: false };

  it("sets the rating from a star, and clears it from the same star", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Controlled initial={null as number | null} onChange={onChange}>
        {(value, setValue) => (
          <RatingWidget field={field} value={value} onChange={setValue} />
        )}
      </Controlled>,
    );

    const stars = screen.getAllByRole("radio");
    expect(stars).toHaveLength(5);

    await user.click(stars[3]);
    expect(onChange).toHaveBeenLastCalledWith(4);
    expect(stars[3]).toBeChecked();

    await user.click(stars[3]);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("moves with the arrow keys and keeps a required rating", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Controlled initial={2 as number | null} onChange={onChange}>
        {(value, setValue) => (
          <RatingWidget
            field={{ ...field, required: true }}
            value={value}
            options={{ max_value: 3 }}
            onChange={setValue}
          />
        )}
      </Controlled>,
    );

    const stars = screen.getAllByRole("radio");
    expect(stars).toHaveLength(3);

    stars[1].focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith(3);

    await user.click(stars[2]);
    expect(onChange).toHaveBeenLastCalledWith(3);
  });
});

describe("IconPickerWidget", () => {
  const css =
    '.ph-bold.ph-star:before { content: "\\e46a"; }\n' +
    '.ph-bold.ph-arrow-up:before { content: "\\e08e"; }\n' +
    '.ph-bold.ph-arrow-circle-up:before { content: "\\e090"; }\n';

  it("reads icon names from the stylesheet and searches them", () => {
    expect(parseIconNames(css)).toEqual([
      "arrow-circle-up",
      "arrow-up",
      "star",
    ]);
    expect(iconName("ph-bold ph-star")).toBe("star");
    expect(iconName("fa fa-star")).toBeNull();
    expect(matchesIcon("arrow-circle-up", "up arrow")).toBe(true);
    expect(matchesIcon("arrow-circle-up", "down")).toBe(false);
  });

  it("picks an icon and saves its class", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(css, { status: 200 })),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <IconPickerWidget value="" onChange={onChange} />
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: /icon_picker_widget.choose/ }),
    );
    await user.type(
      await screen.findByRole("textbox", {
        name: "widgets.icon_picker_widget.search",
      }),
      "arrow",
    );

    expect(screen.getAllByRole("option")).toHaveLength(2);
    await user.click(screen.getByRole("option", { name: "arrow-up" }));
    expect(onChange).toHaveBeenCalledWith("ph-bold ph-arrow-up");
  });
});
