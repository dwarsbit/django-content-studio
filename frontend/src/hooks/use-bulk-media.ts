import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useHttp } from "@/hooks/use-http";

/**
 * The built-in bulk actions of the media library: delete the selected
 * items, or move them to a folder (null for the root). The endpoint
 * enforces the matching permissions per action.
 */
export function useBulkMedia() {
  const queryClient = useQueryClient();
  const http = useHttp();

  return useMutation({
    mutationKey: ["media-library", "items", "bulk"],
    async mutationFn({
      action,
      ids,
      folder,
    }: {
      action: "delete" | "move";
      ids: string[];
      /** The target folder of a move; null moves to the root. */
      folder?: string | null;
    }) {
      const { data } = await http.post<{ count: number }>(
        "/media-library/items/bulk",
        {
          action,
          ids,
          folder: folder ?? null,
        },
      );

      return data;
    },
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["media-library", "items"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["media-library", "folders"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["media-library", "tags"],
      });
    },
  });
}
