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
        // The notifications app; absent from older servers.
        notifications?: {
          enabled: boolean;
          // Days read (and unread) notifications are kept; null: kept.
          retention: number | null;
          unread_retention: number | null;
          // Whether the site emails a digest of unread notifications.
          digest?: boolean;
        };
        multitenancy: {
          enabled: boolean;
          tenant_model: string | null;
        };
        media_library: {
          enabled: boolean;
          folders: boolean;
          // Offered when the admin site's crop_image hook can run: the
          // built-in one (with Pillow and metadata) or the site's own.
          crop: boolean;
          // Offered when the admin site's reset_crop hook can run.
          crop_reset?: boolean;
          // The media item attribute holding the properties editors set
          // (MediaProperties, such as the focal point); null when off.
          properties?: string | null;
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
