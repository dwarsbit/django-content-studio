import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import type { ReactElement, ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useNavigate,
} from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialogProvider } from "@/components/confirm-dialog-provider";
import { Editor } from "@/components/content-editor/editor";
import { FormField } from "@/components/content-editor/form-field";
import { FormSet } from "@/components/content-editor/form-set";
import { Inline } from "@/components/content-editor/inline";
import { Main } from "@/components/content-editor/main";
import { Form } from "@/components/ui/form";
import type {
  FormField as IFormField,
  FormSet as IFormSet,
  Model,
  ModelField,
} from "@/types";
import { FieldType, FieldWidget } from "@/types";

const httpMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
const useAdminInfoMock = vi.hoisted(() => vi.fn());
const useDiscoverMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => httpMock,
}));

vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: useAdminInfoMock,
}));

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: useDiscoverMock,
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const adminInfo = {
  formats: {},
  widgets: {
    [FieldType.CharField]: { name: FieldWidget.InputWidget },
    [FieldType.BooleanField]: { name: FieldWidget.CheckboxWidget },
  },
  settings: {
    created_at_attr: "created_at",
    created_by_attr: "created_by",
    edited_at_attr: "edited_at",
    edited_by_attr: "edited_by",
  },
};

function makeFormField(
  name: string,
  overrides: Partial<IFormField> = {},
): IFormField {
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

const articleFields: Record<string, ModelField> = {
  id: {
    type: FieldType.UUIDField,
    primary_key: true,
    readonly: true,
    verbose_name: "ID",
  },
  title: {
    type: FieldType.CharField,
    required: true,
    verbose_name: "Title",
    help_text: "The title of the article.",
    default: "",
  },
  status: {
    type: FieldType.CharField,
    verbose_name: "Status",
    default: "draft",
  },
  is_published: {
    type: FieldType.BooleanField,
    verbose_name: "Published",
    default: false,
  },
};

function makeModel(
  overrides: {
    label?: string;
    fields?: Record<string, ModelField>;
    main?: { label: string; formsets: IFormSet[] }[];
    list?: Partial<Model["admin"]["list"]>;
    sidebar?: IFormSet[];
    readonlyFields?: string[];
    prepopulatedFields?: Record<string, string[]>;
  } = {},
): Model {
  return {
    label: overrides.label ?? "testapp.article",
    verbose_name: "Article",
    verbose_name_plural: "Articles",
    tenant_field: null,
    admin: {
      is_singleton: false,
      icon: null,
      list: {
        per_page: 10,
        description: "",
        display: [],
        search: false,
        filter: [],
        sortable_by: null,
        actions: [],
        ...overrides.list,
      },
      edit: {
        main: overrides.main ?? [
          {
            label: "",
            formsets: [
              {
                title: "",
                description: "",
                fields: [makeFormField("title"), makeFormField("is_published")],
              },
            ],
          },
        ],
        sidebar: overrides.sidebar ?? [],
        readonly_fields: overrides.readonlyFields ?? [],
        prepopulated_fields: overrides.prepopulatedFields ?? {},
        inlines: [],
      },
      permissions: {
        add_permission: true,
        change_permission: true,
        delete_permission: true,
        view_permission: true,
      },
    },
    fields: overrides.fields ?? articleFields,
  };
}

function makeDiscover(models: Model[]) {
  return {
    dashboard: { widgets: [] },
    extensions: [],
    model_groups: [],
    models,
    user_model: "auth.User",
    multitenancy: { enabled: false, tenant_model: null },
    media_library: {
      enabled: false,
      folders: false,
      models: { media_model: null, folder_model: null },
    },
  };
}

interface FormValues {
  id?: string;
  __str__?: string;
  __readonly_fields__?: string[];
  title: string;
  status: string;
  is_published: boolean;
}

function FormHarness({
  defaultValues,
  children,
}: {
  defaultValues: FormValues;
  children: ReactNode;
}) {
  const form = useForm<FormValues>({ defaultValues });

  return <Form {...form}>{children}</Form>;
}

// Renders the watched form value, to observe changes made through
// label clicks.
function ValueProbe({ name }: { name: keyof FormValues }) {
  const value = useWatch<FormValues>({ name });

  return <span data-testid="watched-value">{String(value)}</span>;
}

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

// The editor is a routed page in production: the navigation guard
// needs a data router, and the header renders a plain title outside
// dialogs.
function renderEditorPage(ui: ReactElement) {
  const router = createMemoryRouter([{ path: "/", element: ui }]);

  return renderWithQueryClient(<RouterProvider router={router} />);
}

describe("FormField", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAdminInfoMock.mockReturnValue({ data: adminInfo });
  });

  it("renders the widget the admin info maps to the field type", () => {
    render(
      <FormHarness
        defaultValues={{ title: "Hello", status: "draft", is_published: false }}
      >
        <FormField formField={makeFormField("title")} model={makeModel()} />
      </FormHarness>,
    );

    expect(screen.getByRole("textbox")).toHaveValue("Hello");
  });

  it("renders the form field's widget override instead of the default widget", () => {
    render(
      <FormHarness
        defaultValues={{ title: "Hello", status: "draft", is_published: false }}
      >
        <FormField
          formField={makeFormField("title", {
            widget: FieldWidget.TextAreaWidget,
          })}
          model={makeModel()}
        />
      </FormHarness>,
    );

    // The admin info maps CharField to InputWidget; the form field's
    // override wins and renders a textarea instead.
    const textbox = screen.getByRole("textbox");
    expect(textbox).toHaveValue("Hello");
    expect(textbox.tagName).toBe("TEXTAREA");
  });

  it("renders checkbox labels inline after the checkbox", () => {
    render(
      <FormHarness
        defaultValues={{ title: "", status: "draft", is_published: false }}
      >
        <FormField
          formField={makeFormField("is_published")}
          model={makeModel()}
        />
      </FormHarness>,
    );

    const checkbox = screen.getByRole("checkbox");
    const label = screen.getByText("Published");

    // The label follows the checkbox in the DOM instead of sitting above
    // it, and shares its row.
    expect(checkbox.compareDocumentPosition(label)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(checkbox.parentElement).toContainElement(label);
  });

  it("toggles the checkbox through its label", async () => {
    render(
      <FormHarness
        defaultValues={{ title: "", status: "draft", is_published: false }}
      >
        <FormField
          formField={makeFormField("is_published")}
          model={makeModel()}
        />
        <ValueProbe name="is_published" />
      </FormHarness>,
    );

    expect(screen.getByTestId("watched-value")).toHaveTextContent("false");

    await userEvent.click(screen.getByText("Published"));

    expect(screen.getByTestId("watched-value")).toHaveTextContent("true");
  });

  it("toggles the switch through its label", async () => {
    render(
      <FormHarness
        defaultValues={{ title: "", status: "draft", is_published: false }}
      >
        <FormField
          formField={makeFormField("is_published", {
            widget: FieldWidget.SwitchWidget,
          })}
          model={makeModel()}
        />
        <ValueProbe name="is_published" />
      </FormHarness>,
    );

    expect(screen.getByTestId("watched-value")).toHaveTextContent("false");

    await userEvent.click(screen.getByText("Published"));

    expect(screen.getByTestId("watched-value")).toHaveTextContent("true");
  });

  it("renders a read-only display instead of a widget for readonly fields", () => {
    const model = makeModel({
      fields: {
        ...articleFields,
        status: { ...articleFields.status, readonly: true },
      },
    });

    render(
      <FormHarness
        defaultValues={{ title: "", status: "published", is_published: false }}
      >
        <FormField formField={makeFormField("status")} model={model} />
      </FormHarness>,
    );

    expect(screen.getByText("published")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders a read-only display for fields in the studio's readonly_fields", () => {
    render(
      <FormHarness
        defaultValues={{
          title: "Hello",
          status: "draft",
          is_published: false,
          __readonly_fields__: ["title"],
        }}
      >
        <FormField formField={makeFormField("title")} model={makeModel()} />
      </FormHarness>,
    );

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("falls back to verbose_name for the label and renders help_text", () => {
    render(
      <FormHarness
        defaultValues={{ title: "Hello", status: "draft", is_published: false }}
      >
        <FormField formField={makeFormField("title")} model={makeModel()} />
      </FormHarness>,
    );

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("The title of the article.")).toBeInTheDocument();
  });

  it("prefers an explicit form field label over verbose_name", () => {
    render(
      <FormHarness
        defaultValues={{ title: "Hello", status: "draft", is_published: false }}
      >
        <FormField
          formField={makeFormField("title", { label: "Headline" })}
          model={makeModel()}
        />
      </FormHarness>,
    );

    expect(screen.getByText("Headline")).toBeInTheDocument();
    expect(screen.queryByText("Title")).not.toBeInTheDocument();
  });

  it("renders component-type fields via the LinkButton component", async () => {
    httpMock.get.mockResolvedValue({
      data: { url: "https://example.com/articles/abc-123" },
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <FormHarness
        defaultValues={{
          id: "abc-123",
          title: "",
          status: "draft",
          is_published: false,
        }}
      >
        <FormField
          formField={makeFormField("title", {
            type: "component",
            component_id: "0f1e2d3c",
            label: "View on site",
          })}
          model={makeModel()}
        />
      </FormHarness>,
    );

    await userEvent.click(screen.getByRole("button", { name: "View on site" }));

    expect(httpMock.get).toHaveBeenCalledWith(
      "/content/testapp.article/abc-123/components/0f1e2d3c",
    );
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/articles/abc-123",
      "_blank",
      "noopener",
    );
  });
});

describe("Link component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a Link as a text link that opens its URL", async () => {
    httpMock.get.mockResolvedValue({
      data: { url: "https://example.com/articles/abc-123" },
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <FormHarness
        defaultValues={{
          id: "abc-123",
          title: "",
          status: "draft",
          is_published: false,
        }}
      >
        <FormField
          formField={makeFormField("title", {
            type: "component",
            component_type: "Link",
            component_id: "1a2b3c4d",
            label: "Preview",
          })}
          model={makeModel()}
        />
      </FormHarness>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(httpMock.get).toHaveBeenCalledWith(
      "/content/testapp.article/abc-123/components/1a2b3c4d",
    );
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/articles/abc-123",
      "_blank",
      "noopener",
    );
  });

  it("renders nothing for an unsaved object", () => {
    render(
      <FormHarness
        defaultValues={{ title: "", status: "draft", is_published: false }}
      >
        <FormField
          formField={makeFormField("title", {
            type: "component",
            component_type: "Link",
            label: "Preview",
          })}
          model={makeModel()}
        />
      </FormHarness>,
    );

    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
  });
});

