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
  value?: CropValue[];
  onChange?(crop: CropValue[]): void;
  image: string;
  className?: string;
}) {
  return (
    <ReactCrop
      ruleOfThirds
      crop={
        value?.[0] && {
          ...value[0],
          x: Number(value[0].x),
          y: Number(value[0].y),
          width: Number(value[0].width),
          height: Number(value[0].height),
        }
      }
      className="w-full"
      onChange={(_, p) =>
        onChange?.([
          R.evolve({
            x: (n) => n.toFixed(2),
            y: (n) => n.toFixed(2),
            width: (n) => n.toFixed(2),
            height: (n) => n.toFixed(2),
          })(p),
        ])
      }
    >
      <img alt="" src={image} className={cn("w-full rounded", className)} />
    </ReactCrop>
  );
}
