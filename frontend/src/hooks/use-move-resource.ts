import {
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { useHttp } from "@/hooks/use-http";
import { applyMove, type Move } from "@/lib/reorder";
import { getErrorMessage } from "@/lib/utils";
import type { Id, PaginatedResponse, Resource } from "@/types";

/**
 * Move a row of a reorderable list. The page in the cache (queryKey)
 * reorders right away and rolls back when the move fails; afterwards
 * every list of the model (invalidateKey) refetches.
 */
export function useMoveResource({
  endpoint,
  queryKey,
  invalidateKey,
}: {
  // The list endpoint, e.g. /content/blog.post.
  endpoint: string;
  queryKey: QueryKey;
  invalidateKey: QueryKey;
}) {
  const http = useHttp();
  const queryClient = useQueryClient();

  return useMutation({
    async mutationFn({ id, move }: { id: Id; move: Move }) {
      return http.post(`${endpoint}/${id}/move`, move);
    },
    async onMutate({ id, move }) {
      await queryClient.cancelQueries({ queryKey });

      const previous =
        queryClient.getQueryData<PaginatedResponse<Resource>>(queryKey);

      if (previous) {
        queryClient.setQueryData<PaginatedResponse<Resource>>(queryKey, {
          ...previous,
          results: applyMove(previous.results, id, move),
        });
      }

      return { previous };
    },
    onError(error, _variables, context) {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }

      toast.error(getErrorMessage(error));
    },
    async onSettled() {
      await queryClient.invalidateQueries({ queryKey: invalidateKey });
    },
  });
}
