import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  type PermissionAppOption,
  PermissionMatrixWidget,
} from "@/components/widgets/permission-matrix-widget";
import type { Model, Resource } from "@/types";

const httpMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => httpMock,
}));

// Interpolated values are appended, so the labels tell rows apart.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options
        ? [key.split(".").pop(), ...Object.values(options)].join(" ")
        : key.split(".").pop(),
  }),
}));

const MODEL = { label: "auth.user", fields: {} } as unknown as Model;

function perm(
  id: number,
  model: string,
  action: "add" | "change" | "view" | "delete" | null,
  grantable = true,
  name = `Can ${action} ${model}`,
) {
  return {
    id,
    __str__: `blog | ${model} | ${name}`,
    codename: action ? `${action}_${model}` : `publish_${model}`,
    name,
    action,
    grantable,
  };
}

const OPTIONS: PermissionAppOption[] = [
  {
    app_label: "blog",
    name: "Blog",
    models: [
      {
        model: "blog.article",
        name: "Articles",
        permissions: [
          perm(1, "article", "add"),
          perm(2, "article", "change"),
          perm(3, "article", "delete", false),
          perm(4, "article", "view"),
          perm(5, "article", null, true, "Can publish article"),
        ],
      },
      {
        model: "blog.category",
        name: "Categories",
        permissions: [
          perm(6, "category", "add"),
          perm(7, "category", "change"),
          perm(8, "category", "delete"),
          perm(9, "category", "view"),
        ],
      },
    ],
  },
];

function Harness({
  initial,
  onChange,
  readOnly,
}: {
  initial: Resource[];
  onChange: (value: Resource[]) => void;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(initial);

  return (
    <QueryClientProvider client={new QueryClient()}>
      <PermissionMatrixWidget
        name="user_permissions"
        model={MODEL}
        value={value}
        readOnly={readOnly}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </QueryClientProvider>
  );
}

async function setup(initial: Resource[] = [], readOnly = false) {
  const onChange = vi.fn();
  render(<Harness initial={initial} onChange={onChange} readOnly={readOnly} />);
  await screen.findByText("Articles");

  return { onChange, user: userEvent.setup() };
}

function ids(value: Resource[]) {
  return value.map((item) => String(item.id)).sort();
}

describe("PermissionMatrixWidget", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    httpMock.get.mockResolvedValue({ data: OPTIONS });
  });

  it("loads the options of the field", async () => {
    await setup();

    expect(httpMock.get).toHaveBeenCalledWith(
      "/content/auth.user/permissions/user_permissions",
    );
    expect(screen.getByText("Blog")).toBeInTheDocument();
    expect(screen.getByText("Categories")).toBeInTheDocument();
    expect(screen.getByText("Can publish article")).toBeInTheDocument();
    expect(screen.getByText("count 0 9")).toBeInTheDocument();
  });

  it("checks the selected permissions", async () => {
    await setup([{ id: "2", __str__: "change" }]);

    expect(
      screen.getByRole("checkbox", { name: "toggle change Articles" }),
    ).toHaveAttribute("data-state", "checked");
    expect(
      screen.getByRole("checkbox", { name: "toggle add Articles" }),
    ).toHaveAttribute("data-state", "unchecked");
    expect(
      screen.getByRole("checkbox", { name: "toggle_model Articles" }),
    ).toHaveAttribute("data-state", "indeterminate");
  });

  it("toggles one permission", async () => {
    const { onChange, user } = await setup();

    await user.click(
      screen.getByRole("checkbox", { name: "toggle add Articles" }),
    );

    expect(onChange).toHaveBeenLastCalledWith([
      { id: "1", __str__: "blog | article | Can add article" },
    ]);

    await user.click(
      screen.getByRole("checkbox", { name: "toggle add Articles" }),
    );

    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("toggles a row, leaving what the editor may not grant", async () => {
    const { onChange, user } = await setup();

    await user.click(
      screen.getByRole("checkbox", { name: "toggle_model Articles" }),
    );

    expect(ids(onChange.mock.lastCall![0])).toEqual(["1", "2", "4", "5"]);
  });

  it("toggles a column", async () => {
    const { onChange, user } = await setup();

    await user.click(
      screen.getByRole("checkbox", { name: "toggle_column view" }),
    );

    expect(ids(onChange.mock.lastCall![0])).toEqual(["4", "9"]);

    await user.click(
      screen.getByRole("checkbox", { name: "toggle_column view" }),
    );

    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("toggles an app", async () => {
    const { onChange, user } = await setup();

    await user.click(screen.getByRole("checkbox", { name: "toggle_app Blog" }));

    expect(ids(onChange.mock.lastCall![0])).toEqual(
      ["1", "2", "4", "5", "6", "7", "8", "9"].sort(),
    );
  });

  it("keeps permissions the editor may not change", async () => {
    const { onChange, user } = await setup([{ id: "3", __str__: "delete" }]);

    expect(
      screen.getByRole("checkbox", { name: "toggle delete Articles" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", { name: "toggle_column delete" }),
    );

    expect(ids(onChange.mock.lastCall![0])).toEqual(["3", "8"]);

    await user.click(
      screen.getByRole("checkbox", { name: "toggle_column delete" }),
    );

    expect(ids(onChange.mock.lastCall![0])).toEqual(["3"]);
  });

  it("searches models and permissions", async () => {
    const { user } = await setup();

    await user.type(screen.getByRole("searchbox"), "categ");

    expect(screen.queryByText("Articles")).toBeNull();
    expect(screen.getByText("Categories")).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "publish");

    expect(screen.getByText("Articles")).toBeInTheDocument();
    expect(screen.queryByText("Categories")).toBeNull();

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "nothing like it");

    expect(screen.getByText("no_results")).toBeInTheDocument();
  });

  it("shows only the selected rows", async () => {
    const { user } = await setup([{ id: "7", __str__: "change" }]);

    await user.click(screen.getByText("selected_only"));

    expect(screen.queryByText("Articles")).toBeNull();
    expect(screen.getByText("Categories")).toBeInTheDocument();
  });

  it("changes nothing when read-only", async () => {
    await setup([{ id: "1", __str__: "add" }], true);

    expect(
      screen.getByRole("checkbox", { name: "toggle add Articles" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "toggle_model Categories" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "toggle add Articles" }),
    ).toHaveAttribute("data-state", "checked");
  });
});
