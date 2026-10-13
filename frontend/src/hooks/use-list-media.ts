import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as R from "ramda";

import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import type { MediaItem, PaginatedResponse } from "@/types";

export function useListMedia({
  folder,
  page,
  search,
  searchInFolder,
  type,
  tags,
  ordering,
}: {
  folder?: string | null;
  page?: number;
  search?: string;
  searchInFolder?: boolean;
  type?: string;
  tags?: string;
  ordering?: string;
}) {
  const http = useHttp();
  const { data: discover } = useDiscover();
  const model = discover?.media_library.models.media_model;

  return useQuery({
    retry: false,
    enabled: !R.isNil(model),
    queryKey: [
      "media-library",
      "items",
      { folder, page, search, searchInFolder, type, tags, ordering },
    ],
    placeholderData: keepPreviousData,
    async queryFn() {
      const { data } = await http.get<PaginatedResponse<MediaItem>>(
        `/media-library/items`,
        {
          params: {
            // A global search ignores the current folder, like before.
            folder: searchInFolder || !search ? (folder ?? "root") : undefined,
            search: search || undefined,
            type: type || undefined,
            tags: tags || undefined,
            ordering: ordering || undefined,
            page,
          },
        },
      );

      return data;
    },
  });
}
