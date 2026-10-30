import * as R from "ramda";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuMonitorCog, LuMoon, LuSun } from "react-icons/lu";
import {
  PiCaretDownBold,
  PiCaretRightBold,
  PiCaretUpDownBold,
  PiFileTextBold,
  PiHouseSimpleBold,
  PiImageBold,
  PiMagnifyingGlassBold,
  PiSidebarSimpleBold,
  PiSignOutBold,
} from "react-icons/pi";
import { TbCommand } from "react-icons/tb";
import {
  Link,
  type Path,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router";

import { useAuth } from "@/auth";
import { type Theme, useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAdminInfo } from "@/hooks/use-admin-info";
import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import { useMe } from "@/hooks/use-me";
import { NARROW_QUERY, useMediaQuery } from "@/hooks/use-media-query";
import { useRunButton } from "@/hooks/use-run-button";
import { safeStorage } from "@/lib/safe-storage";
import { cn } from "@/lib/utils";
import { useTenant } from "@/tenant";
import {
  type ButtonResult,
  ExtensionType,
  type MainMenuButtonExtension,
  type ModelGroup,
} from "@/types";

import { TenantSelector } from "./tenant-selector";

/**
 * The main menu: the site (or the tenant), the search trigger, the
 * pages and extensions, the model groups as headings with their models
 * listed under them, and the user menu. Collapsed, or below 1024px, it
 * is a rail of icons with tooltips.
 */
export function MainMenu({ onOpenPalette }: { onOpenPalette(): void }) {
  const { t } = useTranslation();
  const { data: adminInfo } = useAdminInfo();
  const { data: discover } = useDiscover();
  const { enabled: tenant } = useTenant();
  const location = useLocation();
  const narrow = useMediaQuery(NARROW_QUERY);
  const [collapsedByUser, setCollapsedByUser] = useState(
    () => safeStorage.get("main-menu-collapsed") === "true",
  );
  const collapsed = narrow || collapsedByUser;

  useEffect(() => {
    safeStorage.set("main-menu-collapsed", String(collapsedByUser));
  }, [collapsedByUser]);

  // Links and buttons share one list, ordered by weight (lower first);
  // equal weights keep the order of the site's extensions.
  const menuExtensions = R.sortBy(
    (extension) => extension.config.weight ?? 0,
    discover?.extensions.filter(
      (extension) =>
        extension.extension_type === ExtensionType.MainMenuLink ||
        extension.extension_type === ExtensionType.MainMenuButton,
    ) ?? [],
  );

  // The group holding the current model: /content/<model>. It is open
  // whatever its configuration, until the user closes it by hand.
  const activeModel = /^\/content\/([^/]+)/.exec(location.pathname)?.[1];
  const activeGroup =
    (activeModel &&
      discover?.model_groups.find((group) => group.models.includes(activeModel))
        ?.name) ||
    null;

  return (
    <nav
      aria-label={t("main_menu.title")}
      className={cn(
        "shrink-0 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200 select-none",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <div
        className={cn(
          "h-14 shrink-0 flex items-center",
          collapsed ? "justify-center" : "pl-4 pr-2 gap-2",
        )}
      >
        {tenant ? (
          <TenantSelector collapsed={collapsed} />
        ) : (
          <Brand
            collapsed={collapsed}
            name={adminInfo?.site_header ?? ""}
            onExpand={narrow ? undefined : () => setCollapsedByUser(false)}
          />
        )}
        {!collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                aria-label={t("main_menu.collapse")}
                onClick={() => setCollapsedByUser(true)}
              >
                <PiSidebarSimpleBold />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {t("main_menu.collapse")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar px-2 pb-2 space-y-0.5">
        <SearchTrigger collapsed={collapsed} onClick={onOpenPalette} />
        <div className="h-2" />
        <MenuItem
          collapsed={collapsed}
          to="/"
          icon={<PiHouseSimpleBold />}
          label={t("main_menu.dashboard")}
        />
        {discover?.media_library.enabled && (
          <MenuItem
            collapsed={collapsed}
            to="/media-library"
            icon={<PiImageBold />}
            label={t("main_menu.media_library")}
          />
        )}
        {menuExtensions.map((extension) =>
          extension.extension_type === ExtensionType.MainMenuLink ? (
            <MenuItem
              key={extension.extension_id}
              collapsed={collapsed}
              to={extension.config.url}
              icon={<span className={extension.config.icon ?? undefined} />}
              label={extension.config.label}
            />
          ) : (
            <MenuButton
              key={extension.extension_id}
              collapsed={collapsed}
              extension={extension}
            />
          ),
        )}

        {discover?.model_groups.map((group) => (
          <MenuSection
            key={group.name}
            group={group}
            collapsed={collapsed}
            active={group.name === activeGroup}
          >
            {group.models
              .map((label) => {
                const model = discover.models.find(R.whereEq({ label }));

                return model ? (
                  <MenuItem
                    key={label}
                    collapsed={collapsed}
                    to={`/content/${model.label}`}
                    label={model.verbose_name_plural}
                    icon={model.admin.icon ?? <PiFileTextBold />}
                  />
                ) : null;
              })
              .filter((el) => !R.isNil(el))}
          </MenuSection>
        ))}
      </div>

      <UserMenu collapsed={collapsed} />
    </nav>
  );
}

/** The site: its mark and its name; collapsed, the mark expands the menu. */
function Brand({
  collapsed,
  name,
  onExpand,
}: {
  collapsed: boolean;
  name: string;
  // Absent on narrow screens, where the menu cannot expand.
  onExpand?: () => void;
}) {
  const { t } = useTranslation();
  const mark = (
    <div className="size-6 shrink-0 rounded-md bg-gradient-to-tl from-gray-900 to-gray-600 dark:from-gray-100 dark:to-gray-400 text-gray-50 dark:text-gray-900 flex items-center justify-center text-xs font-black">
      {name[0]}
    </div>
  );

  if (collapsed && onExpand) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t("main_menu.expand")}
            className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer"
            onClick={onExpand}
          >
            {mark}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{t("main_menu.expand")}</TooltipContent>
      </Tooltip>
    );
  }

  if (collapsed) {
    return mark;
  }

  return (
    <div className="flex-1 min-w-0 flex items-center gap-2">
      {mark}
      <h2 className="font-semibold text-base truncate">{name}</h2>
    </div>
  );
}

function SearchTrigger({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick(): void;
}) {
  const { t } = useTranslation();
  const isMac = navigator.platform.toUpperCase().includes("MAC");

  if (collapsed) {
    return (
      <MenuItem
        collapsed
        icon={<PiMagnifyingGlassBold />}
        label={t("palette.open")}
        title={t("palette.open")}
        onClick={onClick}
      />
    );
  }

  return (
    <button
      type="button"
      title={t("palette.open")}
      onClick={onClick}
      className="w-full h-8 flex items-center gap-2 rounded-md border bg-background shadow-xs px-2.5 text-sm text-muted-foreground hover:border-ring hover:text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer"
    >
      <PiMagnifyingGlassBold className="shrink-0" />
      <span className="flex-1 text-left truncate">{t("palette.open")}</span>
      <kbd className="inline-flex items-center gap-0.5 rounded-sm border bg-background px-1 font-sans text-[11px] font-medium text-muted-foreground">
        {isMac ? (
          <>
            <TbCommand />
            <span>K</span>
          </>
        ) : (
          "Ctrl K"
        )}
      </kbd>
    </button>
  );
}

/**
 * A model group: a heading with the models under it. It starts open
 * unless configured collapsed, and the group of the current model opens
 * whenever that model changes; a click on the heading toggles it.
 */
function MenuSection({
  group,
  collapsed,
  active,
  children,
}: {
  group: ModelGroup;
  collapsed: boolean;
  active: boolean;
  children: React.ReactElement[];
}) {
  const [expandedByUser, setExpandedByUser] = useState<boolean | null>(null);
  // Becoming the active group reopens it, also after a manual close:
  // state adjusted during render, as React advises for derived resets.
  const [wasActive, setWasActive] = useState(active);

  if (active !== wasActive) {
    setWasActive(active);

    if (active) {
      setExpandedByUser(null);
    }
  }

  const expanded = expandedByUser ?? (active || !group.collapsed);

  if (collapsed) {
    return (
      <div className="pt-2 mt-2 border-t border-sidebar-border space-y-0.5">
        {children}
      </div>
    );
  }

  return (
    <div className="pt-3">
      <button
        type="button"
        className="group/heading w-full h-7 px-2 flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer"
        aria-expanded={expanded}
        onClick={() => setExpandedByUser(!expanded)}
      >
        <span className="flex-1 text-left truncate first-letter:uppercase">
          {group.label}
        </span>
        {expanded ? (
          <PiCaretDownBold className="size-3 opacity-0 group-hover/heading:opacity-100 group-focus-visible/heading:opacity-100 transition-opacity" />
        ) : (
          <PiCaretRightBold className="size-3" />
        )}
      </button>
      {expanded && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

/**
 * A MainMenuButton extension: runs the button's handle() on the server,
 * confirming first when it asks to, and shows its result.
 */
function MenuButton({
  extension,
  collapsed,
}: {
  extension: MainMenuButtonExtension;
  collapsed: boolean;
}) {
  const http = useHttp();
  const { extension_id, config } = extension;
  const run = useCallback(async () => {
    const { data } = await http.post<ButtonResult>(
      `/extensions/${extension_id}/run`,
    );

    return data;
  }, [http, extension_id]);
  const { trigger, isPending } = useRunButton({ confirm: config.confirm, run });

  return (
    <MenuItem
      collapsed={collapsed}
      icon={
        isPending ? (
          <Spinner className="size-3" />
        ) : (
          <span className={config.icon ?? undefined} />
        )
      }
      label={config.label}
      disabled={isPending}
      onClick={trigger}
    />
  );
}

function MenuItem({
  label,
  icon,
  to,
  collapsed,
  disabled,
  title,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode | string;
  to?: Partial<Path> | string;
  collapsed: boolean;
  disabled?: boolean;
  title?: string;
  onClick?(): void;
}) {
  const Comp = to ? Link : "button";
  const match = useMatch(`${to ?? ""}`);
  const active = !R.isNil(to) && !!match;

  const item = (
    <Comp
      // @ts-expect-error due to mixed component
      to={to ?? undefined}
      type={to ? undefined : "button"}
      title={title}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center h-8 rounded-md text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer disabled:opacity-50",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
        collapsed ? "w-9 mx-auto justify-center" : "w-full px-2 gap-2.5",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {icon && (
        <span
          className={cn(
            "shrink-0 flex items-center justify-center size-4 [&_svg]:size-4 text-base leading-none",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {typeof icon === "string" ? <span className={cn(icon)} /> : icon}
        </span>
      )}
      {!collapsed && (
        <span className="flex-1 truncate text-left first-letter:uppercase">
          {label}
        </span>
      )}
    </Comp>
  );

  if (!collapsed) {
    return item;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        <span className="first-letter:uppercase">{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { data: me } = useMe();
  const { data: adminInfo } = useAdminInfo();
  const { data: discover } = useDiscover();
  const { theme, setTheme } = useTheme();

  if (!me) {
    return null;
  }

  const name = `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim();
  const initials =
    `${me.first_name ?? ""}${me.last_name ?? ""}${me.username ?? ""}`
      .trim()
      .replace(/\s/g, "")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="p-2 border-t border-sidebar-border">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent",
            collapsed
              ? "size-9 mx-auto justify-center"
              : "w-full gap-2.5 h-10 px-2 text-left",
          )}
          aria-label={collapsed ? name || me.username : undefined}
        >
          <UserAvatar
            name={name || me.username}
            initials={initials}
            className="size-7 [&_[data-slot=avatar-fallback]]:text-[11px]"
          />
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate leading-tight">
                  {name || me.username}
                </div>
                {name && (
                  <div className="text-[11px] text-muted-foreground truncate leading-tight">
                    {me.username}
                  </div>
                )}
              </div>
              <PiCaretUpDownBold className="size-3.5 text-muted-foreground shrink-0" />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          className={cn(
            "p-0",
            !collapsed && "w-(--radix-dropdown-menu-trigger-width)",
          )}
        >
          <div className="px-3 py-2.5 border-b leading-tight">
            <div className="font-semibold">{name || me.username}</div>
            {name && (
              <div className="text-xs text-muted-foreground">{me.username}</div>
            )}
          </div>
          <div className="p-1">
            <div className="flex items-center justify-between gap-2 pl-2 pr-1 py-1 text-sm">
              <span>{t("main_menu.theme")}</span>
              <ToggleGroup
                type="single"
                value={theme}
                size="sm"
                variant="outline"
                onValueChange={(value) => {
                  if (value) {
                    setTheme(value as Theme);
                  }
                }}
              >
                <ToggleGroupItem
                  value="system"
                  aria-label={t("palette.theme_system")}
                >
                  <LuMonitorCog />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="light"
                  aria-label={t("palette.theme_light")}
                >
                  <LuSun />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="dark"
                  aria-label={t("palette.theme_dark")}
                >
                  <LuMoon />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              {t("main_menu.log_out")}
              <PiSignOutBold />
            </DropdownMenuItem>
          </div>
          {adminInfo && (
            <div className="px-3 py-2 bg-muted border-t text-xs text-muted-foreground flex items-center justify-between gap-2 cursor-default">
              <span className="truncate">{adminInfo.site_title}</span>
              {discover?.version && <span>{`v${discover.version}`}</span>}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
