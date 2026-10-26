import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Form, FormField } from "@/components/ui/form";
import { BlockWidget } from "@/components/widgets/block-widget/block-widget";
import {
  blockSummary,
  canMoveInto,
  duplicateBlock,
  findBlock,
  getList,
  moveBlock,
  moveBlockTo,
  ROOT_LIST,
  setList,
} from "@/components/widgets/block-widget/blocks";
import { setServerErrors } from "@/lib/server-errors";
import {
  type BlockDefinition,
  type BlockValue,
  FieldType,
  FieldWidget,
  type Model,
  type ModelField,
} from "@/types";

// jsdom has no layout; cmdk scrolls the active option into view.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const useAdminInfoMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: useAdminInfoMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { block?: string }) =>
      options?.block ? `${key}:${options.block}` : key,
  }),
}));

const TEXT: BlockDefinition = {
  name: "text",
  verbose_name: "Text",
  description: "Rich text",
  icon: "ph-bold ph-text-t",
  fields: {
    heading: { type: FieldType.CharField, verbose_name: "heading" },
    body: { type: FieldType.TextField, verbose_name: "body", required: true },
  },
};

const QUOTE: BlockDefinition = {
  name: "quote",
  verbose_name: "Quote",
  description: "",
  icon: null,
  fields: {
    quote: { type: FieldType.CharField, verbose_name: "quote" },
  },
};

const MODEL: Model = {
  label: "blog.page",
  verbose_name: "page",
  verbose_name_plural: "pages",
  tenant_field: null,
  admin: {
    is_singleton: false,
    icon: null,
    list: {
      per_page: 20,
      description: "",
      display: [],
      search: false,
      filter: [],
      sortable_by: null,
      actions: [],
    },
    edit: { main: [], sidebar: [], inlines: [] },
    permissions: {
      add_permission: true,
      change_permission: true,
      delete_permission: true,
      view_permission: true,
    },
  },
  fields: {},
};

function bodyField(overrides: Partial<ModelField> = {}): ModelField {
  return {
    type: FieldType.BlockField,
    verbose_name: "body",
    blocks: [TEXT, QUOTE],
    min_num: null,
    max_num: null,
    ...overrides,
  };
}

function text(id: string, body: string, heading = ""): BlockValue {
  return { id, type: "text", data: { heading, body } };
}

let form: UseFormReturn<{ body: BlockValue[] }>;

function Harness({
  body,
  field = bodyField(),
}: {
  body: BlockValue[];
  field?: ModelField;
}) {
  const instance = useForm<{ body: BlockValue[] }>({
    defaultValues: { body },
  });

  useEffect(() => {
    form = instance;
  });

  return (
    <Form {...instance}>
      <FormField
        control={instance.control}
        name="body"
        render={({ field: controller }) => (
          <BlockWidget
            name="body"
            model={{ ...MODEL, fields: { body: field } }}
            field={field}
            value={controller.value}
            onChange={controller.onChange}
          />
        )}
      />
    </Form>
  );
}

function bodies() {
  return form.getValues("body").map((block) => block.data.body);
}

beforeEach(() => {
  useAdminInfoMock.mockReturnValue({
    data: {
      formats: {},
      widgets: {
        [FieldType.CharField]: { name: FieldWidget.InputWidget },
        [FieldType.TextField]: { name: FieldWidget.TextAreaWidget },
      },
    },
  });
});

