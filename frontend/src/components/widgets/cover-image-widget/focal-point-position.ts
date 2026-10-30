import type { FocalPointValue } from "@/types";

/** The CSS object-position for a focal point; unset is the center. */
export function focalPointPosition(point: FocalPointValue | null) {
  return point ? `${point.x}% ${point.y}%` : "50% 50%";
}
