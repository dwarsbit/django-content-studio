import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import { type ReactNode, useState } from "react";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SEOPreview } from "@/components/form-components/seo-preview";
import { Form } from "@/components/ui/form";
import { EmbedWidget } from "@/components/widgets/embed-widget";
import { MapWidget } from "@/components/widgets/map-widget";
import {
  formatCoordinate,
  locationOf,
  parseLatitude,
  parseLongitude,
} from "@/lib/geo";
import type { MapHandle, MapOptions } from "@/lib/map/map";
import { cutOff, displayUrl, joinUrl, snippetText } from "@/lib/seo";
import { FieldType, type FormField, type Model } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { language: "en" },
  }),
}));

// The map chunk: a fake Leaflet that records what it was made with and
// hands back the pin's handle.
const maps = vi.hoisted(() => ({
  created: [] as { options: MapOptions; handle: MapHandle }[],
  fail: false,
}));

vi.mock("@/lib/map/map", () => ({
  createMap: (_container: HTMLElement, options: MapOptions) => {
    if (maps.fail) {
      throw new Error("no map");
    }

    const handle = { setPosition: vi.fn(), destroy: vi.fn() };
    maps.created.push({ options, handle });
    return handle;
  },
}));

const discover = vi.hoisted(() => ({
  data: {
    map: {
      tile_url: "https://tiles.example.com/{z}/{x}/{y}.png",
      tile_attribution: "Tiles",
      geocoder_url: "https://geocode.example.com/search",
    },
  } as { map: Record<string, string | null> } | undefined,
}));

vi.mock("@/hooks/use-discover", () => ({ useDiscover: () => discover }));

const httpMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/hooks/use-http", () => ({ useHttp: () => httpMock }));

afterEach(() => {
  vi.unstubAllGlobals();
  maps.created = [];
  maps.fail = false;
});

beforeEach(() => {
  httpMock.get.mockReset();
});

/** A widget wired to state, as the form wires it. */
function Controlled<T>({
  initial,
  onChange,
  children,
}: {
  initial: T;
  onChange?: (value: T) => void;
  children: (value: T, setValue: (value: T) => void) => ReactNode;
}) {
  const [value, setValue] = useState(initial);

  return children(value, (next) => {
    setValue(next);
    onChange?.(next);
  });
}

function withQueries(node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>;
}

const lastMap = () => maps.created[maps.created.length - 1];

describe("geo helpers", () => {
  it("parses coordinates from numbers and text, within their range", () => {
    expect(parseLatitude(52.3731)).toBe(52.3731);
    expect(parseLatitude("52,37")).toBe(52.37);
    expect(parseLatitude(" 4.9000000 ")).toBe(4.9);
    expect(parseLatitude(90.5)).toBeNull();
    expect(parseLongitude(-180)).toBe(-180);
    expect(parseLongitude(181)).toBeNull();
    expect(parseLongitude("")).toBeNull();
    expect(parseLongitude("east")).toBeNull();
    expect(parseLongitude(null)).toBeNull();
    expect(parseLatitude(52.123456789)).toBe(52.123457);
  });

  it("reads a location from a JSON value", () => {
    expect(locationOf({ lat: 52.37, lng: 4.89 })).toEqual({
      lat: 52.37,
      lng: 4.89,
    });
    expect(locationOf({ lat: "52.37", lng: "4.89" })).toEqual({
      lat: 52.37,
      lng: 4.89,
    });
    expect(locationOf({})).toBeNull();
    expect(locationOf({ lat: 52.37 })).toBeNull();
    expect(locationOf(null)).toBeNull();
    expect(locationOf("52.37,4.89")).toBeNull();
    expect(locationOf({ lat: 95, lng: 4.89 })).toBeNull();
  });

  it("formats coordinates without trailing zeros", () => {
    expect(formatCoordinate(52.3)).toBe("52.3");
    expect(formatCoordinate(4.1234567)).toBe("4.123457");
    expect(formatCoordinate(null)).toBe("");
  });
});

