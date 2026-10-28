// Shared prototype pieces: the patterns that recur on more than one screen.
// Each is a candidate for src/components once the design settles.
import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";
import { type ReactNode, useState } from "react";
import {
  PiCaretDownBold,
  PiCheckBold,
  PiMagnifyingGlassBold,
  PiMinusBold,
  PiXBold,
} from "react-icons/pi";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import { type ArticleStatus, STATUS_LABELS, type User } from "./data";

/**
 * The page header: one 56px bar on every page, with the title on the
 * left and the page's actions on the right. Pages add a toolbar row
 * below it through `children`.
 */
export function PageHeader({
  back,
  icon,
  title,
  meta,
  actions,
  children,
}: {
  back?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="shrink-0 border-b bg-background z-10">
      <div className="h-14 px-6 flex items-center gap-3 max-w-[1280px] mx-auto w-full">
        {back}
        {icon && (
          <span className="size-7 shrink-0 rounded-md border bg-muted text-muted-foreground flex items-center justify-center [&_svg]:size-4 [&_span]:text-base">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <h1 className="text-base font-semibold truncate first-letter:uppercase">
            {title}
          </h1>
          {meta}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {children}
    </header>
  );
}

/**
 * Scope tabs under the page title: the places a list can be, such as
 * the list itself and its trash. Navigation, not an action, so it is
 * not a button next to "Create".
 */
export function HeaderTabs({
  tabs,
  current,
}: {
  tabs: { label: string; count?: number; href: string }[];
  current: string;
}) {
  return (
    <nav aria-label="Scope" className="border-b">
      <div className="px-6 flex items-center gap-5 max-w-[1280px] mx-auto w-full">
        {tabs.map((tab) => {
          const active = tab.href === current;
          return (
            <a
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 -mb-px border-b-2 px-0.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring rounded-t-sm",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count != null && (
                <span className="rounded-sm bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                  {tab.count}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

/** A toolbar row under the page header: search, filters, view toggles. */
export function Toolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b bg-background", className)}>
      <div className="px-6 py-2.5 flex items-center gap-2 flex-wrap max-w-[1280px] mx-auto w-full">
        {children}
      </div>
    </div>
  );
}

/** The scrolling page body, capped at the content width. */
export function PageBody({
  children,
  className,
  wide,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar">
      <div
        className={cn(
          "mx-auto w-full px-6 py-6",
          wide ? "max-w-none" : "max-w-[1280px]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SearchInput({
  placeholder = "Search",
  className,
  defaultValue,
}: {
  placeholder?: string;
  className?: string;
  defaultValue?: string;
}) {
  return (
    <InputGroup className={cn("h-8 w-64", className)}>
      <InputGroupAddon>
        <PiMagnifyingGlassBold className="text-muted-foreground" />
      </InputGroupAddon>
      <InputGroupInput placeholder={placeholder} defaultValue={defaultValue} />
    </InputGroup>
  );
}

/**
 * A filter chip: closed it names the field, open it lists the options;
 * with a value it reads "Field: value" and offers clearing.
 */
export function FilterChip({
  label,
  value,
  options = [],
  onClear,
}: {
  label: string;
  value?: string;
  options?: string[];
  onClear?(): void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border text-sm font-medium whitespace-nowrap cursor-pointer select-none",
          "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring",
          value
            ? "bg-accent border-transparent text-foreground"
            : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50 shadow-xs",
        )}
      >
        <span className="first-letter:uppercase">{label}</span>
        {value ? (
          <>
            <span className="text-muted-foreground">is</span>
            <span>{value}</span>
            <span
              role="button"
              aria-label={`Clear ${label}`}
              className="-mr-1 ml-0.5 size-4 rounded-sm inline-flex items-center justify-center hover:bg-foreground/10"
              onClick={(event) => {
                event.stopPropagation();
                onClear?.();
              }}
            >
              <PiXBold className="size-3" />
            </span>
          </>
        ) : (
          <PiCaretDownBold className="size-3 opacity-60" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            checked={option === value}
            onSelect={(event) => event.preventDefault()}
          >
            {option}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ViewToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange(value: T): void;
  options: { value: T; icon: ReactNode; label: string }[];
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={value}
      onValueChange={(next) => next && onChange(next as T)}
      aria-label="View"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.label}
          title={option.label}
          className="min-w-8"
        >
          {option.icon}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * The bulk bar: a floating pill above the bottom edge of the page while
 * rows are selected, so the toolbar and the table stay where they are.
 */
export function BulkBar({
  count,
  noun,
  actions,
  onClear,
}: {
  count: number;
  noun: string;
  actions: ReactNode;
  onClear(): void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-6">
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border bg-popover text-popover-foreground shadow-xl pl-3 pr-1.5 py-1.5">
        <span className="text-sm font-medium tabular-nums mr-2">
          {`${count} ${noun} selected`}
        </span>
        <div className="flex items-center gap-1">{actions}</div>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear selection"
          onClick={onClear}
        >
          <PiXBold />
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-6",
        className,
      )}
    >
      <div className="size-10 rounded-full bg-muted border flex items-center justify-center text-muted-foreground [&_svg]:size-5 mb-3">
        {icon}
      </div>
      <div className="font-semibold">{title}</div>
      {description && (
        <div className="text-muted-foreground mt-1 max-w-sm">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: ArticleStatus }) {
  return (
    <Badge variant="secondary" className="gap-1.5 pl-1.5">
      <span
        className={cn("size-1.5 rounded-full", {
          "bg-success": status === "published",
          "bg-warning": status === "review",
          "bg-muted-foreground/60": status === "draft",
        })}
      />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

/** A boolean in a table: a check or a dash, in the text color. */
export function BoolMark({ value }: { value: boolean }) {
  return value ? (
    <PiCheckBold className="size-4" aria-label="Yes" />
  ) : (
    <PiMinusBold className="size-4 text-muted-foreground/60" aria-label="No" />
  );
}

export function UserAvatar({
  user,
  className,
}: {
  user: User;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-6", className)}>
      <AvatarFallback className="text-[10px] font-semibold bg-secondary text-secondary-foreground">
        {user.initials}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Line tabs: an underline instead of the pill list, for switching the
 * sections of a page (the edit page's form groups and inlines).
 */
export function LineTabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsList
      className={cn(
        "h-auto w-full justify-start gap-5 rounded-none border-b bg-transparent p-0 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function LineTabsTrigger({
  className,
  count,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & { count?: number }) {
  return (
    <TabsTrigger
      className={cn(
        "h-auto flex-none rounded-none border-0 border-b-2 border-transparent px-0.5 pb-2.5 pt-1 -mb-px text-muted-foreground shadow-none",
        "hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:border-primary",
        className,
      )}
      {...props}
    >
      {children}
      {count != null && (
        <span className="ml-0.5 rounded-sm bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </TabsTrigger>
  );
}

/** A form field: label above the control, a hint below. */
export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="block text-sm font-medium leading-none first-letter:uppercase">
        {label}
        {required && (
          <span className="text-muted-foreground font-normal"> *</span>
        )}
      </label>
      {children}
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** A form set: a card with a small header and the fields below it. */
export function FormSetCard({
  title,
  description,
  actions,
  children,
  className,
  flush,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn("rounded-lg border bg-card shadow-xs", className)}>
      {(title || actions) && (
        <div className="flex items-center gap-3 px-5 py-3 border-b">
          <div className="flex-1 min-w-0">
            {title && <h2 className="font-semibold">{title}</h2>}
            {description && (
              <div className="text-muted-foreground text-xs">{description}</div>
            )}
          </div>
          {actions}
        </div>
      )}
      <div className={cn(!flush && "p-5 space-y-5")}>{children}</div>
    </section>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center gap-0.5 rounded-sm border bg-background px-1 font-sans text-[11px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

// The admin's Input is always controlled (an undefined value renders
// as ""), so a prototype field keeps its text in local state.
export function TextInput({
  initial = "",
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      {...props}
    />
  );
}

export function GroupTextInput({
  initial = "",
  ...props
}: Omit<React.ComponentProps<typeof InputGroupInput>, "value" | "onChange"> & {
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <InputGroupInput
      value={value}
      onChange={(event) => setValue(event.target.value)}
      {...props}
    />
  );
}
