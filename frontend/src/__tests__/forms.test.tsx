import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import type { ReactElement, ReactNode } from "react";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Editor } from "@/components/content-editor/editor";
import { FormField } from "@/components/content-editor/form-field";
import { FormSet } from "@/components/content-editor/form-set";
import { Inline } from "@/components/content-editor/inline";
import { Main } from "@/components/content-editor/main";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
  } = {},
): Model {
  return {
    label: overrides.label ?? "testapp.article",
    verbose_name: "Article",
    verbose_name_plural: "Articles",
    tenant_field: null,
    admin: {
      is_singleton: false,
      format_mapping: {},
      widget_mapping: {},
      icon: null,
      list: {
        per_page: 10,
        description: "",
        display: [],
        search: false,
        filter: [],
        sortable_by: null,
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
        sidebar: [],
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

// The editor's Header renders a Radix DialogTitle, which only mounts inside
// a Dialog — the same context it is used in within Inline and the studio
// pages.
function renderEditorInDialog(ui: ReactElement) {
  return renderWithQueryClient(
    <Dialog open onOpenChange={() => {}}>
      <DialogContent showCloseButton={false}>{ui}</DialogContent>
    </Dialog>,
  );
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

  it("loads rows through the inlines endpoint and renders list_display fields", async () => {
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
          adminModel={{ fk_name: "article", list_display: ["caption"] }}
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
          adminModel={{ fk_name: "article", list_display: ["caption"] }}
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

    renderEditorInDialog(
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
    httpMock.get.mockResolvedValue({
      data: {
        id: "abc-123",
        title: "Existing title",
        is_published: false,
        __str__: "Existing title",
      },
    });
    httpMock.put.mockResolvedValue({ data: {} });
    const onSave = vi.fn();

    renderEditorInDialog(
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

    renderEditorInDialog(
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
