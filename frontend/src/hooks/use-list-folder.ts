import { useQuery } from "@tanstack/react-query";

import { useHttp } from "@/hooks/use-http";
import type { PaginatedResponse } from "@/types";

export function useListFolder({
  parent,
  page,
  limit = 10,
}: {
  parent: string | null;
  page?: number;
  limit?: number;
}) {
  const http = useHttp();

  return useQuery({
    retry: false,
    refetchOnWindowFocus: true,
    queryKey: ["media-library", "folders", parent, page, limit],
    async queryFn() {
      const { data } = await http.get<
        PaginatedResponse<{
          id: string;
          name: string;
          parent: string | null;
          has_children: boolean;
        }>
      >(`/media-library/folders`, {
        params: {
          parent,
          page,
          limit,
        },
      });
      return data;
    },
  });
}
