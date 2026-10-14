import "react-image-crop/dist/ReactCrop.css";

import * as R from "ramda";
import ReactCrop from "react-image-crop";

import { cn } from "@/lib/utils";
import type { CropValue } from "@/types";

export function CropField({
  value,
  onChange,
  image,
  className,
}: {
  // A pending crop selection; undefined leaves the image uncropped.
  value?: CropValue;
  onChange?(crop: CropValue | undefined): void;
  image: string;
  className?: string;
}) {
  return (
    <ReactCrop
      ruleOfThirds
      crop={
        value && {
          ...value,
          x: Number(value.x),
          y: Number(value.y),
          width: Number(value.width),
          height: Number(value.height),
        }
      }
      className="w-full"
      onChange={(_, p) =>
        onChange?.(
          p
            ? R.evolve({
                x: (n) => n.toFixed(2),
                y: (n) => n.toFixed(2),
                width: (n) => n.toFixed(2),
                height: (n) => n.toFixed(2),
              })(p)
            : undefined,
        )
      }
    >
      <img alt="" src={image} className={cn("w-full rounded", className)} />
    </ReactCrop>
  );
}
