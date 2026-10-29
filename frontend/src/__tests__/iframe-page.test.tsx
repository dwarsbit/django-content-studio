import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { CatchAllPage } from "@/pages/(studio)/[...slug]/page";
import { ExtensionType } from "@/types";

const useDiscoverMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-discover", () => ({ useDiscover: useDiscoverMock }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderPage(sandbox: string | null) {
  useDiscoverMock.mockReturnValue({
    data: {
      extensions: [
        {
          extension_id: "page-1",
          extension_type: ExtensionType.IFramePage,
          config: {
            path: "/reports/",
            iframe_url: "https://metabase.example.com/dashboard/1",
            sandbox,
          },
        },
      ],
      model_groups: [],
      models: [],
      media_library: { enabled: false },
    },
  });

  const { container } = render(
    <MemoryRouter initialEntries={["/reports/"]}>
      <Routes>
        <Route path="*" element={<CatchAllPage />} />
      </Routes>
    </MemoryRouter>,
  );

  return container.querySelector("iframe");
}

describe("IFramePage", () => {
  it("renders the iframe with the configured sandbox and a referrer policy", () => {
    const iframe = renderPage("allow-scripts allow-same-origin");

    expect(iframe).toHaveAttribute(
      "src",
      "https://metabase.example.com/dashboard/1",
    );
    expect(iframe).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin",
    );
    expect(iframe).toHaveAttribute(
      "referrerpolicy",
      "strict-origin-when-cross-origin",
    );
  });

  it("embeds the page without a sandbox when turned off", () => {
    const iframe = renderPage(null);

    expect(iframe).not.toHaveAttribute("sandbox");
  });
});
