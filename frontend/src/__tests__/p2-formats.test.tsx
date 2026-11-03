import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FormatRenderer } from "@/components/formats/renderer";
import { formatDuration, parseDurationSeconds } from "@/lib/format-duration";
import {
  FieldFormat,
  FieldType,
  type FormatConfig,
  type ModelField,
} from "@/types";

const useAdminInfoMock = vi.hoisted(() => vi.fn());
const copyMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: useAdminInfoMock,
}));

vi.mock("react-use", () => ({
  useCopyToClipboard: () => [{}, copyMock],
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

function renderFormat(
  value: unknown,
  format: FieldFormat | null,
  options?: Record<string, unknown>,
  field: ModelField = { type: FieldType.CharField },
  display?: "cell" | "field",
) {
  const config: FormatConfig | null = format ? { name: format, options } : null;

  return render(
    <FormatRenderer
      value={value}
      field={field}
      format={config}
      display={display}
    />,
  );
}

beforeEach(() => {
  useAdminInfoMock.mockReturnValue({ data: { formats: {} } });
  copyMock.mockReset();
});

describe("TextFormat options", () => {
  const long = "A headline that is too long for its column";

  it("cuts at max_length, with the full text on hover", () => {
    renderFormat(long, FieldFormat.TextFormat, { max_length: 10 });

    const text = screen.getByText("A headline…");
    expect(text).toHaveAttribute("title", long);
  });

  it("clamps to lines", () => {
    renderFormat(long, FieldFormat.TextFormat, { lines: 2 });

    const text = screen.getByText(long);
    expect(text).toHaveClass("line-clamp-(--lines)");
    expect(text).toHaveAttribute("title", long);
  });

  it("shows the whole text in a read-only field", () => {
    renderFormat(
      long,
      FieldFormat.TextFormat,
      { max_length: 10 },
      { type: FieldType.CharField },
      "field",
    );
    expect(screen.getByText(long)).not.toHaveAttribute("title");
  });

  it("clamps TextField columns by their default format", () => {
    useAdminInfoMock.mockReturnValue({
      data: {
        formats: {
          TextField: { name: FieldFormat.TextFormat, options: { lines: 2 } },
        },
      },
    });
    renderFormat(long, null, undefined, { type: FieldType.TextField });
    expect(screen.getByText(long)).toHaveClass("line-clamp-(--lines)");
  });
});

describe("ProgressFormat", () => {
  it("fills the meter against max_value", () => {
    renderFormat(30, FieldFormat.ProgressFormat, { max_value: 60 });

    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuemax", "60");
    expect(meter.firstElementChild).toHaveStyle({ width: "50%" });
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("clamps values outside the range", () => {
    renderFormat(150, FieldFormat.ProgressFormat);
    expect(screen.getByRole("meter").firstElementChild).toHaveStyle({
      width: "100%",
    });
  });
});

describe("DurationFormat", () => {
  it("reads Django's duration strings", () => {
    expect(parseDurationSeconds("1:20:00")).toBe(4800);
    expect(parseDurationSeconds("1 02:00:00.500000")).toBe(93600);
    expect(parseDurationSeconds("-1 23:00:00")).toBe(-3600);
    expect(parseDurationSeconds("soon")).toBeNull();
  });

  it("writes them in words", () => {
    expect(formatDuration(4800, { locale: "en" })).toBe("1h 20m");
    expect(formatDuration(4800, { style: "long", locale: "en" })).toBe(
      "1 hour, 20 minutes",
    );
    expect(formatDuration(0, { locale: "en" })).toBe("0m");
    expect(formatDuration(-3600, { locale: "en" })).toBe("-1h");
  });

  it("renders a field's value", () => {
    renderFormat("1 02:20:00", FieldFormat.DurationFormat, undefined, {
      type: FieldType.DurationField,
    });
    expect(screen.getByText("1d 2h 20m")).toBeInTheDocument();
  });
});

describe("ImageFormat", () => {
  it("shows the thumbnail, linked to the image", () => {
    renderFormat(
      { name: "logo.png", url: "/media/logo.png", thumbnail: "/media/t.webp" },
      FieldFormat.ImageFormat,
    );

    expect(screen.getByRole("img", { name: "logo.png" })).toHaveAttribute(
      "src",
      "/media/t.webp",
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/media/logo.png");
  });

  it("falls back to the image without a thumbnail", () => {
    renderFormat(
      { name: "logo.png", url: "/media/logo.png", thumbnail: null },
      FieldFormat.ImageFormat,
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", "/media/logo.png");
  });

  it("never loads an unsafe URL", () => {
    renderFormat(
      { name: "x.png", url: "javascript:alert(1)", thumbnail: null },
      FieldFormat.ImageFormat,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("x.png")).toBeInTheDocument();
  });
});

describe("CodeFormat", () => {
  it("copies the value without opening the row", () => {
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <FormatRenderer
          value="SKU-123"
          field={{ type: FieldType.CharField }}
          format={{ name: FieldFormat.CodeFormat }}
        />
      </div>,
    );

    expect(screen.getByText("SKU-123").tagName).toBe("CODE");
    fireEvent.click(screen.getByRole("button", { name: "formats.copy" }));

    expect(copyMock).toHaveBeenCalledWith("SKU-123");
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe("BooleanFormat labels", () => {
  it("shows words, the false one muted", () => {
    renderFormat(false, FieldFormat.BooleanFormat, { labels: ["Yes", "No"] });
    expect(screen.getByText("No")).toHaveClass("text-muted-foreground");
  });

  it("shows badges with colors", () => {
    renderFormat(true, FieldFormat.BooleanFormat, {
      labels: ["In stock", "Sold out"],
      colors: ["green", "red"],
    });
    expect(screen.getByText("In stock")).toHaveClass("bg-green-100");
  });
});
