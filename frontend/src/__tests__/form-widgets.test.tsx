import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DurationWidget } from "@/components/widgets/duration-widget";
import { FileWidget } from "@/components/widgets/file-widget";
import { InputWidget } from "@/components/widgets/input-widget";
import { PasswordWidget } from "@/components/widgets/password-widget";
import { SliderWidget } from "@/components/widgets/slider-widget";
import { TextAreaWidget } from "@/components/widgets/text-area-widget";
import {
  EmailWidget,
  PhoneWidget,
  URLWidget,
} from "@/components/widgets/typed-input-widgets";
import { showsCount } from "@/lib/character-count";
import { formatDuration, parseDuration } from "@/lib/duration";
import {
  FieldType,
  type FileValue,
  type Model,
  type ModelField,
  type WriteOnlyValue,
} from "@/types";

const httpMock = vi.hoisted(() => ({ postForm: vi.fn() }));

vi.mock("@/hooks/use-http", () => ({ useHttp: () => httpMock }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

beforeEach(() => {
  httpMock.postForm.mockReset();
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
  const [value, setValue] = useState<T>(initial);

  return children(value, (next) => {
    setValue(next);
    onChange?.(next);
  });
}

describe("character counter", () => {
  it("shows near the limit unless show_count says otherwise", () => {
    expect(showsCount(47, 60, {})).toBe(false);
    expect(showsCount(48, 60, {})).toBe(true);
    expect(showsCount(40, 60, { recommended_length: 50 })).toBe(true);
    expect(showsCount(0, undefined, {})).toBe(false);
    expect(showsCount(0, undefined, { show_count: true })).toBe(true);
    expect(showsCount(60, 60, { show_count: false })).toBe(false);
  });

  it("counts against the recommended length and warns past it", () => {
    const field: ModelField = { type: FieldType.CharField, max_length: 10 };
    const { rerender } = render(
      <InputWidget
        field={field}
        value="1234567"
        onChange={vi.fn()}
        options={{ recommended_length: 6 }}
      />,
    );

    expect(screen.getByTestId("character-count")).toHaveTextContent("7 / 6");
    expect(screen.getByTestId("character-count")).toHaveClass("text-warning");

    rerender(
      <InputWidget field={field} value="12345678901" onChange={vi.fn()} />,
    );
    expect(screen.getByTestId("character-count")).toHaveTextContent("11 / 10");
    expect(screen.getByTestId("character-count")).toHaveClass(
      "text-destructive",
    );
  });

  it("is hidden far from the limit and on number inputs", () => {
    const field: ModelField = { type: FieldType.CharField, max_length: 100 };
    render(<TextAreaWidget field={field} value="short" onChange={vi.fn()} />);
    expect(screen.queryByTestId("character-count")).not.toBeInTheDocument();
  });

  it("counts characters, not UTF-16 units", () => {
    render(
      <InputWidget
        value="🎉🎉"
        onChange={vi.fn()}
        options={{ show_count: true }}
      />,
    );
    expect(screen.getByTestId("character-count")).toHaveTextContent("2");
  });
});

describe("EmailWidget, URLWidget and PhoneWidget", () => {
  it("links an email address", () => {
    render(<EmailWidget value="ed@example.com" onChange={vi.fn()} />);

    expect(screen.getByRole("textbox")).toHaveAttribute("type", "email");
    expect(
      screen.getByRole("link", { name: "widgets.email_widget.send" }),
    ).toHaveAttribute("href", "mailto:ed@example.com");
  });

  it("opens a web address, never another scheme", () => {
    const { rerender } = render(
      <URLWidget value="https://example.com" onChange={vi.fn()} />,
    );
    expect(
      screen.getByRole("link", { name: "widgets.url_widget.open" }),
    ).toHaveAttribute("href", "https://example.com");

    rerender(<URLWidget value="javascript:alert(1)" onChange={vi.fn()} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("asks phones for the number pad", () => {
    render(<PhoneWidget value="" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("type", "tel");
  });
});

describe("PasswordWidget", () => {
  it("masks the value until shown", async () => {
    const { container } = render(
      <PasswordWidget value="s3cr3t" onChange={vi.fn()} />,
    );
    const input = container.querySelector("input")!;

    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "new-password");

    await userEvent.click(
      screen.getByRole("button", { name: "widgets.password_widget.show" }),
    );
    expect(input).toHaveAttribute("type", "text");
  });

  it("with write_only, replaces the saved value or keeps it", async () => {
    const saved: WriteOnlyValue = { is_set: true };
    const onChange = vi.fn();
    const { container } = render(
      <Controlled<string | WriteOnlyValue | null>
        initial={saved}
        onChange={onChange}
      >
        {(value, setValue) => (
          <PasswordWidget
            value={value}
            onChange={setValue}
            options={{ write_only: true }}
          />
        )}
      </Controlled>,
    );
    const input = container.querySelector("input")!;

    expect(input).toHaveValue("");
    expect(input).toHaveAttribute(
      "placeholder",
      "widgets.password_widget.saved",
    );

    await userEvent.type(input, "n");
    expect(onChange).toHaveBeenLastCalledWith("n");

    // Emptying the box keeps the saved value.
    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(saved);

    await userEvent.click(screen.getByRole("button", { name: "common.clear" }));
    expect(onChange).toHaveBeenLastCalledWith("");

    await userEvent.click(
      screen.getByRole("button", { name: "widgets.password_widget.undo" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(saved);
  });

  it("offers no Clear for a required field", () => {
    render(
      <PasswordWidget
        field={{ type: FieldType.CharField, required: true }}
        value={{ is_set: true }}
        onChange={vi.fn()}
        options={{ write_only: true }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "common.clear" }),
    ).not.toBeInTheDocument();
  });
});

describe("SliderWidget", () => {
  const options = { min_value: 0, max_value: 10, step: 0.5, suffix: "km" };

  it("shows the value and moves by a step", () => {
    const onChange = vi.fn();
    render(<SliderWidget value={2} onChange={onChange} options={options} />);

    expect(screen.getByRole("status")).toHaveTextContent("2.0km");

    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(2.5);
  });

  it("keeps a DecimalField's value a string, and clears", async () => {
    const onChange = vi.fn();
    render(
      <SliderWidget
        field={{ type: FieldType.DecimalField }}
        value="2.0"
        onChange={onChange}
        options={options}
      />,
    );

    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("1.5");

    await userEvent.click(screen.getByRole("button", { name: "common.clear" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe("DurationWidget", () => {
  it("reads and writes Django's duration format", () => {
    expect(parseDuration("1 02:30:05.500000", true)).toEqual({
      days: "1",
      hours: "2",
      minutes: "30",
      seconds: "05",
    });
    expect(parseDuration("1 02:30:05", false)?.hours).toBe("26");
    expect(parseDuration("", false)).toBeNull();

    expect(
      formatDuration({ days: "", hours: "26", minutes: "", seconds: "" }),
    ).toBe("1 02:00:00");
    expect(
      formatDuration({ days: "", hours: "", minutes: "90", seconds: "" }),
    ).toBe("01:30:00");
    expect(
      formatDuration({ days: "", hours: "", minutes: "", seconds: "" }),
    ).toBeNull();
  });

  it("edits hours and minutes in their own boxes", async () => {
    const onChange = vi.fn();
    render(
      <Controlled<string | null> initial="1:30:00" onChange={onChange}>
        {(value, setValue) => (
          <DurationWidget
            value={value}
            onChange={setValue}
            options={{ show_seconds: false }}
          />
        )}
      </Controlled>,
    );
    const [hours, minutes] = screen.getAllByRole("textbox");

    expect(hours).toHaveValue("1");
    expect(minutes).toHaveValue("30");
    expect(screen.getAllByRole("textbox")).toHaveLength(2);

    await userEvent.clear(minutes);
    await userEvent.type(minutes, "5");
    expect(minutes).toHaveValue("5");
    expect(onChange).toHaveBeenLastCalledWith("01:05:00");

    await userEvent.clear(hours);
    await userEvent.clear(minutes);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe("FileWidget", () => {
  const model = { label: "shop.product" } as Model;
  const field: ModelField = { type: FieldType.FileField, required: false };

  function renderWidget(
    initial: FileValue,
    overrides: Partial<ModelField> = {},
  ) {
    const onChange = vi.fn();
    render(
      <Controlled<FileValue> initial={initial} onChange={onChange}>
        {(value, setValue) => (
          <FileWidget
            field={{ ...field, ...overrides }}
            model={model}
            name="manual"
            value={value}
            onChange={setValue}
          />
        )}
      </Controlled>,
    );
    return onChange;
  }

  it("uploads a picked file and attaches it on save", async () => {
    const picked = { upload: "token", name: "manual.pdf", size: 2048 };
    httpMock.postForm.mockResolvedValue({ data: picked });
    const onChange = renderWidget({ name: "old.pdf", url: "/media/old.pdf" });

    expect(screen.getByRole("link", { name: "old.pdf" })).toHaveAttribute(
      "href",
      "/media/old.pdf",
    );

    const file = new File(["pdf"], "manual.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByTestId("file-input"), file);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(picked));
    expect(httpMock.postForm).toHaveBeenCalledWith(
      "/content/shop.product/uploads/manual",
      { file },
      expect.anything(),
    );
    expect(
      screen.getByText(/widgets.file_widget.attached_on_save/),
    ).toBeInTheDocument();

    // Going back to the saved file.
    await userEvent.click(
      screen.getByRole("button", { name: /widgets.file_widget.keep_saved/ }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      name: "old.pdf",
      url: "/media/old.pdf",
    });
  });

  it("removes the file on save, with undo", async () => {
    const onChange = renderWidget({ name: "old.pdf", url: "/media/old.pdf" });

    await userEvent.click(
      screen.getByRole("button", { name: "widgets.file_widget.remove" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(
      screen.getByText("widgets.file_widget.removed_on_save"),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /widgets.file_widget.undo/ }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      name: "old.pdf",
      url: "/media/old.pdf",
    });
  });

  it("keeps a required field's file", () => {
    renderWidget(
      { name: "old.pdf", url: "/media/old.pdf" },
      { required: true },
    );
    expect(
      screen.queryByRole("button", { name: "widgets.file_widget.remove" }),
    ).not.toBeInTheDocument();
  });

  it("shows why an upload was refused", async () => {
    httpMock.postForm.mockRejectedValue({
      response: { data: { file: ["The file is larger than 50 MB."] } },
    });
    const onChange = renderWidget(null);

    const file = new File(["pdf"], "big.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByTestId("file-input"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The file is larger than 50 MB.",
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
