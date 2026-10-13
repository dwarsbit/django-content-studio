import { useQuery } from "@tanstack/react-query";
import * as R from "ramda";

import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";

/**
 * The unique tags currently on the media items — the options for the
 * tags filter.
 */
export function useMediaTags() {
  const http = useHttp();
  const { data: discover } = useDiscover();
  const model = discover?.media_library.models.media_model;

  return useQuery({
    retry: false,
    enabled: !R.isNil(model),
    queryKey: ["media-library", "tags"],
    async queryFn() {
      const { data } = await http.get<string[]>("/media-library/items/tags");

      return data;
    },
  });
}
