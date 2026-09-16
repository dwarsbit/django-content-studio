import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useHttp } from "@/hooks/use-http";
import type { Id } from "@/types";

export function useCreateFolder() {
  const http = useHttp();
  const queryClient = useQueryClient();

  return useMutation({
    async mutationFn({ parent, name }: { name: string; parent: Id | null }) {
      return http.post(`/media-library/folders`, { name, parent });
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
