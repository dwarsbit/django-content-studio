import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useHttp } from "@/hooks/use-http";
import type { MediaItem } from "@/types";

export function useCreateMedia() {
  const queryClient = useQueryClient();
  const http = useHttp();

  return useMutation({
    mutationKey: ["media-library", "items"],
    async mutationFn({
      folder,
      name,
      file,
      type,
      onProgress,
    }: {
      folder: string | null;
      name: string;
      file: File;
      type: string;
      /** Upload progress, 0-100. */
      onProgress?(progress: number): void;
    }) {
      const { data } = await http.postForm<MediaItem>(
        "/media-library/items",
        {
          folder,
          name,
          file,
          type,
        },
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          onUploadProgress: (event) => {
            if (event.total) {
              onProgress?.(Math.round((event.loaded / event.total) * 100));
            }
          },
        },
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
