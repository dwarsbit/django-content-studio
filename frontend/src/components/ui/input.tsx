import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const inputVariants = cva("", {
  variants: {
    variant: {
      default: "border bg-background",
    },
    size: {
      sm: "h-7",
      default: "h-8",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

function Input({
  className,
  type,
  variant,
  size,
  value,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      value={value ?? ""}
      className={cn(
        "text-foreground text-sm file:text-foreground placeholder:text-muted-foreground flex h-7 w-full min-w-0 rounded-md px-3 py-1 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus:border-ring",
        "aria-invalid:focus:border-destructive",
        inputVariants({ variant, size, className }),
      )}
      {...props}
    />
  );
}

export { Input };
