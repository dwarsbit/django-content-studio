import { useQuery } from "@tanstack/react-query";
import * as R from "ramda";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuMonitorCog, LuMoon, LuSun } from "react-icons/lu";
import {
  PiFileTextBold,
  PiHouseSimpleBold,
  PiImageBold,
  PiMagnifyingGlassBold,
  PiPlusBold,
  PiSignOutBold,
  PiTrashBold,
} from "react-icons/pi";
import { useNavigate } from "react-router";

import { useAuth } from "@/auth";
import { type Theme, useTheme } from "@/components/theme-provider";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import { cn } from "@/lib/utils";
import type { SearchResultGroup } from "@/types";

// Mirrors the backend's minimum term length.
const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The command palette: jump to anything in the studio. Static entries
 * (navigation, create, trash, theme, logout) come from the discover
 * payload and filter locally; a term of two characters or more also
 * searches objects across every registered model through the search
 * endpoint, debounced. Selecting an entry navigates and closes.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const { t } = useTranslation();
  const http = useHttp();
  const navigate = useNavigate();
  const { data: discover } = useDiscover();
  const { logout } = useAuth();
  const { setTheme } = useTheme();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(term), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [term]);

  // A reopened palette starts fresh; adjusting state during render is
  // React's sanctioned way to react to a prop change.
  const [wasOpen, setWasOpen] = useState(open);

  if (wasOpen !== open) {
    setWasOpen(open);

    if (!open) {
      setTerm("");
      setDebounced("");
    }
  }

  const { data: searchResults } = useQuery({
    enabled: open && debounced.trim().length >= SEARCH_MIN_LENGTH,
    retry: false,
    queryKey: ["search", debounced],
    async queryFn() {
      const { data } = await http.get<SearchResultGroup[]>("/search", {
        params: { search: debounced },
      });

      return data;
    },
  });

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  // The remote results make cmdk's own filtering unusable, so the
  // static entries filter locally.
  const needle = term.trim().toLowerCase();
  const matches = (...keywords: string[]) =>
    R.isEmpty(needle) ||
    keywords.some((keyword) => keyword.toLowerCase().includes(needle));

  const models = discover?.models ?? [];
  const navigableModels = models.filter((model) =>
    matches(model.verbose_name_plural, model.label),
  );
  const createModels = models.filter(
    (model) =>
      model.admin.permissions.add_permission &&
      matches(
        t("palette.create_item", { model: model.verbose_name }),
        model.label,
      ),
  );
  const trashModels = models.filter(
    (model) =>
      model.admin.list.trash &&
      matches(
        t("palette.trash_item", { model: model.verbose_name_plural }),
        model.label,
      ),
  );

  const hasStaticEntries =
    navigableModels.length > 0 ||
    createModels.length > 0 ||
    trashModels.length > 0 ||
    R.isEmpty(needle);
  const hasEntries =
    !R.isEmpty(searchResults ?? []) || hasStaticEntries || R.isEmpty(needle);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
      title={t("palette.title")}
      description={t("palette.title")}
    >
      <CommandInput
        placeholder={t("palette.placeholder")}
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        {!hasEntries && <CommandEmpty>{t("palette.empty")}</CommandEmpty>}

        {!R.isEmpty(searchResults ?? []) && (
          <CommandGroup heading={t("palette.search_results")}>
            {searchResults!.map((group) =>
              group.results.map((item) => (
                <CommandItem
                  key={`${group.model}:${item.id}`}
                  onSelect={() => go(`/content/${group.model}/${item.id}`)}
                >
                  {group.icon ? (
                    <span className={cn(group.icon)} />
                  ) : (
                    <PiMagnifyingGlassBold />
                  )}
                  {item.title}
                  <span className="ml-auto text-muted-foreground text-sm">
                    {group.verbose_name}
                  </span>
                </CommandItem>
              )),
            )}
          </CommandGroup>
        )}

        <CommandGroup heading={t("palette.navigate")}>
          {matches(t("main_menu.dashboard")) && (
            <CommandItem onSelect={() => go("/")}>
              <PiHouseSimpleBold />
              {t("main_menu.dashboard")}
            </CommandItem>
          )}
          {discover?.media_library.enabled &&
            matches(t("main_menu.media_library")) && (
              <CommandItem onSelect={() => go("/media-library")}>
                <PiImageBold />
                {t("main_menu.media_library")}
              </CommandItem>
            )}
          {navigableModels.map((model) => (
            <CommandItem
              key={model.label}
              onSelect={() => go(`/content/${model.label}`)}
            >
              {model.admin.icon ? (
                <span className={cn(model.admin.icon)} />
              ) : (
                <PiFileTextBold />
              )}
              {model.verbose_name_plural}
            </CommandItem>
          ))}
        </CommandGroup>

        {createModels.length > 0 && (
          <CommandGroup heading={t("palette.create")}>
            {createModels.map((model) => (
              <CommandItem
                key={model.label}
                onSelect={() => go(`/content/${model.label}/new`)}
              >
                <PiPlusBold />
                {t("palette.create_item", {
                  model: model.verbose_name,
                })}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {trashModels.length > 0 && (
          <CommandGroup heading={t("palette.trash")}>
            {trashModels.map((model) => (
              <CommandItem
                key={model.label}
                onSelect={() => go(`/content/${model.label}/trash`)}
              >
                <PiTrashBold />
                {t("palette.trash_item", {
                  model: model.verbose_name_plural,
                })}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matches(t("palette.theme")) && (
          <CommandGroup heading={t("palette.theme")}>
            {(
              [
                ["light", <LuSun key="light" />, "palette.theme_light"],
                ["dark", <LuMoon key="dark" />, "palette.theme_dark"],
                [
                  "system",
                  <LuMonitorCog key="system" />,
                  "palette.theme_system",
                ],
              ] as const
            ).map(([theme, icon, key]) => (
              <CommandItem
                key={theme}
                onSelect={() => {
                  setTheme(theme as Theme);
                  onOpenChange(false);
                }}
              >
                {icon}
                {t(key)}
              </CommandItem>
            ))}
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                logout();
              }}
            >
              <PiSignOutBold />
              {t("palette.logout")}
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
