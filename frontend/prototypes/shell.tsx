// The app shell: the main menu on the left and the page on the right.
import { type ReactNode, useState } from "react";
import {
  PiArrowSquareOutBold,
  PiBroomBold,
  PiCaretDownBold,
  PiCaretRightBold,
  PiCaretUpDownBold,
  PiCheckBold,
  PiHouseSimpleBold,
  PiImageBold,
  PiMagnifyingGlassBold,
  PiMonitorBold,
  PiMoonBold,
  PiPlusBold,
  PiSidebarSimpleBold,
  PiSignOutBold,
  PiSunBold,
} from "react-icons/pi";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useNarrow, usePrototype } from "./app";
import { Kbd } from "./components";
import { me, type MenuGroup, menuGroups, tenants } from "./data";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full flex items-stretch bg-background">
      <MainMenu />
      <main className="relative flex-1 min-w-0 flex flex-col overflow-hidden bg-background">
        {children}
      </main>
    </div>
  );
}

function MainMenu() {
  const { settings, update, screen } = usePrototype();
  // Narrow viewports always get the rail; the toggle applies above.
  const narrow = useNarrow();
  const collapsed = narrow || settings.menu === "collapsed";

  return (
    <nav
      aria-label="Main menu"
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
        {settings.tenant ? (
          <TenantSwitch collapsed={collapsed} />
        ) : (
          <Brand collapsed={collapsed} />
        )}
        {!collapsed && !narrow && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                aria-label="Collapse menu"
                onClick={() => update({ menu: "collapsed" })}
              >
                <PiSidebarSimpleBold />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Collapse menu</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div
        className={cn(
          "flex-1 min-h-0 overflow-y-auto scrollbar px-2 pb-2 space-y-0.5",
        )}
      >
        <SearchTrigger collapsed={collapsed} />
        <div className="h-2" />
        <MenuItem
          collapsed={collapsed}
          icon={<PiHouseSimpleBold />}
          label="Dashboard"
          href="#/"
          active={screen === "dashboard"}
        />
        <MenuItem
          collapsed={collapsed}
          icon={<PiImageBold />}
          label="Media library"
          href="#/media-library"
          active={screen === "media"}
        />
        <MenuItem
          collapsed={collapsed}
          icon={<PiArrowSquareOutBold />}
          label="View site"
          href="#/"
          trailing={<span className="sr-only">Opens in a new tab</span>}
        />
        <MenuItem
          collapsed={collapsed}
          icon={<PiBroomBold />}
          label="Clear cache"
        />

        {menuGroups.map((group) => (
          <MenuSection
            key={group.label}
            group={group}
            collapsed={collapsed}
            activeHref={
              screen === "list" || screen === "edit"
                ? "#/content/articles"
                : null
            }
          />
        ))}
      </div>

      <UserMenu collapsed={collapsed} />
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  const { update } = usePrototype();
  const narrow = useNarrow();
  const mark = (
    <div className="size-6 shrink-0 rounded-md bg-gradient-to-tl from-gray-900 to-gray-600 dark:from-gray-100 dark:to-gray-400 text-gray-50 dark:text-gray-900 flex items-center justify-center text-xs font-black">
      C
    </div>
  );

  if (collapsed && narrow) {
    return mark;
  }

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Expand menu"
            className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer"
            onClick={() => update({ menu: "expanded" })}
          >
            {mark}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Expand menu</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex items-center gap-2">
      {mark}
      <div className="font-semibold text-base truncate">Content Studio</div>
    </div>
  );
}

function TenantSwitch({ collapsed }: { collapsed: boolean }) {
  const [tenant, setTenant] = useState(tenants[0]);

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent",
          collapsed
            ? "size-8 justify-center"
            : "flex-1 min-w-0 gap-2 h-9 -ml-2 px-2",
        )}
      >
        <Avatar className="size-6 rounded-md">
          <AvatarFallback className="rounded-md bg-primary text-primary-foreground text-xs">
            {tenant[0]}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <div className="font-semibold truncate leading-tight">
                {tenant}
              </div>
              <div className="text-[11px] text-muted-foreground leading-tight">
                Tenant
              </div>
            </div>
            <PiCaretUpDownBold className="size-3.5 text-muted-foreground shrink-0" />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="p-0 w-56" side="bottom" align="start">
        <Command>
          <CommandInput placeholder="Find a tenant" />
          <CommandList>
            <CommandGroup>
              {tenants.map((name) => (
                <CommandItem
                  key={name}
                  value={name}
                  onSelect={() => setTenant(name)}
                >
                  <span className="flex-1">{name}</span>
                  {name === tenant && <PiCheckBold />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t p-1">
          <Button variant="ghost" size="sm" className="w-full justify-start">
            <PiPlusBold />
            Add tenant
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SearchTrigger({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <MenuItem collapsed icon={<PiMagnifyingGlassBold />} label="Search" />
    );
  }

  return (
    <button
      type="button"
      className="w-full h-8 flex items-center gap-2 rounded-md border bg-background shadow-xs px-2.5 text-sm text-muted-foreground hover:border-ring hover:text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer"
    >
      <PiMagnifyingGlassBold className="shrink-0" />
      <span className="flex-1 text-left">Search</span>
      <Kbd>⌘K</Kbd>
    </button>
  );
}

function MenuSection({
  group,
  collapsed,
  activeHref,
}: {
  group: MenuGroup;
  collapsed: boolean;
  activeHref: string | null;
}) {
  // A group can be configured to start collapsed (see data.ts).
  const [expanded, setExpanded] = useState(!group.collapsed);

  if (collapsed) {
    return (
      <div className="pt-2 mt-2 border-t border-sidebar-border space-y-0.5">
        {group.models.map((model) => (
          <MenuItem
            collapsed={collapsed}
            key={model.label}
            icon={<span className={model.icon} />}
            label={model.label}
            href={model.href}
            active={model.href === activeHref}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="pt-3">
      <button
        type="button"
        className="group/heading w-full h-7 px-2 flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex-1 text-left first-letter:uppercase">
          {group.label}
        </span>
        {expanded ? (
          <PiCaretDownBold className="size-3 opacity-0 group-hover/heading:opacity-100 transition-opacity" />
        ) : (
          <PiCaretRightBold className="size-3" />
        )}
      </button>
      {expanded && (
        <div className="space-y-0.5">
          {group.models.map((model) => (
            <MenuItem
              collapsed={collapsed}
              key={model.label}
              icon={<span className={model.icon} />}
              label={model.label}
              href={model.href}
              active={model.href === activeHref}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  collapsed,
  icon,
  iconClassName,
  label,
  href,
  active,
  trailing,
}: {
  icon: ReactNode;
  iconClassName?: string;
  label: string;
  href?: string;
  active?: boolean;
  trailing?: ReactNode;
  collapsed: boolean;
}) {
  const Comp = href ? "a" : "button";
  const item = (
    <Comp
      href={href}
      type={href ? undefined : "button"}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center h-8 rounded-md text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
        collapsed ? "w-9 mx-auto justify-center" : "w-full px-2 gap-2.5",
      )}
    >
      <span
        className={cn(
          "shrink-0 flex items-center justify-center size-4 [&_svg]:size-4 text-base leading-none",
          active ? "text-foreground" : "text-muted-foreground",
          iconClassName,
        )}
      >
        {icon}
      </span>
      {!collapsed && (
        <span className="flex-1 truncate text-left first-letter:uppercase">
          {label}
        </span>
      )}
      {!collapsed && trailing}
    </Comp>
  );

  if (!collapsed) {
    return item;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { settings, update } = usePrototype();

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
          aria-label={collapsed ? me.name : undefined}
        >
          <Avatar className="size-7">
            <AvatarFallback className="text-[11px] font-semibold bg-secondary text-secondary-foreground">
              {me.initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate leading-tight">
                  {me.name}
                </div>
                <div className="text-[11px] text-muted-foreground truncate leading-tight">
                  {me.username}
                </div>
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
            <div className="font-semibold">{me.name}</div>
            <div className="text-xs text-muted-foreground">
              leon@dwarsbit.nl
            </div>
          </div>
          <div className="p-1">
            <div className="flex items-center justify-between gap-2 pl-2 pr-1 py-1 text-sm">
              <span>Theme</span>
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={settings.theme}
                onValueChange={(value) =>
                  value && update({ theme: value as "light" | "dark" })
                }
              >
                <ToggleGroupItem value="system" aria-label="System">
                  <PiMonitorBold />
                </ToggleGroupItem>
                <ToggleGroupItem value="light" aria-label="Light">
                  <PiSunBold />
                </ToggleGroupItem>
                <ToggleGroupItem value="dark" aria-label="Dark">
                  <PiMoonBold />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              Log out
              <PiSignOutBold />
            </DropdownMenuItem>
          </div>
          <div className="px-3 py-2 bg-muted border-t text-xs text-muted-foreground flex items-center justify-between">
            <span>Content Studio</span>
            <span>v1.1.0</span>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
