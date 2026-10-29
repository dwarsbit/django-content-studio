import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { type FieldValues, useForm, type UseFormReturn } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { Form } from "@/components/ui/form";
import { ForeignKeyWidget } from "@/components/widgets/foreign-key-widget";
import type { Model } from "@/types";

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

function Harness({
  onChange,
  formRef,
}: {
  onChange: (value: unknown) => void;
  formRef?: { current: UseFormReturn | null };
}) {
  const form = useForm<FieldValues>({ defaultValues: { title: "Hello" } });

  // Hands the form to the test, so it can change other fields.
  useEffect(() => {
    if (formRef) {
      formRef.current = form;
    }
  }, [form, formRef]);

  return (
    <QueryClientProvider client={new QueryClient()}>
      <Form {...form}>
        <ForeignKeyWidget
          name="author"
          model={MODEL}
          value={null}
          onChange={onChange}
        />
      </Form>
    </QueryClientProvider>
  );
}

function setup(
  postResult: Promise<{ data: unknown[] }> = Promise.resolve({ data: [] }),
) {
  httpMock.post.mockReset();
  httpMock.post.mockReturnValue(postResult);
  const onChange = vi.fn();
  const formRef: { current: UseFormReturn | null } = { current: null };
  render(<Harness onChange={onChange} formRef={formRef} />);
  return { onChange, formRef };
}

describe("ForeignKeyWidget", () => {
  it("shows a loading state while relations are fetched", async () => {
    setup(new Promise(() => {})); // never resolves: stays in flight

    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders the fetched relations and reports selection", async () => {
    const { onChange } = setup(
      Promise.resolve({
        data: [
          { id: "1", __str__: "Ada" },
          { id: "2", __str__: "Grace" },
        ],
      }),
    );

    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Ada")).toBeInTheDocument());

    await userEvent.click(screen.getByText("Grace"));

    expect(onChange).toHaveBeenCalledWith({ id: "2", __str__: "Grace" });
  });

  it("renders the relation display description and icon of an option", async () => {
    setup(
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

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(screen.getByText("3 article(s)")).toBeInTheDocument(),
    );
    expect(screen.getByText("General")).toBeInTheDocument();
  });

  it("sends the form's values as they are when the picker opens", async () => {
    setup();

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(httpMock.post).toHaveBeenCalledTimes(1));
    expect(httpMock.post).toHaveBeenCalledWith(
      "/content/demo_blog.article/relations/author",
      { search: "", form: { title: "Hello" } },
    );
  });

  it("does not refetch when another field of the form changes", async () => {
    const { formRef } = setup();

    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(httpMock.post).toHaveBeenCalledTimes(1));

    act(() => {
      formRef.current?.setValue("title", "Changed");
    });

    // Settle: a refetch would be another call.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(httpMock.post).toHaveBeenCalledTimes(1);
  });

  it("reads the form again the next time the picker opens", async () => {
    const { formRef } = setup();

    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(httpMock.post).toHaveBeenCalledTimes(1));
    await userEvent.keyboard("{Escape}");

    act(() => {
      formRef.current?.setValue("title", "Changed");
    });
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(httpMock.post).toHaveBeenCalledTimes(2));
    expect(httpMock.post).toHaveBeenLastCalledWith(
      "/content/demo_blog.article/relations/author",
      { search: "", form: { title: "Changed" } },
    );
  });

  it("shows an empty state when the search yields no results", async () => {
    setup(Promise.resolve({ data: [] }));

    await userEvent.click(screen.getByRole("button"));
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
