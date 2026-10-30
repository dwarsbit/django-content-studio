import { useEffect, useState } from "react";

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * The natural size of the image at src, once it has loaded; null while
 * it loads, without a src, or when it fails to load.
 */
export function useImageSize(src: string | null): ImageSize | null {
  const [measured, setMeasured] = useState<
    (ImageSize & { src: string }) | null
  >(null);

  useEffect(() => {
    if (!src) {
      return;
    }

    const image = new Image();
    image.onload = () =>
      setMeasured({
        src,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    image.src = src;

    return () => {
      image.onload = null;
    };
  }, [src]);

  return measured && measured.src === src ? measured : null;
}

/** An aspect ratio like "21:9" as [width, height]; 16:9 when unset. */
export function parseAspectRatio(ratio: string | undefined): [number, number] {
  const [width, height] = (ratio ?? "").split(":").map(Number);

  return width > 0 && height > 0 ? [width, height] : [16, 9];
}
