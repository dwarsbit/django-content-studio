import { useQuery } from "@tanstack/react-query";

import { useHttp } from "@/hooks/use-http";
import type { MediaFolder, PaginatedResponse } from "@/types";

export function useListFolder({
  parent,
  page,
  limit = 10,
  enabled = true,
}: {
  parent: string | null;
  page?: number;
  limit?: number;
  /** Lets a collapsed tree node wait with loading its children. */
  enabled?: boolean;
}) {
  const http = useHttp();

  return useQuery({
    retry: false,
    refetchOnWindowFocus: true,
    enabled,
    queryKey: ["media-library", "folders", parent, page, limit],
    async queryFn() {
      const { data } = await http.get<PaginatedResponse<MediaFolder>>(
        `/media-library/folders`,
        {
          params: {
            parent,
            page,
            limit,
          },
        },
      );
      return data;
    },
  });
}
