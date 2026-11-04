import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/ui/spinner";
import { useDebounced } from "@/hooks/use-debounced";
import { useHttp } from "@/hooks/use-http";
import type {
  EmbedPreview,
  PlaceholderWidgetOptions,
  WidgetProps,
} from "@/types";

import { URLWidget } from "./typed-input-widgets";

// How long typing may pause before the preview is asked for.
const PREVIEW_DEBOUNCE_MS = 500;

type EmbedWidgetProps = WidgetProps<string | null, PlaceholderWidgetOptions> & {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/**
 * A URL of a video, song or post on an oEmbed provider, with a
 * preview (the title and thumbnail) the server fetches from the
 * provider. The value stays the URL as typed.
 */
export function EmbedWidget(props: EmbedWidgetProps) {
  const { t } = useTranslation();
  const http = useHttp();
  const url = (props.value ?? "").trim();
  const debounced = useDebounced(url, PREVIEW_DEBOUNCE_MS);
  const canPreview = /^https?:\/\/\S+$/i.test(debounced);
  const { data, error, isFetching } = useQuery({
    queryKey: ["oembed", debounced],
    enabled: canPreview,
    retry: false,
    staleTime: Infinity,
    async queryFn() {
      const { data } = await http.get<EmbedPreview>("/oembed", {
        params: { url: debounced },
      });

      return data;
    },
  });
  const notFound = axios.isAxiosError(error) && error.response?.status === 404;

  return (
    <div data-slot="embed-widget" className="space-y-2">
      <URLWidget {...props} />
      {canPreview &&
        (isFetching ? (
          <div
            aria-busy="true"
            className="flex h-12 items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner />
            {t("widgets.embed_widget.loading")}
          </div>
        ) : error ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notFound
              ? t("widgets.embed_widget.no_preview")
              : t("widgets.embed_widget.load_error")}
          </p>
        ) : data ? (
          <EmbedPreviewCard preview={data} />
        ) : null)}
    </div>
  );
}

function EmbedPreviewCard({ preview }: { preview: EmbedPreview }) {
  const meta = [preview.provider, preview.author].filter(Boolean).join(" · ");

  return (
    <div
      data-testid="embed-preview"
      className="flex items-center gap-3 rounded-md border bg-muted/40 p-2 text-sm"
    >
      {preview.thumbnail && (
        <img
          src={preview.thumbnail}
          alt=""
          referrerPolicy="no-referrer"
          className="h-16 w-28 shrink-0 rounded bg-muted object-cover"
        />
      )}
      <div className="min-w-0">
        <p className="truncate font-medium">{preview.title ?? preview.url}</p>
        {meta && (
          <p className="truncate text-xs text-muted-foreground">{meta}</p>
        )}
      </div>
    </div>
  );
}
