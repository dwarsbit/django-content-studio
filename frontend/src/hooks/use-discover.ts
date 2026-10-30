import { useQuery } from "@tanstack/react-query";

import { useHttp } from "@/hooks/use-http";
import type { Dashboard, Extension, Model, ModelGroup } from "@/types";

export function useDiscover() {
  const http = useHttp();

  return useQuery({
    retry: false,
    staleTime: Infinity,
    queryKey: ["model-groups"],
    async queryFn() {
      const { data } = await http.get<{
        version: string;
        dashboard: Dashboard;
        extensions: Extension[];
        model_groups: ModelGroup[];
        models: Model[];
        user_model: string;
        multitenancy: {
          enabled: boolean;
          tenant_model: string | null;
        };
        media_library: {
          enabled: boolean;
          folders: boolean;
          // Offered when the admin site defines crop_image.
          crop: boolean;
          // The media item attribute holding the focal point; null
          // disables the focal point editor.
          focal_point: string | null;
          // The media item attribute holding the metadata read from its
          // file (MediaMetadata); null when off.
          metadata?: string | null;
          models: {
            media_model: string | null;
            folder_model: string | null;
          };
        };
      }>("/discover");

      return data;
    },
  });
}
