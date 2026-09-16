import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as R from "ramda";

import { useHttp } from "@/hooks/use-http";
import type { MediaItem } from "@/types";

export function useUpdateMedia() {
  const queryClient = useQueryClient();
  const http = useHttp();

  return useMutation({
    async mutationFn(values: MediaItem) {
      const { data } = await http.patch<MediaItem>(
        `/media-library/items/${values.id}`,
        R.omit(["file"], values),
      );

      return data;
    },
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["media-library", "items"],
      });
    },
  });
}
