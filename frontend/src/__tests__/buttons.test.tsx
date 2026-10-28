import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialogProvider } from "@/components/confirm-dialog-provider";
import { ComponentButton } from "@/components/form-components/button";
import { Form } from "@/components/ui/form";
import { ValueDialogProvider } from "@/components/value-dialog-provider";
import type { FormField, Model } from "@/types";

const httpMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/hooks/use-http", () => ({ useHttp: () => httpMock }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const model = {
  label: "testapp.article",
  admin: { is_singleton: false },
} as unknown as Model;

const STATE = "/content/testapp.article/abc-123/components/0f1e2d3c";

function makeButton(overrides: Partial<FormField> = {}): FormField {
  return {
    type: "component",
    name: "",
    label: "Publish",
    readonly: false,
    col_span: 1,
    widget: null,
    component_id: "0f1e2d3c",
    component_type: "Button",
    copy: false,
    icon: "",
    confirm: null,
    destructive: false,
    ...overrides,
  };
}

function Harness({ id, children }: { id: string | null; children: ReactNode }) {
  const form = useForm({ defaultValues: { id } });

  return <Form {...form}>{children}</Form>;
}

function TitleProbe() {
  const title = useWatch({ name: "title" }) as string | undefined;

  return <span data-testid="title">{title ?? ""}</span>;
}

function renderButton(
  formField: FormField,
  id: string | null = "abc-123",
  extra: ReactNode = null,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ConfirmDialogProvider>
        <ValueDialogProvider>
          <Harness id={id}>
            <ComponentButton model={model} formField={formField} />
            {extra}
          </Harness>
        </ValueDialogProvider>
      </ConfirmDialogProvider>
    </QueryClientProvider>,
  );
}

describe("Button component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    httpMock.get.mockResolvedValue({ data: { visible: true } });
  });

  it("runs on the server and shows the message", async () => {
    httpMock.post.mockResolvedValue({
      data: { message: "Published.", value: null },
    });

    renderButton(makeButton());
    await userEvent.click(
      await screen.findByRole("button", { name: "Publish" }),
    );

    expect(httpMock.get).toHaveBeenCalledWith(STATE);
    expect(httpMock.post).toHaveBeenCalledWith(`${STATE}/run`);
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Published."),
    );
  });

  it("reloads the form with the object's new values", async () => {
    httpMock.get.mockImplementation((url: string) =>
      Promise.resolve({
        data:
          url === STATE ? { visible: true } : { id: "abc-123", title: "New" },
      }),
    );
    httpMock.post.mockResolvedValue({ data: { message: null, value: null } });

    renderButton(makeButton(), "abc-123", <TitleProbe />);
    expect(screen.getByTestId("title")).toHaveTextContent("");

    await userEvent.click(
      await screen.findByRole("button", { name: "Publish" }),
    );

    expect(httpMock.get).toHaveBeenCalledWith(
      "/content/testapp.article/abc-123",
    );
    await waitFor(() =>
      expect(screen.getByTestId("title")).toHaveTextContent("New"),
    );
  });

  it("asks for confirmation first", async () => {
    httpMock.post.mockResolvedValue({ data: { message: null, value: null } });
    const user = userEvent.setup();

    renderButton(makeButton({ confirm: "Publish this article?" }));
    await user.click(await screen.findByRole("button", { name: "Publish" }));

    expect(
      await screen.findByText("Publish this article?"),
    ).toBeInTheDocument();
    expect(httpMock.post).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "common.continue" }));

    await waitFor(() => expect(httpMock.post).toHaveBeenCalled());
    expect(toastMock.success).toHaveBeenCalledWith("button.done");
  });

  it("shows a returned value once", async () => {
    httpMock.post.mockResolvedValue({
      data: { message: "A new secret.", value: "s3cr3t" },
    });
    const user = userEvent.setup();

    renderButton(makeButton({ label: "Regenerate secret" }));
    await user.click(
      await screen.findByRole("button", { name: "Regenerate secret" }),
    );

    expect(await screen.findByText("s3cr3t")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "button.close" }));

    await waitFor(() =>
      expect(screen.queryByText("s3cr3t")).not.toBeInTheDocument(),
    );
  });

  it("hides when the server says so, and on unsaved objects", async () => {
    httpMock.get.mockResolvedValue({ data: { visible: false } });

    const { unmount } = renderButton(makeButton());
    await waitFor(() => expect(httpMock.get).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    unmount();

    httpMock.get.mockClear();
    renderButton(makeButton(), null);
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(httpMock.get).not.toHaveBeenCalled();
  });

  it("reports a failure", async () => {
    httpMock.post.mockRejectedValue(new Error("Forbidden"));

    renderButton(makeButton());
    await userEvent.click(
      await screen.findByRole("button", { name: "Publish" }),
    );

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
  });
});