describe("FormSet", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAdminInfoMock.mockReturnValue({ data: adminInfo });
  });

  it("renders the form set, layout fields and skips hidden fields", () => {
    const formSet: IFormSet = {
      title: "Basics",
      description: "General information",
      fields: [
        makeFormField("title"),
        makeFormField("is_published"),
        { columns: 2, fields: [makeFormField("status")] },
      ],
    };

    render(
      <FormHarness
        defaultValues={{ title: "Hello", status: "draft", is_published: false }}
      >
        <FormSet
          formSet={formSet}
          model={makeModel()}
          hiddenFields={["is_published"]}
        />
      </FormHarness>,
    );

    expect(screen.getByText("Basics")).toBeInTheDocument();
    expect(screen.getByText("General information")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Hello")).toBeInTheDocument();
    expect(screen.getByDisplayValue("draft")).toBeInTheDocument();
    expect(screen.queryByText("Published")).not.toBeInTheDocument();
  });
});

describe("Main", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAdminInfoMock.mockReturnValue({ data: adminInfo });
    useDiscoverMock.mockReturnValue({
      data: makeDiscover([makeModel()]),
    });
  });

  it("renders a tab per labeled form set group and only the active group", () => {
    const model = makeModel({
      main: [
        {
          label: "General",
          formsets: [
            {
              title: "",
              description: "",
              fields: [makeFormField("title")],
            },
          ],
        },
        {
          label: "SEO",
          formsets: [
            {
              title: "",
              description: "",
              fields: [makeFormField("status")],
            },
          ],
        },
      ],
    });

    render(
      <FormHarness
        defaultValues={{ title: "", status: "draft", is_published: false }}
      >
        <Main model={model} id={null} hiddenFields={[]} />
      </FormHarness>,
    );

    expect(screen.getByRole("tab", { name: "General" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "SEO" })).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeVisible();
    // Radix only mounts the active tab's content: the SEO group is not
    // rendered until its tab is selected.
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
  });
});