describe("seo helpers", () => {
  it("cuts text off at a word with an ellipsis", () => {
    expect(cutOff("Short", 60)).toBe("Short");
    expect(cutOff("The quick brown fox jumps over the lazy dog", 20)).toBe(
      "The quick brown fox …",
    );
    expect(cutOff("x".repeat(30), 20)).toBe(`${"x".repeat(20)} …`);
  });

  it("joins the base URL and the path with one slash", () => {
    expect(joinUrl("https://example.com/blog/", "hello")).toBe(
      "https://example.com/blog/hello",
    );
    expect(joinUrl("https://example.com/blog", "/hello/")).toBe(
      "https://example.com/blog/hello/",
    );
    expect(joinUrl("https://example.com/", "")).toBe("https://example.com/");
    expect(joinUrl(null, "hello")).toBe("hello");
    expect(joinUrl("https://example.com", undefined)).toBe(
      "https://example.com",
    );
    expect(joinUrl("https://example.com", 7)).toBe("https://example.com/7");
  });

  it("shows a URL as a breadcrumb", () => {
    expect(displayUrl("https://example.com/blog/hello-world/")).toBe(
      "example.com › blog › hello-world",
    );
    expect(displayUrl("https://example.com")).toBe("example.com");
    expect(displayUrl("https://example.com/caf%C3%A9")).toBe(
      "example.com › café",
    );
    expect(displayUrl("not a url")).toBe("not a url");
  });

  it("takes the text of strings, numbers and HTML", () => {
    expect(snippetText("  A   title\n here ")).toBe("A title here");
    expect(snippetText("<p>Hello <b>world</b></p>")).toBe("Hello world");
    expect(snippetText(7)).toBe("7");
    expect(snippetText(null)).toBe("");
    expect(snippetText({ a: 1 })).toBe("");
  });
});