describe("BlockWidget", () => {
  it("renders each block with its fields and summary", () => {
    render(
      <Harness body={[text("a", "<p>Hello <b>world</b></p>", "Intro")]} />,
    );

    const block = screen.getByTestId("block");
    expect(within(block).getByText("Text")).toBeInTheDocument();
    expect(within(block).getByText("Intro")).toBeInTheDocument();
    expect(within(block).getByDisplayValue("Intro")).toBeInTheDocument();
    expect(within(block).getByText("body")).toBeInTheDocument();
  });

  it("edits a block field in the form value", async () => {
    render(<Harness body={[text("a", "Old")]} />);

    const input = screen.getByDisplayValue("Old");
    await userEvent.clear(input);
    await userEvent.type(input, "New");

    expect(bodies()).toEqual(["New"]);
  });

  it("keeps edits when blocks are added or moved afterwards", async () => {
    render(<Harness body={[text("a", "One"), text("b", "Two")]} />);

    const input = screen.getByDisplayValue("One");
    await userEvent.clear(input);
    await userEvent.type(input, "Edited");

    const [first] = screen.getAllByTestId("block");
    await userEvent.click(
      within(first).getByRole("button", {
        name: "widgets.block_widget.move_down:Text",
      }),
    );

    expect(bodies()).toEqual(["Two", "Edited"]);
  });

  it("adds a block from the picker, open and with a new id", async () => {
    render(<Harness body={[text("a", "One")]} />);

    await userEvent.click(
      screen.getByRole("button", { name: "widgets.block_widget.add_block" }),
    );
    await userEvent.click(await screen.findByRole("option", { name: /Quote/ }));

    const value = form.getValues("body");
    expect(value.map((block) => block.type)).toEqual(["text", "quote"]);
    expect(value[1].id).toBeTruthy();
    expect(value[1].id).not.toBe("a");
    expect(screen.getAllByTestId("block")).toHaveLength(2);
    expect(screen.getByText("quote")).toBeVisible();
  });

  it("adds a block between two blocks", async () => {
    render(<Harness body={[text("a", "One"), text("b", "Two")]} />);

    // One "+" between the two blocks; the end has the "Add block" button.
    const [insert] = screen.getAllByRole("button", {
      name: "widgets.block_widget.insert",
    });
    await userEvent.click(insert);
    await userEvent.click(await screen.findByRole("option", { name: /Quote/ }));

    expect(form.getValues("body").map((block) => block.type)).toEqual([
      "text",
      "quote",
      "text",
    ]);
  });

  it("hides the insert points at max_num", () => {
    render(
      <Harness
        body={[text("a", "One"), text("b", "Two")]}
        field={bodyField({ max_num: 2 })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "widgets.block_widget.insert" }),
    ).toBeNull();
  });

  it("gives each block a drag handle", () => {
    render(<Harness body={[text("a", "One"), text("b", "Two")]} />);

    const handles = screen.getAllByRole("button", {
      name: "widgets.block_widget.drag:Text",
    });
    expect(handles).toHaveLength(2);
    expect(handles[0]).toHaveAttribute("aria-roledescription", "sortable");
  });

  it("moves blocks up and down", async () => {
    render(<Harness body={[text("a", "One"), text("b", "Two")]} />);

    const [first] = screen.getAllByTestId("block");
    expect(
      within(first).getByRole("button", {
        name: "widgets.block_widget.move_up:Text",
      }),
    ).toBeDisabled();

    await userEvent.click(
      within(first).getByRole("button", {
        name: "widgets.block_widget.move_down:Text",
      }),
    );

    expect(bodies()).toEqual(["Two", "One"]);
  });

  it("duplicates and removes blocks from the menu", async () => {
    render(<Harness body={[text("a", "One"), text("b", "Two")]} />);

    const [first] = screen.getAllByTestId("block");
    await userEvent.click(
      within(first).getByRole("button", {
        name: "widgets.block_widget.more_actions:Text",
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", {
        name: "widgets.block_widget.duplicate",
      }),
    );

    expect(bodies()).toEqual(["One", "One", "Two"]);

    const [, , last] = screen.getAllByTestId("block");
    await userEvent.click(
      within(last).getByRole("button", {
        name: "widgets.block_widget.more_actions:Text",
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", {
        name: "widgets.block_widget.remove",
      }),
    );

    expect(bodies()).toEqual(["One", "One"]);
  });

  it("stops adding blocks at max_num", () => {
    render(
      <Harness
        body={[text("a", "One"), text("b", "Two")]}
        field={bodyField({ max_num: 2 })}
      />,
    );

    expect(
      screen.getByRole("button", { name: "widgets.block_widget.add_block" }),
    ).toBeDisabled();
    expect(
      screen.getByText("widgets.block_widget.max_reached"),
    ).toBeInTheDocument();
  });

  it("collapses long pages and opens blocks with errors", async () => {
    render(
      <Harness
        body={[
          text("a", "One"),
          text("b", ""),
          text("c", "Three"),
          text("d", "Four"),
        ]}
      />,
    );

    // More than three blocks: all start collapsed.
    expect(screen.getByDisplayValue("One")).not.toBeVisible();
    expect(screen.getByDisplayValue("Three")).not.toBeVisible();

    setServerErrors(form.setError as never, "body", {
      "1": { data: { body: ["This field cannot be blank."] } },
    });

    expect(
      await screen.findByText("This field cannot be blank."),
    ).toBeVisible();
    expect(screen.getByDisplayValue("One")).not.toBeVisible();
  });

  it("shows blocks of an unknown type, which can be removed", () => {
    render(
      <Harness body={[{ id: "a", type: "hero", data: { title: "Hi" } }]} />,
    );

    expect(
      screen.getByText("widgets.block_widget.unknown_type"),
    ).toBeInTheDocument();
  });
});

