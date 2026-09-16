import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useHttp } from "@/hooks/use-http";

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
    }: {
      folder: string | null;
      name: string;
      file: File;
      type: string;
    }) {
      const { data } = await http.postForm(
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
        },
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