describe("MapWidget on a JSON field", () => {
  const field = {
    type: FieldType.JSONField,
    verbose_name: "location",
    required: false,
  };

  it("shows the location in the boxes and makes the map with it", async () => {
    render(
      <MapWidget
        field={field}
        value={{ lat: 52.3731, lng: 4.8922 }}
        onChange={() => {}}
        options={{ center: [52, 5], zoom: 7 }}
      />,
    );

    expect(screen.getByLabelText("widgets.map_widget.latitude")).toHaveValue(
      "52.3731",
    );
    expect(screen.getByLabelText("widgets.map_widget.longitude")).toHaveValue(
      "4.8922",
    );
    await waitFor(() => expect(maps.created).toHaveLength(1));

    const { options } = lastMap();
    expect(options.position).toEqual({ lat: 52.3731, lng: 4.8922 });
    expect(options.center).toEqual({ lat: 52, lng: 5 });
    expect(options.zoom).toBe(7);
    expect(options.tileUrl).toBe("https://tiles.example.com/{z}/{x}/{y}.png");
    expect(options.attribution).toBe("Tiles");
    expect(screen.queryByText("widgets.map_widget.load_error")).toBeNull();
  });

  it("starts at the world without a pin or a center", async () => {
    render(<MapWidget field={field} value={null} onChange={() => {}} />);

    await waitFor(() => expect(maps.created).toHaveLength(1));
    expect(lastMap().options.position).toBeNull();
    expect(lastMap().options.center).toEqual({ lat: 20, lng: 0 });
    expect(lastMap().options.zoom).toBe(2);
    expect(screen.queryByRole("button", { name: "common.clear" })).toBeNull();
  });

  it("saves the typed coordinates once both are there", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Controlled<unknown> initial={null} onChange={onChange}>
        {(value, setValue) => (
          <MapWidget field={field} value={value} onChange={setValue} />
        )}
      </Controlled>,
    );

    const latitude = screen.getByLabelText("widgets.map_widget.latitude");
    const longitude = screen.getByLabelText("widgets.map_widget.longitude");

    await user.type(latitude, "52.37");
    expect(onChange).not.toHaveBeenCalled();

    await user.type(longitude, "4,89");
    expect(onChange).toHaveBeenLastCalledWith({ lat: 52.37, lng: 4.89 });

    // Text that is not a coordinate stays in the box, unsaved.
    const calls = onChange.mock.calls.length;
    await user.clear(latitude);
    await user.type(latitude, "north");
    expect(latitude).toHaveValue("north");
    expect(onChange).toHaveBeenCalledTimes(calls);

    // Both boxes emptied clears the location.
    await user.clear(latitude);
    await user.clear(longitude);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("follows the pin and clears it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Controlled<unknown> initial={{ lat: 1, lng: 2 }} onChange={onChange}>
        {(value, setValue) => (
          <MapWidget field={field} value={value} onChange={setValue} />
        )}
      </Controlled>,
    );

    await waitFor(() => expect(maps.created).toHaveLength(1));
    act(() => lastMap().options.onChange({ lat: 48.8566, lng: 2.3522 }));

    expect(onChange).toHaveBeenLastCalledWith({ lat: 48.8566, lng: 2.3522 });
    expect(screen.getByLabelText("widgets.map_widget.latitude")).toHaveValue(
      "48.8566",
    );

    await user.click(screen.getByRole("button", { name: "common.clear" }));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByLabelText("widgets.map_widget.latitude")).toHaveValue(
      "",
    );
    await waitFor(() =>
      expect(lastMap().handle.setPosition).toHaveBeenLastCalledWith(null),
    );
  });

  it("moves the pin when the value changes from outside", async () => {
    const { rerender } = render(
      <MapWidget
        field={field}
        value={{ lat: 1, lng: 2 }}
        onChange={() => {}}
      />,
    );

    await waitFor(() => expect(maps.created).toHaveLength(1));
    rerender(
      <MapWidget
        field={field}
        value={{ lat: 3, lng: 4 }}
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("widgets.map_widget.latitude")).toHaveValue(
      "3",
    );
    expect(lastMap().handle.setPosition).toHaveBeenLastCalledWith({
      lat: 3,
      lng: 4,
    });
  });

  it("searches for an address on Enter and flies to it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: "52.3730796", lon: "4.8924534", display_name: "Amsterdam" },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Controlled<unknown> initial={null} onChange={onChange}>
        {(value, setValue) => (
          <MapWidget field={field} value={value} onChange={setValue} />
        )}
      </Controlled>,
    );
    await waitFor(() => expect(maps.created).toHaveLength(1));

    await user.type(
      screen.getByRole("searchbox", { name: "widgets.map_widget.search" }),
      "Amsterdam{Enter}",
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        lat: 52.37308,
        lng: 4.892453,
      }),
    );
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://geocode.example.com/search?q=Amsterdam&format=json&limit=1&accept-language=en",
    );
    expect(lastMap().handle.setPosition).toHaveBeenLastCalledWith(
      { lat: 52.37308, lng: 4.892453 },
      true,
    );
  });

  it("says when an address is not found, or the search fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    render(<MapWidget field={field} value={null} onChange={() => {}} />);

    const search = screen.getByRole("searchbox", {
      name: "widgets.map_widget.search",
    });
    await user.type(search, "Nowhere{Enter}");
    await screen.findByText(
      'widgets.map_widget.no_results {"query":"Nowhere"}',
    );

    await user.clear(search);
    await user.type(search, "Somewhere{Enter}");
    await screen.findByText("widgets.map_widget.search_error");
  });

  it("leaves the search box out without a geocoder", () => {
    discover.data = {
      map: { tile_url: "t", tile_attribution: "", geocoder_url: null },
    };

    try {
      render(<MapWidget field={field} value={null} onChange={() => {}} />);
      expect(
        screen.queryByRole("searchbox", { name: "widgets.map_widget.search" }),
      ).toBeNull();
    } finally {
      discover.data = {
        map: {
          tile_url: "https://tiles.example.com/{z}/{x}/{y}.png",
          tile_attribution: "Tiles",
          geocoder_url: "https://geocode.example.com/search",
        },
      };
    }
  });

  it("keeps the boxes when the map cannot load", async () => {
    maps.fail = true;
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Controlled<unknown> initial={null} onChange={onChange}>
        {(value, setValue) => (
          <MapWidget field={field} value={value} onChange={setValue} />
        )}
      </Controlled>,
    );

    await screen.findByText("widgets.map_widget.load_error");
    expect(
      screen.queryByRole("searchbox", { name: "widgets.map_widget.search" }),
    ).toBeNull();

    await user.type(screen.getByLabelText("widgets.map_widget.latitude"), "1");
    await user.type(screen.getByLabelText("widgets.map_widget.longitude"), "2");
    expect(onChange).toHaveBeenLastCalledWith({ lat: 1, lng: 2 });
  });
});

