import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FormatRenderer } from "@/components/formats/renderer";
import { RadioButtonWidget } from "@/components/widgets/radio-button-widget";
import { formatFieldNumber, toNumber } from "@/lib/format-number";
import { htmlToText, isSafeHref } from "@/lib/html";
import {
  FieldFormat,
  FieldType,
  type FormatConfig,
  type ModelField,
} from "@/types";

const useAdminInfoMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: useAdminInfoMock,
}));

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: () => ({ data: undefined }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      key === "formats.more" ? `+${options?.count}` : key,
    i18n: { language: "en" },
  }),
}));

function renderFormat(
  value: unknown,
  format: FieldFormat,
  options?: Record<string, unknown>,
  field: ModelField = { type: FieldType.CharField },
  display?: "cell" | "field",
) {
  const config: FormatConfig = { name: format, options };

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
});

describe("formatFieldNumber", () => {
  it.each([
    [45940, {}, "45,940"],
    [0, {}, "0"],
    [12.345, {}, "12.35"],
    [12, { decimals: 2 }, "12.00"],
    [45940, { compact: true }, "45.9K"],
    [1250, { style: "currency", currency: "EUR" }, "€1,250.00"],
    [1250, { style: "currency", currency: "EUR", decimals: 0 }, "€1,250"],
    [91, { style: "percent" }, "91%"],
    [0.915, { style: "percent", fraction: true }, "91.5%"],
  ] as const)("shows %s with %o as %s", (value, options, expected) => {
    expect(formatFieldNumber(value, { ...options, locale: "en" })).toBe(
      expected,
    );
  });

  it("follows the locale", () => {
    expect(formatFieldNumber(45940.5, { locale: "nl" })).toBe("45.940,5");
  });

  it("reads decimals sent as strings", () => {
    expect(toNumber("12.50")).toBe(12.5);
    expect(toNumber("")).toBeNull();
    expect(toNumber("abc")).toBeNull();
  });
});

describe("number formats", () => {
  it("shows 0 instead of an empty cell", () => {
    renderFormat(0, FieldFormat.NumberFormat);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows the exact value on hover when compact", () => {
    renderFormat(45940, FieldFormat.NumberFormat, { compact: true });
    expect(screen.getByText("45.9K").closest("span")).toHaveAttribute(
      "title",
      "45,940",
    );
  });

  it("shows a prefix and suffix around the number", () => {
    const { container } = renderFormat(12, FieldFormat.NumberFormat, {
      suffix: "km",
    });
    expect(container).toHaveTextContent("12km");
    expect(screen.getByText("km")).toHaveClass("text-muted-foreground");
  });

  it("shows currencies and percentages", () => {
    renderFormat("1250.00", FieldFormat.CurrencyFormat, { currency: "EUR" });
    expect(screen.getByText("€1,250.00")).toBeInTheDocument();

    renderFormat(91, FieldFormat.PercentFormat);
    expect(screen.getByText("91%")).toBeInTheDocument();
  });
});

