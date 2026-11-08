import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfilePage } from "@/pages/(studio)/profile/page";
import { FieldType, FieldWidget, type FormField, type Model } from "@/types";

const httpMock = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));
const setTokenMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const useDiscoverMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-http", () => ({ useHttp: () => httpMock }));
vi.mock("@/hooks/use-discover", () => ({ useDiscover: useDiscoverMock }));
vi.mock("@/auth", () => ({ useAuth: () => ({ setToken: setTokenMock }) }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: () => ({
    data: {
      formats: {},
      widgets: {
        [FieldType.CharField]: { name: FieldWidget.InputWidget },
        [FieldType.EmailField]: { name: FieldWidget.InputWidget },
      },
      settings: {},
    },
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

function field(name: string, overrides: Partial<FormField> = {}): FormField {
  return {
    type: "field",
    name,
    label: null,
    readonly: false,
    col_span: 1,
    widget: null,
    component_id: "",
    component_type: "LinkButton",
    copy: false,
    icon: "",
    ...overrides,
  };
}

const userModel = {
  label: "auth.user",
  verbose_name: "user",
  verbose_name_plural: "users",
  tenant_field: null,
  admin: { icon: null, edit: {} },
  fields: {
    first_name: {
      type: FieldType.CharField,
      verbose_name: "first name",
    },
    last_name: { type: FieldType.CharField, verbose_name: "last name" },
    email: { type: FieldType.CharField, verbose_name: "email address" },
  },
} as unknown as Model;

const articleModel = {
  label: "blog.article",
  verbose_name: "article",
  verbose_name_plural: "articles",
  admin: { icon: null },
  fields: {},
} as unknown as Model;

const profile = {
  user: {
    id: 1,
    username: "alex",
    name: "Alex Morgan",
    email: "alex@example.com",
    initials: "",
    avatar: null,
    is_superuser: true,
    groups: ["Editors"],
    date_joined: "2024-03-12T10:00:00Z",
    last_login: "2026-11-08T08:00:00Z",
  },
  fields: [
    field("first_name"),
    field("last_name"),
    field("email", { col_span: 2 }),
  ],
  values: {
    first_name: "Alex",
    last_name: "Morgan",
    email: "alex@example.com",
  },
  password: true,
};

const point = (value: number) => ({
  date: "2026-11-01T00:00:00Z",
  value,
  previous: 0,
});

const activity = {
  range: {
    start: "2026-10-10T00:00:00Z",
    end: "2026-11-09T00:00:00Z",
    interval: "day",
  },
  metrics: [
    { key: "total", value: 12, previous: 10 },
    { key: "created", value: 3, previous: 2 },
    { key: "updated", value: 8, previous: 8 },
    { key: "deleted", value: 1, previous: 0 },
  ],
  series: {
    total: [point(12)],
    created: [point(3)],
    updated: [point(8)],
    deleted: [point(1)],
  },
  models: [{ key: "blog.article", label: "articles", value: 12 }],
};

const recent = {
  items: [
    {
      model: "blog.article",
      model_label: "article",
      id: "7",
      title: "Slow trains",
      action: "updated",
      timestamp: "2026-11-08T07:00:00Z",
      thumbnail: null,
      link: true,
    },
    {
      model: "blog.article",
      model_label: "article",
      id: "9",
      title: "Winter guide",
      action: "deleted",
      timestamp: "2026-11-07T07:00:00Z",
      thumbnail: null,
      link: false,
    },
  ],
};

function respond(url: string) {
  if (url === "/profile") return { data: profile };
  if (url === "/profile/activity") return { data: activity };
  if (url === "/profile/recent") return { data: recent };
  throw new Error(`unexpected ${url}`);
}

function renderPage(path = "/profile") {
  const router = createMemoryRouter(
    [
      { path: "/profile", element: <ProfilePage tab="overview" /> },
      { path: "/profile/edit", element: <ProfilePage tab="edit" /> },
      { path: "/content/:model/:id", element: <div>editor</div> },
    ],
    { initialEntries: [path] },
  );

  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
}

function badRequest(data: unknown) {
  return new AxiosError("Bad Request", "400", undefined, undefined, {
    status: 400,
    data,
  } as AxiosResponse);
}

describe("Profile page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    httpMock.get.mockImplementation(async (url: string) => respond(url));
    useDiscoverMock.mockReturnValue({
      data: { user_model: "auth.User", models: [userModel, articleModel] },
    });
  });

  it("shows who the user is, their changes and recent content", async () => {
    renderPage();

    expect(await screen.findByText("Alex Morgan")).toBeInTheDocument();
    expect(screen.getByText("alex · alex@example.com")).toBeInTheDocument();
    expect(screen.getByText("profile.superuser")).toBeInTheDocument();
    expect(screen.getByText("Editors")).toBeInTheDocument();

    const total = await screen.findByRole("button", {
      name: /profile\.metrics\.total/,
    });
    await waitFor(() => expect(total).toHaveTextContent("12"));
    expect(httpMock.get).toHaveBeenCalledWith("/profile/activity", {
      params: { range: "30d" },
    });
    // Model names start with a capital.
    expect(screen.getByText("Articles")).toBeInTheDocument();

    const link = await screen.findByRole("link", { name: /Slow trains/ });
    expect(link).toHaveAttribute("href", "/content/blog.article/7");
    // Deleted objects have no edit page to link to.
    expect(screen.getByText("Winter guide").closest("a")).toBeNull();
  });

  it("reads the range from the URL", async () => {
    renderPage("/profile?range=7d");

    await waitFor(() =>
      expect(httpMock.get).toHaveBeenCalledWith("/profile/activity", {
        params: { range: "7d" },
      }),
    );
  });

  it("saves the profile fields", async () => {
    const user = userEvent.setup();
    httpMock.patch.mockResolvedValue({
      data: { ...profile, values: { ...profile.values, first_name: "Alexa" } },
    });
    renderPage("/profile/edit");

    const input = await screen.findByDisplayValue("Alex");
    const save = screen.getByRole("button", { name: "common.save" });
    expect(save).toBeDisabled();

    await user.clear(input);
    await user.type(input, "Alexa");
    await user.click(save);

    await waitFor(() =>
      expect(httpMock.patch).toHaveBeenCalledWith("/profile", {
        first_name: "Alexa",
        last_name: "Morgan",
        email: "alex@example.com",
      }),
    );
    expect(toastMock.success).toHaveBeenCalledWith("profile.saved");
  });

  it("shows a save's field errors", async () => {
    const user = userEvent.setup();
    httpMock.patch.mockRejectedValue(
      badRequest({ email: ["Enter a valid email address."] }),
    );
    renderPage("/profile/edit");

    const input = await screen.findByDisplayValue("alex@example.com");
    await user.clear(input);
    await user.type(input, "nope");
    await user.click(screen.getByRole("button", { name: "common.save" }));

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeInTheDocument();
  });

  it("changes the password in a dialog and continues the session", async () => {
    const user = userEvent.setup();
    httpMock.post.mockResolvedValue({ data: { access: "new-token" } });
    renderPage("/profile/edit");

    // No password fields on the page itself.
    await screen.findByDisplayValue("Alex");
    expect(document.querySelector("input[type=password]")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "profile.password.change" }),
    );
    const dialog = await screen.findByRole("dialog");

    await user.type(
      within(dialog).getByLabelText("profile.password.current"),
      "old",
    );
    await user.type(
      within(dialog).getByLabelText("profile.password.new"),
      "new-Secret-42",
    );
    await user.type(
      within(dialog).getByLabelText("profile.password.confirm"),
      "new-Secret-42",
    );
    expect(
      within(dialog).getByLabelText("profile.password.current"),
    ).toHaveAttribute("autocomplete", "current-password");
    await user.click(
      within(dialog).getByRole("button", { name: "profile.password.change" }),
    );

    await waitFor(() =>
      expect(httpMock.post).toHaveBeenCalledWith("/profile/password", {
        current_password: "old",
        new_password: "new-Secret-42",
      }),
    );
    expect(setTokenMock).toHaveBeenCalledWith("new-token");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("checks the confirmation and shows the server's errors", async () => {
    const user = userEvent.setup();
    httpMock.post.mockRejectedValue(
      badRequest({
        current_password: ["Your current password is not correct."],
      }),
    );
    renderPage("/profile/edit");

    await user.click(
      await screen.findByRole("button", { name: "profile.password.change" }),
    );
    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", {
      name: "profile.password.change",
    });

    await user.type(
      within(dialog).getByLabelText("profile.password.current"),
      "wrong",
    );
    await user.type(
      within(dialog).getByLabelText("profile.password.new"),
      "one-Secret-42",
    );
    await user.type(
      within(dialog).getByLabelText("profile.password.confirm"),
      "two-Secret-42",
    );
    await user.click(submit);

    expect(
      within(dialog).getByText("profile.password.mismatch"),
    ).toBeInTheDocument();
    expect(httpMock.post).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText("profile.password.confirm"));
    await user.type(
      within(dialog).getByLabelText("profile.password.confirm"),
      "one-Secret-42",
    );
    await user.click(submit);

    expect(
      await within(dialog).findByText("Your current password is not correct."),
    ).toBeInTheDocument();
    expect(setTokenMock).not.toHaveBeenCalled();
  });

  it("leaves the password out for users who cannot change it", async () => {
    httpMock.get.mockImplementation(async (url: string) =>
      url === "/profile"
        ? { data: { ...profile, password: false } }
        : respond(url),
    );
    renderPage("/profile/edit");

    await screen.findByDisplayValue("Alex");
    expect(
      screen.queryByRole("button", { name: "profile.password.change" }),
    ).not.toBeInTheDocument();
  });
});
