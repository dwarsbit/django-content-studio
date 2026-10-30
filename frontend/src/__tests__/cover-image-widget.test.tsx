import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as R from "ramda";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CoverImageWidget } from "@/components/widgets/cover-image-widget/cover-image-widget";
import type { FieldType, MediaItem, ModelField } from "@/types";

const httpMock = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  postForm: vi.fn(),
}));
const useDiscoverMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => httpMock,
}));

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: useDiscoverMock,
}));

// The library picker has its own tests; here it is just its trigger.
vi.mock("@/components/media-library/select-dialog", () => ({
  SelectDialog: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function makeMediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "media-1",
    folder: null,
    name: "veluwe-heath.jpg",
    thumbnail: "/media/thumbs/veluwe-heath.jpg",
    file: "/media/veluwe-heath.jpg",
    tags: [],
    alt_text: "Heather in bloom",
    type: "image",
    size: 2400,
    ...overrides,
  };
}

function makeField(overrides: Partial<ModelField> = {}): ModelField {
  return { type: "MediaField" as FieldType, required: false, ...overrides };
}

function setup(focalPoint: string | null, item = makeMediaItem()) {
  useDiscoverMock.mockReturnValue({
    data: {
      media_library: {
        enabled: true,
        folders: false,
        crop: false,
        focal_point: focalPoint,
        models: { media_model: "media.image", folder_model: null },
      },
    },
  });
  httpMock.get.mockImplementation((url: string) =>
    url === `/media-library/items/${item.id}`
      ? Promise.resolve({ data: item })
      : Promise.reject(new Error(`unexpected GET ${url}`)),
  );
}

function renderWidget(
  props: Partial<React.ComponentProps<typeof CoverImageWidget>> = {},
) {
  const onChange = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <CoverImageWidget
        field={makeField()}
        value={null}
        onChange={onChange}
        {...props}
      />
    </QueryClientProvider>,
  );

  return onChange;
}

// The related item as the API represents a MediaField value.
const relatedValue = {
  id: "media-1",
  __str__: "veluwe-heath.jpg",
  file: "/media/veluwe-heath.jpg",
  type: "image" as const,
  thumbnail: "/media/thumbs/veluwe-heath.jpg",
};

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  httpMock.patch.mockImplementation((_url: string, values: object) =>
    Promise.resolve({ data: { ...makeMediaItem(), ...values } }),
  );
});