describe("TextFormat", () => {
  it("shows 0 and false as values", () => {
    renderFormat(0, FieldFormat.TextFormat);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("chip formats", () => {
  it("shows the first three tags, then +N with the rest on hover", () => {
    renderFormat(["a", "b", "c", "d", "e"], FieldFormat.TagFormat);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("c")).toBeInTheDocument();
    expect(screen.queryByText("d")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toHaveAttribute("title", "d, e");
  });

  it("shows related objects by their label", () => {
    renderFormat(
      [
        { id: 1, __str__: "News" },
        { id: 2, __str__: "Sports" },
      ],
      FieldFormat.ManyToManyFormat,
      undefined,
      { type: FieldType.ManyToManyField },
    );
    expect(screen.getByText("News")).toBeInTheDocument();
    expect(screen.getByText("Sports")).toBeInTheDocument();
  });

  it("stacks the first three media thumbnails", () => {
    const item = (id: string) => ({
      id,
      type: "image",
      thumbnail: `/${id}.webp`,
    });
    const { container } = renderFormat(
      ["1", "2", "3", "4"].map(item),
      FieldFormat.ManyMediaFormat,
    );
    expect(container.querySelectorAll("img")).toHaveLength(3);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});

describe("BadgeFormat", () => {
  const field: ModelField = {
    type: FieldType.CharField,
    choices: [
      ["draft", "Draft"],
      ["published", "Published"],
    ],
  };

  it("shows the choice's label in its color", () => {
    renderFormat(
      "published",
      FieldFormat.BadgeFormat,
      { colors: { published: "green" }, default_color: "gray" },
      field,
    );
    expect(screen.getByText("Published")).toHaveClass("bg-green-100");
  });

  it("gives other values the default color", () => {
    renderFormat(
      "draft",
      FieldFormat.BadgeFormat,
      { colors: { published: "green" }, default_color: "yellow" },
      field,
    );
    expect(screen.getByText("Draft")).toHaveClass("bg-amber-100");
  });

  it("matches integer choices by their string form", () => {
    renderFormat(
      2,
      FieldFormat.BadgeFormat,
      { colors: { "2": "red" } },
      {
        type: FieldType.IntegerField,
        choices: [[2 as unknown as string, "High"]],
      },
    );
    expect(screen.getByText("High")).toHaveClass("bg-red-100");
  });
});

describe("link formats", () => {
  it("links a URL in a new tab, without its scheme", () => {
    renderFormat("https://example.com/about/", FieldFormat.LinkFormat);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/about/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveTextContent("example.com/about");
  });

  it("does not link unsafe URLs", () => {
    renderFormat("javascript:alert(1)", FieldFormat.LinkFormat);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps a click on the link from opening the row", () => {
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <FormatRenderer
          value="ada@example.com"
          format={{ name: FieldFormat.EmailFormat }}
        />
      </div>,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "mailto:ada@example.com");
    fireEvent.click(link);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe("date formats", () => {
  it("shows a date in the given style", () => {
    renderFormat("2026-10-09", FieldFormat.DateFormat, { style: "long" });
    expect(screen.getByText("October 9, 2026")).toBeInTheDocument();
  });

  it("shows a datetime relative to now, with the exact time on hover", () => {
    const { container } = renderFormat(
      new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      FieldFormat.DateTimeFormat,
      { relative: true, style: "medium" },
    );
    const time = container.querySelector("time");
    expect(time).toHaveTextContent("3 hours ago");
    expect(time?.getAttribute("title")).toMatch(/\d{4}/);
  });

  it("shows a datetime in full when relative is off", () => {
    const { container } = renderFormat(
      "2026-10-09T12:30:00",
      FieldFormat.DateTimeFormat,
      { relative: false, style: "short" },
    );
    expect(container.querySelector("time")).toHaveTextContent("10/9/26");
  });
});

describe("HtmlFormat", () => {
  const html =
    '<p>Hello <strong>world</strong></p><p><a href="javascript:x()">bad</a> <a href="https://example.com">good</a></p><script>alert(1)</script>';

  it("shows a plain-text excerpt in a cell", () => {
    const { container } = renderFormat(html, FieldFormat.HtmlFormat);
    expect(container).toHaveTextContent("Hello world bad good");
    expect(container.querySelector("strong")).toBeNull();
  });

  it("renders safe formatting in a read-only field", () => {
    const { container } = renderFormat(
      html,
      FieldFormat.HtmlFormat,
      undefined,
      { type: FieldType.HTMLField },
      "field",
    );
    expect(container.querySelector("strong")).toHaveTextContent("world");
    expect(container.querySelector("script")).toBeNull();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://example.com");
    expect(container).toHaveTextContent("bad");
  });

  it("reads text and hrefs safely", () => {
    expect(htmlToText("<p>One</p><p>Two</p>")).toBe("One Two");
    expect(isSafeHref("/docs")).toBe(true);
    expect(isSafeHref("mailto:a@b.c")).toBe(true);
    expect(isSafeHref("JavaScript:alert(1)")).toBe(false);
    expect(isSafeHref("//evil.example")).toBe(false);
  });
});

describe("RadioButtonWidget", () => {
  const field: ModelField = {
    type: FieldType.IntegerField,
    required: false,
    choices: [
      [1 as unknown as string, "Low"],
      [2 as unknown as string, "High"],
    ],
  };

  it("checks the value's choice and keeps the choice's type", () => {
    const onChange = vi.fn();
    render(<RadioButtonWidget field={field} value={1} onChange={onChange} />);

    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "High" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("clears an optional field", () => {
    const onChange = vi.fn();
    render(<RadioButtonWidget field={field} value={1} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "common.clear" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("cannot clear a required field", () => {
    render(
      <RadioButtonWidget
        field={{ ...field, required: true }}
        value={1}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
