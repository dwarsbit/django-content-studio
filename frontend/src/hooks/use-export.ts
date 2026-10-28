import { useMutation } from "@tanstack/react-query";

import { useHttp } from "@/hooks/use-http";
import { getDownloadFilename, saveFile } from "@/lib/download";
import type { ExportFormat } from "@/types";

export type ExportRequest =
  // The list: every object matching the list's search and filters, in
  // its ordering, or the trash.
  | {
      format: ExportFormat;
      params?: Record<string, string | null | undefined>;
      trash?: boolean;
    }
  // The selected rows, through the built-in export bulk action.
  | { format: ExportFormat; ids: string[]; ordering?: string | null };

/** Download a model's list, or a selection of it, as a file. */
export function useExport(modelLabel: string) {
  const http = useHttp();

  return useMutation({
    async mutationFn(request: ExportRequest) {
      const response =
        "ids" in request
          ? await http.post<Blob>(
              `/content/${modelLabel}/bulk`,
              {
                action: "export",
                ids: request.ids,
                export_format: request.format,
              },
              {
                params: { ordering: request.ordering || undefined },
                responseType: "blob",
              },
            )
          : await http.get<Blob>(`/content/${modelLabel}/export`, {
              params: {
                ...request.params,
                export_format: request.format,
                export_scope: request.trash ? "trash" : undefined,
              },
              responseType: "blob",
            });

      const headers = (response.headers ?? {}) as Record<string, unknown>;
      const disposition = headers["content-disposition"];

      saveFile(
        response.data,
        getDownloadFilename(
          typeof disposition === "string" ? disposition : null,
          `${modelLabel.split(".").at(-1)}.${request.format}`,
        ),
      );
    },
  });
}
