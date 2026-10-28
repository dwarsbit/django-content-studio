import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  // "line": an underline under the active tab, left-aligned on a
  // hairline, for the sections of a page. The default is the pill list.
  variant?: "default" | "line";
}) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        "group/tabs bg-accent text-accent-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        variant === "line" &&
          "h-auto w-full justify-start gap-5 rounded-none border-b bg-transparent p-0 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // The line variant: an underline instead of the pill.
        "group-data-[variant=line]/tabs:h-auto group-data-[variant=line]/tabs:flex-none group-data-[variant=line]/tabs:rounded-none group-data-[variant=line]/tabs:border-0 group-data-[variant=line]/tabs:border-b-2 group-data-[variant=line]/tabs:border-transparent group-data-[variant=line]/tabs:-mb-px group-data-[variant=line]/tabs:px-0.5 group-data-[variant=line]/tabs:pt-1 group-data-[variant=line]/tabs:pb-2.5 group-data-[variant=line]/tabs:text-muted-foreground group-data-[variant=line]/tabs:shadow-none group-data-[variant=line]/tabs:hover:text-foreground",
        "group-data-[variant=line]/tabs:data-[state=active]:border-primary group-data-[variant=line]/tabs:data-[state=active]:bg-transparent group-data-[variant=line]/tabs:data-[state=active]:text-foreground group-data-[variant=line]/tabs:data-[state=active]:shadow-none dark:group-data-[variant=line]/tabs:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs:data-[state=active]:border-primary",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
