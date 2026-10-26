import { PiSquaresFourBold } from "react-icons/pi";

import { cn } from "@/lib/utils";

/** A block's Phosphor icon class, or a generic block icon. */
export function BlockIcon({
  icon,
  className,
}: {
  icon: string | null;
  className?: string;
}) {
  return icon ? (
    <span aria-hidden className={cn(icon, "text-base", className)} />
  ) : (
    <PiSquaresFourBold aria-hidden className={cn("size-4", className)} />
  );
}
