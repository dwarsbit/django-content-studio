/* eslint-disable react-refresh/only-export-components -- a prototype page, not an app module */
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { PiSlidersHorizontalBold, PiXBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import { DashboardScreen } from "./screens/dashboard";
import { EditScreen } from "./screens/edit";
import { ContentListScreen } from "./screens/list";
import { MediaLibraryScreen } from "./screens/media";
import { TrashScreen } from "./screens/trash";
import { AppShell } from "./shell";

export type Screen =
  "dashboard" | "list" | "trash" | "create" | "edit" | "media";

export interface Settings {
  theme: "light" | "dark";
  menu: "expanded" | "collapsed";
  tenant: boolean;
  listView: "table" | "list";
  listState: "default" | "selected" | "filtered" | "empty";
  mediaState: "default" | "empty";
  editDirty: boolean;
}

const DEFAULTS: Settings = {
  // The host (the artifact viewer) may set data-theme; otherwise the
  // system preference decides.
  theme:
    document.documentElement.dataset.theme === "dark" ||
    (document.documentElement.dataset.theme !== "light" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark"
      : "light",
  menu: "expanded",
  tenant: false,
  listView: "table",
  listState: "default",
  mediaState: "default",
  editDirty: false,
};

// The screens' routes, hash-based so the page works from any host.
export const ROUTES: Record<Screen, string> = {
  dashboard: "#/",
  list: "#/content/articles",
  trash: "#/content/articles/trash",
  create: "#/content/articles/new",
  edit: "#/content/articles/1",
  media: "#/media-library",
};

function screenFromHash(hash: string): Screen {
  if (hash.startsWith("#/content/articles/trash")) return "trash";
  if (hash.startsWith("#/content/articles/new")) return "create";
  if (hash.startsWith("#/content/articles/")) return "edit";
  if (hash.startsWith("#/content/")) return "list";
  if (hash.startsWith("#/media-library")) return "media";
  return "dashboard";
}

const PrototypeContext = createContext<{
  settings: Settings;
  update(patch: Partial<Settings>): void;
  screen: Screen;
  navigate(screen: Screen): void;
}>({
  settings: DEFAULTS,
  update: () => {},
  screen: "dashboard",
  navigate: () => {},
});

export const usePrototype = () => useContext(PrototypeContext);

const NARROW = "(max-width: 1023px)";

/** Whether the viewport is narrower than the two-column layouts need. */
export function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);

  useEffect(() => {
    const query = window.matchMedia(NARROW);
    const onChange = () => setNarrow(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return narrow;
}

export function PrototypeApp() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [screen, setScreen] = useState<Screen>(() =>
    screenFromHash(window.location.hash),
  );

  useEffect(() => {
    const onHashChange = () => setScreen(screenFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "dark",
      settings.theme === "dark",
    );
  }, [settings.theme]);

  const update = (patch: Partial<Settings>) =>
    setSettings((previous) => ({ ...previous, ...patch }));
  const navigate = (next: Screen) => {
    window.location.hash = ROUTES[next];
  };

  return (
    <PrototypeContext value={{ settings, update, screen, navigate }}>
      <AppShell>
        {screen === "dashboard" && <DashboardScreen />}
        {screen === "list" && <ContentListScreen key={settings.listState} />}
        {screen === "trash" && <TrashScreen key={settings.listState} />}
        {screen === "create" && <EditScreen key="create" create />}
        {screen === "edit" && <EditScreen key="edit" />}
        {screen === "media" && <MediaLibraryScreen key={settings.mediaState} />}
      </AppShell>
      <Controls />
    </PrototypeContext>
  );
}

/**
 * The prototype controls: switch screens, themes and the variants under
 * discussion. Not part of the admin.
 */
function Controls() {
  const { settings, update, screen, navigate } = usePrototype();
  const [open, setOpen] = useState(true);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-72 rounded-lg border bg-popover text-popover-foreground shadow-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Prototype controls</div>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <PiXBold />
            </Button>
          </div>
          <Control label="Screen">
            <Segmented
              value={screen}
              onChange={(value) => navigate(value as Screen)}
              options={[
                ["dashboard", "Dashboard"],
                ["list", "List"],
                ["trash", "Trash"],
                ["create", "Create"],
                ["edit", "Edit"],
                ["media", "Media"],
              ]}
            />
          </Control>
          <Control label="Theme">
            <Segmented
              value={settings.theme}
              onChange={(theme) =>
                update({ theme: theme as Settings["theme"] })
              }
              options={[
                ["light", "Light"],
                ["dark", "Dark"],
              ]}
            />
          </Control>
          <Control label="Main menu">
            <Segmented
              value={settings.menu}
              onChange={(menu) => update({ menu: menu as Settings["menu"] })}
              options={[
                ["expanded", "Expanded"],
                ["collapsed", "Collapsed"],
              ]}
            />
          </Control>
          <Control label="Tenants">
            <Segmented
              value={settings.tenant ? "on" : "off"}
              onChange={(value) => update({ tenant: value === "on" })}
              options={[
                ["off", "Single site"],
                ["on", "Multi-tenant"],
              ]}
            />
          </Control>
          {(screen === "list" || screen === "trash") && (
            <>
              {screen === "list" && (
                <Control label="List view">
                  <Segmented
                    value={settings.listView}
                    onChange={(listView) =>
                      update({ listView: listView as Settings["listView"] })
                    }
                    options={[
                      ["table", "Table"],
                      ["list", "List"],
                    ]}
                  />
                </Control>
              )}
              <Control label="List state">
                <Segmented
                  value={settings.listState}
                  onChange={(listState) =>
                    update({ listState: listState as Settings["listState"] })
                  }
                  options={
                    screen === "trash"
                      ? [
                          ["default", "Default"],
                          ["empty", "Empty"],
                        ]
                      : [
                          ["default", "Default"],
                          ["selected", "Selected"],
                          ["filtered", "Filtered"],
                          ["empty", "Empty"],
                        ]
                  }
                />
              </Control>
            </>
          )}
          {screen === "media" && (
            <Control label="Media library">
              <Segmented
                value={settings.mediaState}
                onChange={(mediaState) =>
                  update({ mediaState: mediaState as Settings["mediaState"] })
                }
                options={[
                  ["default", "With files"],
                  ["empty", "Empty"],
                ]}
              />
            </Control>
          )}
          {screen === "edit" && (
            <Control label="Edit page">
              <Segmented
                value={settings.editDirty ? "dirty" : "clean"}
                onChange={(value) => update({ editDirty: value === "dirty" })}
                options={[
                  ["clean", "Saved"],
                  ["dirty", "Unsaved changes"],
                ]}
              />
            </Control>
          )}
        </div>
      )}
      <Button
        variant={open ? "secondary" : "default"}
        size="sm"
        onClick={() => setOpen(!open)}
      >
        <PiSlidersHorizontalBold />
        Prototype controls
      </Button>
    </div>
  );
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange(value: string): void;
  options: [string, string][];
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={value}
      className={cn("w-full", options.length > 2 && "flex-wrap")}
      onValueChange={(next) => next && onChange(next)}
    >
      {options.map(([key, label]) => (
        <ToggleGroupItem key={key} value={key} className="flex-1 text-xs">
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