describe("Inline", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAdminInfoMock.mockReturnValue({ data: adminInfo });
  });

  const imageModel = makeModel({
    label: "testapp.image",
    fields: {
      id: {
        type: FieldType.UUIDField,
        primary_key: true,
        readonly: true,
        verbose_name: "ID",
      },
      caption: {
        type: FieldType.CharField,
        verbose_name: "Caption",
        default: "",
      },
    },
  });

  it("loads rows through the inlines endpoint and renders table_display fields", async () => {
    httpMock.get.mockResolvedValue({
      data: {
        pagination: { count: 1, current: 1, pages: 1 },
        results: [
          {
            id: "img-1",
            caption: "Front page photo",
            __str__: "Front page photo",
          },
        ],
      },
    });

    renderWithQueryClient(
      <FormHarness
        defaultValues={{
          __str__: "Parent article",
          title: "",
          status: "draft",
          is_published: false,
        }}
      >
        <Inline
          relModel="testapp.article"
          relId="art-1"
          model={imageModel}
          adminModel={{
            fk_name: "article",
            table_display: [{ name: "caption", header: null, format: null }],
          }}
        />
      </FormHarness>,
    );

    expect(await screen.findByText("Front page photo")).toBeInTheDocument();
    expect(httpMock.get).toHaveBeenCalledWith(
      "/inlines/testapp.article/testapp.image",
      { params: { article_id: "art-1", page: 1 } },
    );
  });

  it("shows the empty state when the inline has no rows", async () => {
    httpMock.get.mockResolvedValue({
      data: {
        pagination: { count: 0, current: 1, pages: 1 },
        results: [],
      },
    });

    renderWithQueryClient(
      <FormHarness
        defaultValues={{
          __str__: "Parent article",
          title: "",
          status: "draft",
          is_published: false,
        }}
      >
        <Inline
          relModel="testapp.article"
          relId="art-1"
          model={imageModel}
          adminModel={{
            fk_name: "article",
            table_display: [{ name: "caption", header: null, format: null }],
          }}
        />
      </FormHarness>,
    );

    expect(await screen.findByText("editor.empty_state")).toBeInTheDocument();
  });
});

