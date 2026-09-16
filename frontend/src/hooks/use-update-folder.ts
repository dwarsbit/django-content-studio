import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useHttp } from "@/hooks/use-http";

export function useUpdateFolder() {
  const http = useHttp();
  const queryClient = useQueryClient();

  return useMutation({
    async mutationFn({ id, name }: { id: string; name: string }) {
      return http.put(`/media-library/folders/${id}`, { name });
    },
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["media-library", "folders"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["media-library", "folder-path"],
      });
    },
  });
}