describe("MapWidget on two number fields", () => {
  function Harness({ onChange }: { onChange: (values: unknown) => void }) {
    const form = useForm({
      defaultValues: { latitude: "52.3700000", longitude: "4.8900000" },
    });
    const latitude = form.watch("latitude");

    return (
      <Form {...form}>
        <MapWidget
          field={{ type: FieldType.DecimalField, verbose_name: "latitude" }}
          value={latitude}
          options={{ lng_field: "longitude" }}
          onChange={(value) => {
            form.setValue("latitude", value as string);
            onChange(form.getValues());
          }}
        />
      </Form>
    );
  }

  it("reads and fills both fields", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Harness onChange={onChange} />);

    expect(screen.getByLabelText("widgets.map_widget.latitude")).toHaveValue(
      "52.37",
    );
    expect(screen.getByLabelText("widgets.map_widget.longitude")).toHaveValue(
      "4.89",
    );
    await waitFor(() => expect(maps.created).toHaveLength(1));
    expect(lastMap().options.position).toEqual({ lat: 52.37, lng: 4.89 });

    act(() => lastMap().options.onChange({ lat: 51.5074, lng: -0.1278 }));

    expect(onChange).toHaveBeenLastCalledWith({
      latitude: 51.5074,
      longitude: -0.1278,
    });
    expect(screen.getByLabelText("widgets.map_widget.longitude")).toHaveValue(
      "-0.1278",
    );

    await user.click(screen.getByRole("button", { name: "common.clear" }));
    expect(onChange).toHaveBeenLastCalledWith({
      latitude: null,
      longitude: null,
    });
  });
});

describe("EmbedWidget", () => {
  const preview = {
    provider: "YouTube",
    type: "video",
    title: "A video",
    author: "A channel",
    author_url: null,
    thumbnail: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
    thumbnail_width: 480,
    thumbnail_height: 360,
    url: "https://youtu.be/abc",
  };

  function axiosError(status: number) {
    const error = new AxiosError("Request failed", String(status));
    error.response = { status } as AxiosResponse;
    return error;
  }

  it("shows the preview of a web address", async () => {
    httpMock.get.mockResolvedValue({ data: preview });

    render(
      withQueries(
        <EmbedWidget value="https://youtu.be/abc" onChange={() => {}} />,
      ),
    );

    expect(screen.getByRole("textbox")).toHaveValue("https://youtu.be/abc");
    await screen.findByText("A video");
    expect(screen.getByText("YouTube · A channel")).toBeInTheDocument();
    expect(
      screen.getByTestId("embed-preview").querySelector("img"),
    ).toHaveAttribute("src", preview.thumbnail);
    expect(httpMock.get).toHaveBeenCalledWith("/oembed", {
      params: { url: "https://youtu.be/abc" },
    });
    // The open button of the URL input is there too.
    expect(
      screen.getByRole("link", { name: "widgets.url_widget.open" }),
    ).toHaveAttribute("href", "https://youtu.be/abc");
  });

  it("asks for nothing without a web address, and once typing pauses", async () => {
    const user = userEvent.setup();
    httpMock.get.mockResolvedValue({ data: preview });

    render(
      withQueries(
        <Controlled<string | null> initial="">
          {(value, setValue) => (
            <EmbedWidget value={value} onChange={setValue} />
          )}
        </Controlled>,
      ),
    );

    await user.type(screen.getByRole("textbox"), "youtu.be/abc");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(httpMock.get).not.toHaveBeenCalled();

    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "https://youtu.be/abc");
    await screen.findByText("A video");
    expect(httpMock.get).toHaveBeenCalledTimes(1);
  });

  it("tells unknown addresses from failures", async () => {
    httpMock.get.mockRejectedValueOnce(axiosError(404));

    const { unmount } = render(
      withQueries(
        <EmbedWidget value="https://example.com/v" onChange={() => {}} />,
      ),
    );

    await screen.findByText("widgets.embed_widget.no_preview");
    unmount();

    httpMock.get.mockRejectedValueOnce(axiosError(502));
    render(
      withQueries(
        <EmbedWidget value="https://youtu.be/down" onChange={() => {}} />,
      ),
    );

    await screen.findByText("widgets.embed_widget.load_error");
  });
});

