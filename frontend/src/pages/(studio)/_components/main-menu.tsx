import * as R from "ramda";
import React, { createContext, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuMonitorCog, LuMoon, LuSun } from "react-icons/lu";
import {
  PiCaretDownBold,
  PiCaretLeftBold,
  PiCaretRightBold,
  PiFileTextBold,
  PiHouseSimpleBold,
  PiImageBold,
  PiSignOutBold,
} from "react-icons/pi";
import { Link, type Path, useMatch, useNavigate } from "react-router";

import { useAuth } from "@/auth";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAdminInfo } from "@/hooks/use-admin-info";
import { useDiscover } from "@/hooks/use-discover";
import { useMe } from "@/hooks/use-me";
import { cn } from "@/lib/utils";
import { useTenant } from "@/tenant";
import { ExtensionType, type TailwindColor } from "@/types";

import { TenantSelector } from "./tenant-selector";

const CollapsedContext = createContext(false);
const ExpandedContext = createContext<{
  expandedItem: string | null;
  setExpandedItem: (label: string | null) => void;
}>({ expandedItem: null, setExpandedItem: () => {} });

export function MainMenu() {
  const { t } = useTranslation();
  const { data: adminInfo } = useAdminInfo();
  const { data: discover } = useDiscover();
  const { enabled: tenant } = useTenant();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("main-menu-collapsed") === "true",
  );
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const linkExtensions =
    discover?.extensions.filter(
      R.whereEq({ extension_type: ExtensionType.MainMenuLink }),
    ) ?? [];

  useEffect(() => {
    localStorage.setItem("main-menu-collapsed", String(collapsed));
  }, [collapsed]);

  return (
    <ExpandedContext value={{ expandedItem, setExpandedItem }}>
      <CollapsedContext value={collapsed}>
        <nav
          className={cn(
            "shrink-0 flex flex-col bg-muted transition-[width] duration-200",
            collapsed ? "w-14" : "w-[240px]",
          )}
        >
          <div
            className={cn(
              "flex items-center py-3 select-none",
              collapsed ? "justify-center px-2" : "gap-2 px-4",
            )}
          >
            {!collapsed && adminInfo && !tenant && (
              <>
                <div className="bg-gradient-to-tl from-gray-900 to-gray-600 size-5 rounded flex items-center justify-center text-white font-black shrink-0">
                  {adminInfo.site_header[0]}
                </div>
                <h2 className="line-clamp-1 break-all text-base font-semibold text-foreground flex-1">
                  {adminInfo.site_header}
                </h2>
              </>
            )}
            {!collapsed && tenant && (
              <div className="flex-1">
                <TenantSelector />
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 size-7"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PiCaretRightBold /> : <PiCaretLeftBold />}
            </Button>
          </div>

          <div className="flex-1 px-2 pb-2 pt-4 space-y-1 overflow-y-auto scrollbar">
            <MenuItem
              to="/"
              color="slate"
              icon={<PiHouseSimpleBold />}
              label={t("main_menu.dashboard")}
            />
            {discover?.media_library.enabled && (
              <MenuItem
                to="/media-library"
                color="pink"
                icon={<PiImageBold />}
                label={t("main_menu.media_library")}
              />
            )}

            {linkExtensions.map(({ extension_id, config }) => (
              <MenuItem
                key={extension_id}
                to={config.url}
                color={config.color}
                icon={<span className={config.icon} />}
                label={config.label}
              />
            ))}

            <div className="h-4" role="separator" />

            {discover?.model_groups.map((group) => (
              <MenuItem
                key={group.name}
                color={group.color ?? "blue"}
                icon={group.icon ?? <PiFileTextBold />}
                label={group.label}
              >
                {group.models
                  .map((label) => {
                    const model = discover.models.find(R.whereEq({ label }));

                    return model ? (
                      <MenuItem
                        key={label}
                        isSubItem
                        to={
                          model.admin.is_singleton
                            ? { hash: `editor:${model.label}` }
                            : `/content/${model.label}`
                        }
                        label={model.verbose_name_plural}
                        icon={model.admin.icon ?? <PiFileTextBold />}
                      />
                    ) : null;
                  })
                  .filter((el) => !R.isNil(el))}
              </MenuItem>
            ))}
          </div>
          <UserMenu />
        </nav>
      </CollapsedContext>
    </ExpandedContext>
  );
}

const COLORS: Record<TailwindColor, string> = {
  slate: "bg-slate-200 text-slate-600",
  gray: "bg-gray-200 text-gray-600",
  zinc: "bg-zinc-200 text-zinc-600",
  neutral: "bg-neutral-200 text-neutral-600",
  stone: "bg-stone-200 text-stone-600",
  red: "bg-red-100 text-red-600",
  orange: "bg-orange-100 text-orange-600",
  amber: "bg-amber-100 text-amber-600",
  yellow: "bg-yellow-100 text-yellow-600",
  lime: "bg-lime-100 text-lime-600",
  green: "bg-green-100 text-green-600",
  emerald: "bg-emerald-100 text-emerald-600",
  teal: "bg-teal-100 text-teal-600",
  cyan: "bg-cyan-100 text-cyan-600",
  sky: "bg-sky-100 text-sky-600",
  blue: "bg-blue-100 text-blue-600",
  indigo: "bg-indigo-100 text-indigo-600",
  violet: "bg-violet-100 text-violet-600",
  purple: "bg-purple-100 text-purple-600",
  fuchsia: "bg-fuchsia-100 text-fuchsia-600",
  pink: "bg-pink-100 text-pink-600",
  rose: "bg-rose-100 text-rose-600",
  mauve: "bg-mauve-100 text-mauve-600",
  olive: "bg-olive-100 text-olive-600",
  mist: "bg-mist-100 text-mist-600",
  taupe: "bg-taupe-100 text-taupe-600",
};

function MenuItem({
  label,
  icon,
  to,
  color,
  children,
  isSubItem,
}: {
  label: string;
  isSubItem?: boolean;
  icon?: React.ReactNode | string;
  to?: Partial<Path> | string;
  color?: TailwindColor;
  children?: React.ReactElement[];
}) {
  const Comp = to ? Link : "button";
  const match = useMatch(`${to ?? ""}`);
  const menuCollapsed = useContext(CollapsedContext);
  const { expandedItem, setExpandedItem } = useContext(ExpandedContext);
  const expanded = expandedItem === label;

  const item = (
    <Comp
      // @ts-expect-error due to mixed component
      to={to ?? undefined}
      className={cn(
        "relative group flex items-center w-full font-medium gap-2.5 h-8 px-2 hover:bg-foreground/5 rounded hover:cursor-pointer",
        {
          "bg-foreground/5": !R.isNil(to) && match,
          "justify-center": menuCollapsed,
        },
      )}
      onClick={() => {
        if (children) {
          setExpandedItem(expanded ? null : label);
        }
      }}
    >
      {icon && (
        <span
          className={cn(
            "size-5 rounded flex items-center justify-center shrink-0",
            color ? COLORS[color] : "text-muted-foreground",
          )}
        >
          {typeof icon === "string" ? <span className={cn(icon)} /> : icon}
        </span>
      )}
      {!menuCollapsed && (
        <span
          className={cn(
            "flex items-center justify-between flex-1",
            isSubItem ? "text-muted-foreground" : "text-foreground",
          )}
        >
          <span className="first-letter:uppercase line-clamp-1 break-all">
            {label}
          </span>
          {children ? (
            <div className="group-hover:bg-foreground/5 p-1 rounded">
              {expanded ? <PiCaretDownBold /> : <PiCaretRightBold />}
            </div>
          ) : null}
        </span>
      )}
    </Comp>
  );

  return (
    <>
      {menuCollapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{item}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            <span className="first-letter:uppercase">{label}</span>
          </TooltipContent>
        </Tooltip>
      ) : (
        item
      )}
      {children && expanded ? (
        <div className={cn({ "pl-3": !menuCollapsed })}>{children}</div>
      ) : null}
    </>
  );
}

function UserMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setToken } = useAuth();
  const { data: me } = useMe();
  const { data: adminInfo } = useAdminInfo();
  const { theme, setTheme } = useTheme();
  const menuCollapsed = useContext(CollapsedContext);

  return (
    <div className="p-2">
      {me && (
        <DropdownMenu>
          <DropdownMenuContent
            side="top"
            align="start"
            className={cn(
              "p-0",
              !menuCollapsed && "w-(--radix-dropdown-menu-trigger-width)",
            )}
          >
            <div className="px-4 py-2 border-b leading-tight">
              <div className="text-foreground font-semibold">
                {`${me.first_name ?? ""} ${me.last_name ?? ""}`.trim()}
              </div>
              <div className="text-xs text-muted-foreground font-medium">
                {me.username}
              </div>
            </div>
            <div className="p-1.5">
              <DropdownMenuGroup>
                <div className="flex items-center justify-between pl-2">
                  <span>{t("main_menu.theme")}</span>
                  <ToggleGroup
                    type="single"
                    value={theme}
                    size="sm"
                    variant="outline"
                    onValueChange={(value) => {
                      if (value) {
                        setTheme(value);
                      }
                    }}
                  >
                    <ToggleGroupItem value="system">
                      <LuMonitorCog />
                    </ToggleGroupItem>
                    <ToggleGroupItem value="light">
                      <LuSun />
                    </ToggleGroupItem>
                    <ToggleGroupItem value="dark">
                      <LuMoon />
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setToken(null);
                    navigate("/login");
                  }}
                >
                  {t("main_menu.log_out")}
                  <PiSignOutBold />
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </div>
            {adminInfo && (
              <div className="px-4 py-2 bg-accent border-t cursor-default">
                <div className="text-xs font-medium text-foreground text-center">
                  {adminInfo.site_title}
                </div>
                <div className="text-xs font-medium text-gray-400 text-center">{`v${adminInfo.version}`}</div>
              </div>
            )}
          </DropdownMenuContent>
          <DropdownMenuTrigger
            className={cn(
              "flex items-center text-left w-full hover:bg-foreground/5 data-[state=open]:bg-foreground/5 p-2 rounded-md select-none hover:cursor-pointer",
              menuCollapsed ? "justify-center" : "gap-3",
            )}
          >
            <div className="relative rounded-full size-8 bg-indigo-500 text-indigo-100 flex items-center justify-center font-bold shrink-0 text-xs">
              {`${me.first_name ?? ""}${me.last_name ?? ""}${me.username ?? ""}`
                .trim()
                .replace(/\s/g, "")
                .slice(0, 2)
                .toUpperCase()}
              <div className="bg-emerald-500 size-2 rounded-full absolute bottom-px right-px" />
            </div>
            {!menuCollapsed && (
              <div>
                <div className="text-foreground truncate text-sm/tight font-medium">
                  {`${me.first_name ?? ""} ${me.last_name ?? ""}`.trim()}
                </div>
                <div className="text-xs/tight text-muted-foreground">
                  {me.username}
                </div>
              </div>
            )}
          </DropdownMenuTrigger>
        </DropdownMenu>
      )}
    </div>
  );
}
