import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useHttp } from "@/hooks/use-http";

export function useDeleteMedia() {
  const queryClient = useQueryClient();
  const http = useHttp();

  return useMutation({
    async mutationFn(id: string) {
      await http.delete(`/media-library/items/${id}`);
    },
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["media-library", "items"],
      });
    },
  });
}
