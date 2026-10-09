import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { Form } from "@/components/ui/form";
import { ManyToManyWidget } from "@/components/widgets/many-to-many-widget";
import type { Model, Resource } from "@/types";

const httpMock = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => httpMock,
}));

const MODEL: Model = {
  label: "demo_blog.article",
  verbose_name: "article",
  verbose_name_plural: "articles",
  tenant_field: null,
  admin: {
    is_singleton: false,
    format_mapping: {},
    widget_mapping: {},
    icon: null,
    list: {
      per_page: 20,
      description: "",
      display: [],
      search: false,
      filter: [],
      sortable_by: null,
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

function Harness({
  value,
  onChange,
}: {
  value: Resource[];
  onChange: (value: Resource[]) => void;
}) {
  const form = useForm();

  return (
    <QueryClientProvider client={new QueryClient()}>
      <Form {...form}>
        <ManyToManyWidget
          name="categories"
          model={MODEL}
          value={value}
          onChange={onChange}
        />
      </Form>
    </QueryClientProvider>
  );
}

function setup(
  value: Resource[] = [],
  postResult: Promise<{ data: unknown[] }> = Promise.resolve({
    data: [],
  }),
) {
  httpMock.post.mockReturnValue(postResult);
  const onChange = vi.fn();
  render(<Harness value={value} onChange={onChange} />);
  return { onChange };
}

const OPTIONS = {
  data: [
    { id: "1", __str__: "News" },
    { id: "2", __str__: "Tutorials" },
  ],
};

describe("ManyToManyWidget", () => {
  it("shows a loading state while relations are fetched", async () => {
    setup([], new Promise(() => {})); // never resolves: stays in flight

    await userEvent.click(screen.getByRole("combobox"));

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("adds a picked option to the selection and keeps the list open", async () => {
    const { onChange } = setup([], Promise.resolve(OPTIONS));

    await userEvent.click(screen.getByRole("combobox"));
    await waitFor(() => expect(screen.getByText("News")).toBeInTheDocument());

    await userEvent.click(screen.getByText("Tutorials"));

    expect(onChange).toHaveBeenCalledWith([{ id: "2", __str__: "Tutorials" }]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not offer already selected options in the dropdown", async () => {
    setup([{ id: "1", __str__: "News" }], Promise.resolve(OPTIONS));

    await userEvent.click(screen.getByRole("combobox"));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    const dropdown = within(screen.getByRole("dialog"));
    expect(dropdown.queryByText("News")).not.toBeInTheDocument();
    expect(dropdown.getByText("Tutorials")).toBeInTheDocument();
  });

  it("removes a selection through its badge", async () => {
    const { onChange } = setup([{ id: "1", __str__: "News" }]);

    await userEvent.click(
      screen.getByRole("button", {
        name: "widgets.relation_widget.remove",
      }),
    );

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("renders the relation display description of an option", async () => {
    setup(
      [],
      Promise.resolve({
        data: [
          {
            id: "1",
            __str__: "General",
            description: "3 article(s)",
            icon: "ph-bold ph-tag",
          },
        ],
      }),
    );

    await userEvent.click(screen.getByRole("combobox"));

    await waitFor(() =>
      expect(screen.getByText("3 article(s)")).toBeInTheDocument(),
    );
  });

  it("shows an empty state when the search yields no results", async () => {
    setup();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.type(
      screen.getByPlaceholderText("common.search"),
      "nothing",
    );

    await waitFor(() =>
      expect(
        screen.getByText("widgets.relation_widget.no_results"),
      ).toBeInTheDocument(),
    );
  });
});
