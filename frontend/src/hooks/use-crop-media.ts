import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useHttp } from "@/hooks/use-http";
import type { CropValue, MediaItem } from "@/types";

export function useCropMedia() {
  const queryClient = useQueryClient();
  const http = useHttp();

  return useMutation({
    async mutationFn({ id, crop }: { id: string; crop: CropValue }) {
      const { data } = await http.post<MediaItem>(
        `/media-library/items/${id}/crop`,
        { crop },
      );

      return data;
    },
    async onSuccess(data, variables) {
      queryClient.setQueryData(["media-library", "items", variables.id], data);
      await queryClient.invalidateQueries({
        queryKey: ["media-library", "items"],
      });
    },
  });
}

/** Puts a cropped image's original back in place of its crop. */
export function useResetCrop() {
  const queryClient = useQueryClient();
  const http = useHttp();

  return useMutation({
    async mutationFn(id: string) {
      const { data } = await http.delete<MediaItem>(
        `/media-library/items/${id}/crop`,
      );

      return data;
    },
    async onSuccess(data, id) {
      queryClient.setQueryData(["media-library", "items", id], data);
      await queryClient.invalidateQueries({
        queryKey: ["media-library", "items"],
      });
    },
  });
}