describe("block helpers", () => {
  it("summarizes a block by its first text, without markup", () => {
    expect(blockSummary(TEXT, text("a", "<p>Hello <b>world</b></p>"))).toBe(
      "Hello world",
    );
    expect(blockSummary(TEXT, text("a", "", ""))).toBe("");
  });

  it("summarizes a block by a related object's name", () => {
    const definition: BlockDefinition = {
      ...QUOTE,
      fields: { author: { type: FieldType.CharField } },
    };

    expect(
      blockSummary(definition, {
        id: "a",
        type: "quote",
        data: { author: { id: 1, __str__: "Ada" } },
      }),
    ).toBe("Ada");
  });

  it("does not move blocks past either end", () => {
    const blocks = [text("a", "One"), text("b", "Two")];

    expect(moveBlock(blocks, 0, -1)).toBe(blocks);
    expect(moveBlock(blocks, 1, 2)).toBe(blocks);
  });

  it("duplicates a block with its own id and data", () => {
    const blocks = [text("a", "One")];
    const { blocks: next, copy } = duplicateBlock(blocks, 0);

    expect(next).toHaveLength(2);
    expect(copy.id).not.toBe("a");
    expect(copy.data).toEqual(blocks[0].data);
    expect(copy.data).not.toBe(blocks[0].data);
  });
});

describe("setServerErrors", () => {
  it("sets errors at the paths of nested values", () => {
    const setError = vi.fn();

    setServerErrors(setError, "body", {
      "2": { data: { caption: ["Too long.", "Other."] } },
    });
    setServerErrors(setError, "title", ["Required."]);

    expect(setError.mock.calls).toEqual([
      ["body.2.data.caption", { type: "custom", message: "Too long." }],
      ["title", { type: "custom", message: "Required." }],
    ]);
  });
});

const COLUMNS: BlockDefinition = {
  name: "columns",
  verbose_name: "Columns",
  description: "",
  icon: null,
  fields: {
    left: {
      type: FieldType.BlockField,
      verbose_name: "left",
      blocks: [TEXT],
      max_num: 2,
    },
    right: {
      type: FieldType.BlockField,
      verbose_name: "right",
      blocks: [TEXT],
      max_num: 2,
    },
  },
};

function columns(
  id: string,
  left: BlockValue[] = [],
  right: BlockValue[] = [],
): BlockValue {
  return { id, type: "columns", data: { left, right } };
}

