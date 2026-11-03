import React from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";
import ThemedImage from "@theme/ThemedImage";

/**
 * A screenshot of the showcase demo in static/img/screenshots, in the
 * reader's color mode: `<name>-light.webp` or `<name>-dark.webp`.
 */
export default function Screenshot({
  name,
  alt,
}: {
  name: string;
  alt: string;
}): React.JSX.Element {
  const light = useBaseUrl(`/img/screenshots/${name}-light.webp`);
  const dark = useBaseUrl(`/img/screenshots/${name}-dark.webp`);

  return (
    <figure className="screenshot">
      <ThemedImage
        alt={alt}
        sources={{ light, dark }}
        width={1568}
        height={1080}
        loading="lazy"
        decoding="async"
      />
    </figure>
  );
}