describe("CoverImageWidget", () => {
  it("offers the library and an upload when empty", () => {
    setup(null);
    renderWidget();

    expect(
      screen.getByText("widgets.cover_image_widget.empty_title"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "widgets.cover_image_widget.choose" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "widgets.cover_image_widget.upload" }),
    ).toBeInTheDocument();
  });

  it("shows no actions when read-only", () => {
    setup(null);
    renderWidget({ field: makeField({ readonly: true }) });

    expect(
      screen.getByText("widgets.cover_image_widget.no_image"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the image at its focal point with the item's details", async () => {
    setup(
      "focal_point",
      makeMediaItem({ focal_point: { x: 72, y: 60 } } as Partial<MediaItem>),
    );
    renderWidget({ value: relatedValue });

    const image = await screen.findByRole("img", { name: "Heather in bloom" });

    expect(image).toHaveAttribute("src", "/media/thumbs/veluwe-heath.jpg");
    expect(image).toHaveStyle({ objectPosition: "72% 60%" });
    expect(screen.getByText("veluwe-heath.jpg")).toBeInTheDocument();
    expect(
      screen.getByLabelText("widgets.cover_image_widget.alt_text"),
    ).toHaveValue("Heather in bloom");
  });

  it("removes the image, unless the field is required", async () => {
    setup(null);
    const onChange = renderWidget({ value: relatedValue });

    await userEvent.click(
      screen.getByRole("button", { name: "widgets.cover_image_widget.remove" }),
    );

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("keeps a required image", () => {
    setup(null);
    renderWidget({ value: relatedValue, field: makeField({ required: true }) });

    expect(
      screen.queryByRole("button", {
        name: "widgets.cover_image_widget.remove",
      }),
    ).not.toBeInTheDocument();
  });

  it("uploads a file to the media library and selects it", async () => {
    setup(null);
    const created = makeMediaItem({ id: "media-2", name: "new.png" });
    httpMock.postForm.mockResolvedValue({ data: created });
    const onChange = renderWidget();

    const file = new File(["png"], "new.png", { type: "image/png" });
    await userEvent.upload(screen.getByTestId("cover-image-input"), file);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(created));
    expect(httpMock.postForm).toHaveBeenCalledWith(
      "/media-library/items",
      expect.objectContaining({ name: "new.png", type: "image", file }),
      expect.anything(),
    );
  });

  it("shows why an upload was refused", async () => {
    setup(null);
    httpMock.postForm.mockRejectedValue({
      response: { data: { file: ["Files of this type cannot be uploaded."] } },
    });
    const onChange = renderWidget();

    const file = new File(["png"], "new.png", { type: "image/png" });
    await userEvent.upload(screen.getByTestId("cover-image-input"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Files of this type cannot be uploaded.",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses a file that is not an image", async () => {
    setup(null);
    const onChange = renderWidget();

    // The file input's accept attribute would filter the file out
    // before the widget sees it, as a drop does not.
    const user = userEvent.setup({ applyAccept: false });
    const file = new File(["text"], "notes.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId("cover-image-input"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "widgets.cover_image_widget.not_an_image",
    );
    expect(httpMock.postForm).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("saves changed alt text on the media item", async () => {
    setup(null);
    renderWidget({ value: relatedValue });

    const input = await screen.findByLabelText(
      "widgets.cover_image_widget.alt_text",
    );
    await userEvent.clear(input);
    await userEvent.type(input, "A lone pine");
    fireEvent.blur(input);

    await waitFor(() =>
      expect(httpMock.patch).toHaveBeenCalledWith(
        "/media-library/items/media-1",
        { id: "media-1", alt_text: "A lone pine" },
      ),
    );
  });

  it("does not save unchanged alt text", async () => {
    setup(null);
    renderWidget({ value: relatedValue });

    const input = await screen.findByLabelText(
      "widgets.cover_image_widget.alt_text",
    );
    fireEvent.blur(input);

    expect(httpMock.patch).not.toHaveBeenCalled();
  });

  it("leaves out alt text the media item does not expose", async () => {
    const withoutAltText = R.omit(["alt_text"], makeMediaItem());
    setup(null, withoutAltText as MediaItem);
    renderWidget({ value: relatedValue });

    await screen.findByText("veluwe-heath.jpg");

    expect(
      screen.queryByLabelText("widgets.cover_image_widget.alt_text"),
    ).not.toBeInTheDocument();
  });

  it("offers the focal point only when it is configured", async () => {
    setup(null);
    renderWidget({ value: relatedValue });

    await screen.findByLabelText("widgets.cover_image_widget.alt_text");

    expect(
      screen.queryByRole("button", {
        name: "widgets.cover_image_widget.focal_point",
      }),
    ).not.toBeInTheDocument();
  });

  it("saves the focal point on the media item", async () => {
    setup("focal_point");
    renderWidget({ value: relatedValue });

    await userEvent.click(
      await screen.findByRole("button", {
        name: "widgets.cover_image_widget.focal_point",
      }),
    );

    // Without a focal point, the arrow keys start from the center.
    const target = await screen.findByRole("button", {
      name: "widgets.cover_image_widget.focal_point_dialog.unset",
    });
    fireEvent.keyDown(target, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(target, { key: "ArrowUp" });

    expect(screen.getByTestId("focal-point-marker")).toHaveStyle({
      left: "60%",
      top: "49%",
    });

    await userEvent.click(
      screen.getByRole("button", {
        name: "widgets.cover_image_widget.focal_point_dialog.save",
      }),
    );

    await waitFor(() =>
      expect(httpMock.patch).toHaveBeenCalledWith(
        "/media-library/items/media-1",
        { id: "media-1", focal_point: { x: 60, y: 49 } },
      ),
    );
  });
});

describe("CoverImageWidget options", () => {
  // jsdom loads no images: this one reports a fixed natural size.
  function stubImageSize(width: number, height: number) {
    class SizedImage {
      naturalWidth = width;
      naturalHeight = height;
      onload: (() => void) | null = null;
      set src(_src: string) {
        setTimeout(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", SizedImage);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shapes the frame by the aspect ratio", () => {
    setup(null);
    renderWidget({ options: { aspect_ratio: "4:5" } });

    expect(screen.getByTestId("cover-image-input").parentElement).toHaveStyle({
      aspectRatio: "4 / 5",
    });
    expect(
      screen.getByText("widgets.cover_image_widget.size_hint_portrait"),
    ).toBeInTheDocument();
  });

  it("is 16:9 without an aspect ratio", () => {
    setup(null);
    renderWidget();

    expect(screen.getByTestId("cover-image-input").parentElement).toHaveStyle({
      aspectRatio: "16 / 9",
    });
  });

  it("warns about an image smaller than the minimum size", async () => {
    stubImageSize(1200, 675);
    setup(null);
    renderWidget({
      value: relatedValue,
      options: { min_width: 1600, min_height: 900 },
    });

    expect(
      await screen.findByText("widgets.cover_image_widget.too_small"),
    ).toBeInTheDocument();
    expect(screen.getByText("1200 × 675 px")).toBeInTheDocument();
  });

  it("does not warn about an image of the minimum size", async () => {
    stubImageSize(1600, 900);
    setup(null);
    renderWidget({ value: relatedValue, options: { min_width: 1600 } });

    expect(await screen.findByText("1600 × 900 px")).toBeInTheDocument();
    expect(
      screen.queryByText("widgets.cover_image_widget.too_small"),
    ).not.toBeInTheDocument();
  });
});

describe("CoverImageWidget metadata", () => {
  it("checks the minimum size on the stored metadata, without loading the file", async () => {
    const loads = vi.fn();
    vi.stubGlobal(
      "Image",
      class {
        set src(src: string) {
          loads(src);
        }
      },
    );
    const item = {
      ...makeMediaItem(),
      metadata: { width: 800, height: 450 },
    } as MediaItem;
    setup(null, item);
    useDiscoverMock.mockReturnValue({
      data: {
        media_library: {
          enabled: true,
          folders: false,
          crop: false,
          focal_point: null,
          metadata: "metadata",
          models: { media_model: "media.image", folder_model: null },
        },
      },
    });

    renderWidget({ value: relatedValue, options: { min_width: 1600 } });

    expect(
      await screen.findByText("widgets.cover_image_widget.too_small"),
    ).toBeInTheDocument();
    expect(screen.getByText("800 × 450 px")).toBeInTheDocument();
    expect(loads).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