describe("blocks inside blocks", () => {
  it("shows a block field in a block as a list of its own", () => {
    render(
      <Harness
        body={[columns("c", [text("a", "Left")], [text("b", "Right")])]}
        field={bodyField({ blocks: [TEXT, COLUMNS] })}
      />,
    );

    const lists = screen.getAllByTestId("nested-block-list");
    expect(lists).toHaveLength(2);
    expect(within(lists[0]).getByDisplayValue("Left")).toBeInTheDocument();
    expect(within(lists[1]).getByDisplayValue("Right")).toBeInTheDocument();
    expect(
      within(lists[0]).getByText("widgets.block_widget.count"),
    ).toBeVisible();
  });

  it("adds, edits and removes blocks inside a block", async () => {
    render(
      <Harness
        body={[columns("c", [text("a", "Left")])]}
        field={bodyField({ blocks: [TEXT, COLUMNS] })}
      />,
    );

    const right = screen.getAllByTestId("nested-block-list")[1];
    await userEvent.click(
      within(right).getByRole("button", {
        name: "widgets.block_widget.add_block",
      }),
    );
    await userEvent.click(await screen.findByRole("option", { name: /Text/ }));

    // The new block's body (after its heading).
    const added = within(right).getAllByRole("textbox")[1];
    await userEvent.type(added, "New");

    const value = form.getValues("body")[0].data;
    expect((value.left as BlockValue[]).map((b) => b.data.body)).toEqual([
      "Left",
    ]);
    expect((value.right as BlockValue[]).map((b) => b.data.body)).toEqual([
      "New",
    ]);

    const left = screen.getAllByTestId("nested-block-list")[0];
    await userEvent.click(
      within(left).getByRole("button", {
        name: "widgets.block_widget.more_actions:Text",
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", {
        name: "widgets.block_widget.remove",
      }),
    );

    expect(form.getValues("body")[0].data.left).toEqual([]);
  });

  it("shows errors inside blocks on their field", async () => {
    render(
      <Harness
        body={[columns("c", [text("a", "")])]}
        field={bodyField({ blocks: [TEXT, COLUMNS] })}
      />,
    );

    setServerErrors(form.setError as never, "body", {
      "0": {
        data: {
          left: { "0": { data: { body: ["This field cannot be blank."] } } },
          right: ["Use at most 2 blocks."],
        },
      },
    });

    const [left, right] = screen.getAllByTestId("nested-block-list");
    expect(
      await within(left).findByText("This field cannot be blank."),
    ).toBeVisible();
    expect(
      within(right.parentElement!).getByText("Use at most 2 blocks."),
    ).toBeVisible();
  });
});

describe("block tree helpers", () => {
  const root = [
    text("a", "One"),
    columns("c", [text("l1", "L1"), text("l2", "L2")], [text("r1", "R1")]),
  ];

  it("finds blocks in every list", () => {
    expect(findBlock(root, "a")).toEqual({ list: ROOT_LIST, index: 0 });
    expect(findBlock(root, "l2")).toEqual({ list: "c:left", index: 1 });
    expect(findBlock(root, "r1")).toEqual({ list: "c:right", index: 0 });
    expect(findBlock(root, "x")).toBeNull();
  });

  it("moves blocks within a list and between lists", () => {
    const ids = (value: BlockValue[], list: string) =>
      getList(value, list).map((block) => block.id);

    const within = moveBlockTo(root, "l1", "c:left", 1);
    expect(ids(within, "c:left")).toEqual(["l2", "l1"]);

    const across = moveBlockTo(root, "l2", "c:right", 0);
    expect(ids(across, "c:left")).toEqual(["l1"]);
    expect(ids(across, "c:right")).toEqual(["l2", "r1"]);

    const out = moveBlockTo(root, "r1", ROOT_LIST, 1);
    expect(ids(out, ROOT_LIST)).toEqual(["a", "r1", "c"]);
    expect(ids(out, "c:right")).toEqual([]);

    // The original value is left alone.
    expect(ids(root, "c:left")).toEqual(["l1", "l2"]);
  });

  it("only moves blocks into lists that take them", () => {
    const options = { definitions: [TEXT], count: 0, maxNum: 2 };

    expect(canMoveInto(text("a", ""), "c:left", options)).toBe(true);
    expect(canMoveInto(columns("x"), "c:left", options)).toBe(false);
    expect(canMoveInto(text("a", ""), "c:left", { ...options, count: 2 })).toBe(
      false,
    );
    // Never into a list inside the block itself.
    expect(
      canMoveInto(columns("c"), "c:left", {
        ...options,
        definitions: [COLUMNS],
      }),
    ).toBe(false);
  });

  it("gives the blocks inside a duplicate new ids", () => {
    const { copy } = duplicateBlock(root, 1);
    const ids = [copy, ...getList([copy], `${copy.id}:left`)].map((b) => b.id);

    expect(ids).toHaveLength(3);
    expect(ids.some((id) => ["c", "l1", "l2"].includes(id))).toBe(false);
    expect(getList([copy], `${copy.id}:left`)[0].data.body).toBe("L1");
  });

  it("replaces the blocks of a nested list", () => {
    const next = setList(root, "c:right", []);

    expect(getList(next, "c:right")).toEqual([]);
    expect(next[0]).toBe(root[0]);
  });
});
