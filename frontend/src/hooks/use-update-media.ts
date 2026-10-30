import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as R from "ramda";

import { useHttp } from "@/hooks/use-http";
import type { MediaItem } from "@/types";

export function useUpdateMedia() {
  const queryClient = useQueryClient();
  const http = useHttp();

  return useMutation({
    // A partial item updates only the given fields.
    async mutationFn(values: Pick<MediaItem, "id"> & Partial<MediaItem>) {
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
      await queryClient.invalidateQueries({
        queryKey: ["media-library", "tags"],
      });
    },
  });
}
