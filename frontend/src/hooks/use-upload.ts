import * as R from "ramda";
import { useCallback } from "react";
import { toast } from "sonner";

import { useCreateMedia } from "@/hooks/use-create-media";
import { getErrorMessage } from "@/lib/utils";
import type { Id } from "@/types";

export function useUpload() {
  const { mutateAsync } = useCreateMedia();

  return useCallback(
    async (acceptedFiles: File[], folder: Id | null = null) => {
      return await Promise.all(
        acceptedFiles.map(async (f) => {
          try {
            const fileType = R.cond([
              [R.startsWith("image/"), R.always("image")],
              [R.startsWith("video/"), R.always("video")],
              [R.startsWith("audio/"), R.always("audio")],
              [R.T, R.always("file")],
            ])(f.type);

            return await mutateAsync({
              folder,
              name: f.name,
              file: f,
              type: fileType,
            });
          } catch (e) {
            toast.error(getErrorMessage(e));
          }
        }),
      );
    },
    [],
  );
}