describe("Editor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAdminInfoMock.mockReturnValue({ data: adminInfo });
    useDiscoverMock.mockReturnValue({
      data: makeDiscover([makeModel()]),
    });
  });

  it("keeps field defaults on create, then saves via POST to the model endpoint", async () => {
    httpMock.post.mockResolvedValue({ data: {} });
    const onSave = vi.fn();
    const onClose = vi.fn();

    renderEditorPage(
      <Editor modelLabel="testapp.article" onSave={onSave} onClose={onClose} />,
    );

    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();

    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "Hello World");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "common.create" }));

    await waitFor(() =>
      expect(httpMock.post).toHaveBeenCalledWith(
        "/content/testapp.article",
        expect.objectContaining({ title: "Hello World", is_published: true }),
      ),
    );
    expect(httpMock.get).not.toHaveBeenCalled();
    expect(httpMock.put).not.toHaveBeenCalled();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("loads an existing resource via GET and saves it via PUT", async () => {
    httpMock.get.mockImplementation((url: string) =>
      url.endsWith("/activity")
        ? Promise.resolve({ data: [] })
        : Promise.resolve({
            data: {
              id: "abc-123",
              title: "Existing title",
              is_published: false,
              __str__: "Existing title",
            },
          }),
    );
    httpMock.put.mockResolvedValue({ data: {} });
    const onSave = vi.fn();

    renderEditorPage(
      <Editor
        modelLabel="testapp.article"
        id="abc-123"
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    expect(
      await screen.findByDisplayValue("Existing title"),
    ).toBeInTheDocument();
    expect(httpMock.get).toHaveBeenCalledWith(
      "/content/testapp.article/abc-123",
    );

    const user = userEvent.setup();
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Updated title");
    await user.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() =>
      expect(httpMock.put).toHaveBeenCalledWith(
        "/content/testapp.article/abc-123",
        expect.objectContaining({
          id: "abc-123",
          title: "Updated title",
        }),
      ),
    );
    expect(httpMock.post).not.toHaveBeenCalled();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it("applies the studio's readonly_fields on the create form", () => {
    useDiscoverMock.mockReturnValue({
      data: makeDiscover([makeModel({ readonlyFields: ["title"] })]),
    });

    renderEditorPage(
      <Editor
        modelLabel="testapp.article"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("applies the object's own read-only fields when editing", async () => {
    httpMock.get.mockImplementation((url: string) =>
      url.endsWith("/activity")
        ? Promise.resolve({ data: [] })
        : Promise.resolve({
            data: {
              id: "abc-123",
              title: "Fixed title",
              is_published: false,
              __str__: "Article 1",
              __readonly_fields__: ["title"],
            },
          }),
    );

    renderEditorPage(
      <Editor
        modelLabel="testapp.article"
        id="abc-123"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("Fixed title")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  describe("prepopulated fields", () => {
    const sluggedModel = () =>
      makeModel({
        fields: {
          ...articleFields,
          slug: {
            type: FieldType.CharField,
            verbose_name: "Slug",
            default: "",
            max_length: 12,
          },
        },
        main: [
          {
            label: "",
            formsets: [
              {
                title: "",
                description: "",
                fields: [makeFormField("title"), makeFormField("slug")],
              },
            ],
          },
        ],
        prepopulatedFields: { slug: ["title"] },
      });

    it("fills the field from its sources on the create form", async () => {
      useDiscoverMock.mockReturnValue({
        data: makeDiscover([sluggedModel()]),
      });

      renderEditorPage(
        <Editor
          modelLabel="testapp.article"
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const [title, slug] = screen.getAllByRole("textbox");
      await userEvent.setup().type(title, "Café au lait");

      // Cut to the field's max_length (12), without a trailing hyphen.
      await waitFor(() => expect(slug).toHaveValue("cafe-au-lait"));
    });

    it("stops following the sources once edited by hand", async () => {
      useDiscoverMock.mockReturnValue({
        data: makeDiscover([sluggedModel()]),
      });

      renderEditorPage(
        <Editor
          modelLabel="testapp.article"
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const user = userEvent.setup();
      const [title, slug] = screen.getAllByRole("textbox");
      await user.type(title, "First");
      await user.clear(slug);
      await user.type(slug, "custom");
      await user.type(title, " draft");

      expect(slug).toHaveValue("custom");
    });

    it("never prepopulates an existing object", async () => {
      useDiscoverMock.mockReturnValue({
        data: makeDiscover([sluggedModel()]),
      });
      httpMock.get.mockImplementation((url: string) =>
        url.endsWith("/activity")
          ? Promise.resolve({ data: [] })
          : Promise.resolve({
              data: {
                id: "abc-123",
                title: "Old",
                slug: "",
                __str__: "Article 1",
              },
            }),
      );

      renderEditorPage(
        <Editor
          modelLabel="testapp.article"
          id="abc-123"
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const title = await screen.findByDisplayValue("Old");
      await userEvent.setup().type(title, " news");

      expect(screen.getAllByRole("textbox")[1]).toHaveValue("");
    });
  });

  it("shows the object's activity when the sidebar declares the component", async () => {
    const activityField = {
      type: "component" as const,
      component_type: "ActivityLog" as const,
      component_id: "activity-1",
      name: "",
      label: null,
      readonly: false,
      col_span: 1,
      widget: null,
      copy: false,
      icon: "",
      title: "Recent activity",
    };
    const entries = [
      {
        id: "2",
        action_flag: 2 as const,
        action_time: new Date(Date.now() - 60_000).toISOString(),
        object_repr: "Existing title",
        object_id: "abc-123",
        object_model: "testapp.article",
        user: { id: "1", __str__: "admin" },
      },
      {
        id: "1",
        action_flag: 1 as const,
        action_time: new Date(Date.now() - 86_400_000).toISOString(),
        object_repr: "Existing title",
        object_id: "abc-123",
        object_model: "testapp.article",
        user: { id: "1", __str__: "admin" },
      },
    ];
    httpMock.get.mockImplementation((url: string) =>
      url.endsWith("/activity")
        ? Promise.resolve({ data: entries })
        : Promise.resolve({
            data: {
              id: "abc-123",
              title: "Existing title",
              is_published: false,
              __str__: "Existing title",
            },
          }),
    );

    useDiscoverMock.mockReturnValue({
      data: makeDiscover([
        makeModel({
          sidebar: [{ title: "", description: "", fields: [activityField] }],
        }),
      ]),
    });

    renderEditorPage(
      <Editor
        modelLabel="testapp.article"
        id="abc-123"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByDisplayValue("Existing title");
    expect(httpMock.get).toHaveBeenCalledWith(
      "/content/testapp.article/abc-123/activity",
    );

    // The component renders its configured title, and the entries in
    // order: the change flag translation key first, then the addition.
    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    const flags = await screen.findAllByText(
      /dashboard\.widgets\.activity_log\.action_flags\./,
    );
    expect(flags.map((flag) => flag.textContent)).toEqual([
      "dashboard.widgets.activity_log.action_flags.2",
      "dashboard.widgets.activity_log.action_flags.1",
    ]);
    expect(screen.getAllByText("admin")).toHaveLength(2);
    expect(screen.getAllByText(/ago$/)).toHaveLength(2);
  });

  it("renders no activity and fetches nothing without the component", async () => {
    httpMock.get.mockImplementation((url: string) =>
      url.endsWith("/activity")
        ? Promise.reject(new Error("should not fetch"))
        : Promise.resolve({
            data: {
              id: "abc-123",
              title: "Existing title",
              is_published: false,
              __str__: "Existing title",
            },
          }),
    );

    renderEditorPage(
      <Editor
        modelLabel="testapp.article"
        id="abc-123"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByDisplayValue("Existing title");
    expect(
      screen.queryByText(/dashboard\.widgets\.activity_log\.action_flags\./),
    ).not.toBeInTheDocument();
  });

  it("shows the trash delete confirmation for soft-delete models", async () => {
    useDiscoverMock.mockReturnValue({
      data: makeDiscover([makeModel({ list: { trash: true } })]),
    });
    httpMock.get.mockImplementation((url: string) =>
      url.endsWith("/activity")
        ? Promise.resolve({ data: [] })
        : Promise.resolve({
            data: {
              id: "abc-123",
              title: "Existing title",
              is_published: false,
              __str__: "Existing title",
            },
          }),
    );
    httpMock.delete.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    renderEditorPage(
      <ConfirmDialogProvider>
        <Editor
          modelLabel="testapp.article"
          id="abc-123"
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      </ConfirmDialogProvider>,
    );
    await screen.findByDisplayValue("Existing title");

    await user.click(
      screen.getByRole("button", { name: "editor.more_actions" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "common.delete" }),
    );

    // Soft delete is reversible; the message must not deny it.
    expect(
      await screen.findByText("common.delete_to_trash_confirm_description"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("common.delete_confirm_description"),
    ).not.toBeInTheDocument();
  });

  it("shows the irreversible delete confirmation without soft delete", async () => {
    httpMock.get.mockImplementation((url: string) =>
      url.endsWith("/activity")
        ? Promise.resolve({ data: [] })
        : Promise.resolve({
            data: {
              id: "abc-123",
              title: "Existing title",
              is_published: false,
              __str__: "Existing title",
            },
          }),
    );
    httpMock.delete.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    renderEditorPage(
      <ConfirmDialogProvider>
        <Editor
          modelLabel="testapp.article"
          id="abc-123"
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      </ConfirmDialogProvider>,
    );
    await screen.findByDisplayValue("Existing title");

    await user.click(
      screen.getByRole("button", { name: "editor.more_actions" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "common.delete" }),
    );

    expect(
      await screen.findByText("common.delete_confirm_description"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("common.delete_to_trash_confirm_description"),
    ).not.toBeInTheDocument();
  });

  it("maps 400 field errors to the form and shows an error toast", async () => {
    httpMock.post.mockRejectedValue(
      new AxiosError(
        "Request failed with status code 400",
        AxiosError.ERR_BAD_REQUEST,
        undefined,
        null,
        {
          status: 400,
          data: { title: ["An article with this title already exists."] },
        } as unknown as AxiosResponse<Record<string, string[]>>,
      ),
    );
    const onSave = vi.fn();

    renderEditorPage(
      <Editor modelLabel="testapp.article" onSave={onSave} onClose={vi.fn()} />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "Duplicate");
    await user.click(screen.getByRole("button", { name: "common.create" }));

    expect(
      await screen.findByText("An article with this title already exists."),
    ).toBeInTheDocument();
    expect(screen.getByText("Title")).toHaveAttribute("data-error", "true");
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(httpMock.put).not.toHaveBeenCalled();
  });
});

describe("Editor navigation guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAdminInfoMock.mockReturnValue({ data: adminInfo });
    useDiscoverMock.mockReturnValue({
      data: makeDiscover([makeModel()]),
    });
  });

  it("blocks leaving a dirty form until confirmed, then proceeds", async () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <>
            <Editor
              modelLabel="testapp.article"
              onSave={vi.fn()}
              onClose={vi.fn()}
            />
            <Link to="/away">Leave</Link>
          </>
        ),
      },
      { path: "/away", element: <div>Away page</div> },
    ]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ConfirmDialogProvider>
          <RouterProvider router={router} />
        </ConfirmDialogProvider>
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox"), "Hello World");

    // Leaving with unsaved changes opens the confirm dialog...
    await user.click(screen.getByText("Leave"));
    expect(await screen.findByText("editor.unsaved_alert")).toBeVisible();
    expect(screen.queryByText("Away page")).not.toBeInTheDocument();

    // ...and confirming performs the navigation.
    await user.click(screen.getByText("common.continue"));
    expect(await screen.findByText("Away page")).toBeInTheDocument();
  });

  it("lets a pristine form navigate away without prompting", async () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <>
            <Editor
              modelLabel="testapp.article"
              onSave={vi.fn()}
              onClose={vi.fn()}
            />
            <Link to="/away">Leave</Link>
          </>
        ),
      },
      { path: "/away", element: <div>Away page</div> },
    ]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ConfirmDialogProvider>
          <RouterProvider router={router} />
        </ConfirmDialogProvider>
      </QueryClientProvider>,
    );

    const user = userEvent.setup();

    await user.click(screen.getByText("Leave"));
    expect(await screen.findByText("Away page")).toBeInTheDocument();
    expect(screen.queryByText("editor.unsaved_alert")).not.toBeInTheDocument();
  });
});

describe("Editor save navigation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAdminInfoMock.mockReturnValue({ data: adminInfo });
    useDiscoverMock.mockReturnValue({
      data: makeDiscover([makeModel()]),
    });
  });

  it("lets the navigation a create triggers pass without prompting", async () => {
    // The page navigates to the created object's route; the save resets
    // the form in the same tick, before React re-renders the (now
    // pristine) dirty state the blocker reads.
    httpMock.post.mockResolvedValue({
      data: { id: "new-1", title: "Hello World", is_published: true },
    });

    function EditorPage() {
      const navigate = useNavigate();

      return (
        <Editor
          modelLabel="testapp.article"
          onCreated={(id) => navigate(`/content/testapp.article/${id}`)}
          onClose={vi.fn()}
        />
      );
    }

    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <>
            <EditorPage />
            <Link to="/away">Leave</Link>
          </>
        ),
      },
      { path: "/content/testapp.article/:id", element: <div>Object page</div> },
      { path: "/away", element: <div>Away page</div> },
    ]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ConfirmDialogProvider>
          <RouterProvider router={router} />
        </ConfirmDialogProvider>
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox"), "Hello World");
    await user.click(screen.getByRole("button", { name: "common.create" }));

    expect(await screen.findByText("Object page")).toBeInTheDocument();
    expect(screen.queryByText("editor.unsaved_alert")).not.toBeInTheDocument();
  });
});
