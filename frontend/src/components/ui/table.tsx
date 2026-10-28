import * as React from "react";

import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table
      data-slot="table"
      className={cn("w-full caption-bottom", className)}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-muted [&_tr:hover]:bg-transparent", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({
  className,
  onClick,
  ...props
}: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      onClick={onClick}
      className={cn(
        {
          "hover:bg-muted data-[state=selected]:bg-accent [&_td]:cursor-pointer border-b last-of-type:border-b-0":
            onClick,
        },
        className,
      )}
      {...props}
    />
  );
}

function TableHead({
  className,
  children,
  ...props
}: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "first-of-type:[&_div]:pl-4 last-of-type:[&_div]:pr-4 text-muted-foreground cursor-default text-sm font-medium text-left align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    >
      {/* Labels come from verbose_name, lowercase in Django: the first
          letter is capitalized here. */}
      <div className="border-b h-10 px-2 flex items-center first-letter:uppercase">
        {children}
      </div>
    </th>
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-11 px-2 py-1.5 first-of-type:pl-4 last-of-type:pr-4 align-middle cursor-default whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