describe("SEOPreview", () => {
  const model = { label: "testapp.article" } as unknown as Model;

  function makeField(overrides: Partial<FormField> = {}): FormField {
    return {
      type: "component",
      name: "",
      label: null,
      readonly: false,
      col_span: 1,
      widget: null,
      component_id: "0f1e2d3c",
      component_type: "SEOPreview",
      copy: false,
      icon: "",
      title_field: "title",
      description_field: "summary",
      base_url: "https://example.com/blog/",
      path_field: "slug",
      site_name: "Example",
      ...overrides,
    };
  }

  function Harness({
    values,
    children,
  }: {
    values: Record<string, unknown>;
    children: ReactNode;
  }) {
    const form = useForm({ defaultValues: values });

    return <Form {...form}>{children}</Form>;
  }

  it("shows the title, description and URL from the form", () => {
    render(
      <Harness
        values={{
          title: "Hello world",
          summary: "<p>A <b>short</b> summary.</p>",
          slug: "hello-world",
        }}
      >
        <SEOPreview model={model} formField={makeField()} />
      </Harness>,
    );

    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.getByText("A short summary.")).toBeInTheDocument();
    expect(
      screen.getByText("example.com › blog › hello-world"),
    ).toBeInTheDocument();
    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(screen.queryByText(/title_over/)).toBeNull();
  });

  it("cuts long text off and says so", () => {
    const title =
      "A very long title that goes on and on, well past what search engines show";
    const summary = "word ".repeat(40).trim();

    render(
      <Harness values={{ title, summary, slug: "" }}>
        <SEOPreview model={model} formField={makeField()} />
      </Harness>,
    );

    expect(
      screen.getByText(/…$/, { selector: "p.text-lg" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(title)).toBeNull();
    expect(
      screen.getByText(
        `form_components.seo_preview.title_over {"count":${title.length},"limit":60}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `form_components.seo_preview.description_over {"count":${summary.length},"limit":160}`,
      ),
    ).toBeInTheDocument();
    // Without a slug, the base URL alone.
    expect(screen.getByText("example.com › blog")).toBeInTheDocument();
  });

  it("shows placeholders for empty fields, and no URL line without one", () => {
    render(
      <Harness values={{ title: "", summary: "" }}>
        <SEOPreview
          model={model}
          formField={makeField({
            base_url: null,
            path_field: null,
            site_name: null,
          })}
        />
      </Harness>,
    );

    expect(
      screen.getByText("form_components.seo_preview.no_title"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("form_components.seo_preview.no_description"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/›/)).toBeNull();
  });

  it("follows the form as the editor types", async () => {
    const user = userEvent.setup();

    function Editable() {
      const form = useForm({ defaultValues: { title: "Old", slug: "old" } });

      return (
        <Form {...form}>
          <input aria-label="title" {...form.register("title")} />
          <SEOPreview
            model={model}
            formField={makeField({ description_field: null })}
          />
        </Form>
      );
    }

    render(<Editable />);

    await user.clear(screen.getByLabelText("title"));
    await user.type(screen.getByLabelText("title"), "New title");

    expect(screen.getByText("New title")).toBeInTheDocument();
    expect(
      screen.queryByText("form_components.seo_preview.no_description"),
    ).toBeNull();
  });
});
