import * as R from "ramda";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useCreateMedia } from "@/hooks/use-create-media";
import { getErrorMessage } from "@/lib/utils";

/** One file in flight, rendered by the uploads panel. */
export interface UploadEntry {
  id: string;
  name: string;
  progress: number;
  done: boolean;
}

const file_type = R.cond([
  [R.startsWith("image/"), R.always("image")],
  [R.startsWith("video/"), R.always("video")],
  [R.startsWith("audio/"), R.always("audio")],
  [R.T, R.always("file")],
]);

/**
 * Uploads files to the media library with per-file progress, exposed
 * as entries for the uploads panel. Completed entries linger briefly,
 * then clear themselves.
 */
export function useMediaUpload(folder: string | null) {
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const { mutateAsync } = useCreateMedia();

  const update = (id: string, patch: Partial<UploadEntry>) =>
    setUploads((previous) =>
      previous.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );

  const start = useCallback(
    (files: File[]) => {
      files.forEach((file, index) => {
        const id = `${file.name}-${Date.now()}-${index}`;

        setUploads((previous) => [
          ...previous,
          { id, name: file.name, progress: 0, done: false },
        ]);

        mutateAsync({
          folder,
          name: file.name,
          file,
          type: file_type(file.type),
          onProgress: (progress) => update(id, { progress }),
        })
          .then(() => {
            update(id, { progress: 100, done: true });
            setTimeout(
              () =>
                setUploads((previous) =>
                  previous.filter((entry) => entry.id !== id),
                ),
              2000,
            );
          })
          .catch((e: unknown) => {
            toast.error(getErrorMessage(e));
            setUploads((previous) =>
              previous.filter((entry) => entry.id !== id),
            );
          });
      });
    },
    [folder, mutateAsync],
  );

  return { uploads, start };
}
