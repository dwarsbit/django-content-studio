import { useIsMutating } from "@tanstack/react-query";
import * as R from "ramda";
import React, { useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { PiCheckBold } from "react-icons/pi";

import { FolderPath } from "@/components/media-library/folder-path";
import { Folders } from "@/components/media-library/folders";
import { ItemCard } from "@/components/media-library/item-card";
import { UploadButton } from "@/components/media-library/upload-button";
import { Button } from "@/components/ui/button";
import { DebouncedInput } from "@/components/ui/debounced-input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { useDiscover } from "@/hooks/use-discover";
import { useListMedia } from "@/hooks/use-list-media";
import { useUpload } from "@/hooks/use-upload";
import type { MediaItem } from "@/types";

export function SelectDialog({
  children,
  multiple,
  onSelect,
}: {
  children: React.ReactElement;
  multiple: boolean;
  onSelect(v: MediaItem | MediaItem[]): void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="h-full sm:max-w-[calc(100%-48px)] max-h-[calc(100%-48px)] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("widgets.media_widget.dialog_title")}</DialogTitle>
        </DialogHeader>
        <SelectDialogContent multiple={multiple} onSelect={onSelect} />
      </DialogContent>
    </Dialog>
  );
}

function SelectDialogContent({
  multiple,
  onSelect,
}: {
  multiple: boolean;
  onSelect(v: MediaItem | MediaItem[]): void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [folder, setFolder] = useState<string | null>(null);
  const { data } = useListMedia({ folder, page, search });
  const { data: discover } = useDiscover();
  const hasFolders = discover?.media_library.folders ?? false;
  const pendingCount = useIsMutating({
    mutationKey: ["media-library", "items"],
  });
  const handleUpload = useUpload();

  return (
    <DropzoneArea
      onDrop={async (files) => {
        const uploaded = (await handleUpload(files)).filter(
          (item): item is MediaItem => !R.isNil(item),
        );
        setSelection((current) =>
          multiple ? [...current, ...uploaded] : uploaded,
        );
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <DebouncedInput
          size="sm"
          placeholder={t("common.search")}
          value={search}
          onChange={(v) => {
            setPage(1);
            setSearch(v);
          }}
        />
        <UploadButton variant="outline" folder={folder} multiple={multiple} />
      </div>

      <div className="flex-1 min-h-0 flex items-start gap-4">
        {hasFolders && !search && (
          <div className="w-48 shrink-0 max-h-full overflow-y-auto scrollbar">
            <Folders
              current={folder}
              onSelect={(folderId) => {
                setPage(1);
                setFolder(folderId);
              }}
            />
          </div>
        )}

        <div className="flex-1 min-w-0 h-full flex flex-col">
          {hasFolders && !search && (
            <FolderPath
              className="mb-2"
              folder={folder}
              onSelect={(folderId) => {
                setPage(1);
                setFolder(folderId);
              }}
            />
          )}

          <div className="flex-1 overflow-y-auto border rounded-lg scrollbar">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 p-3">
              {R.times(R.identity, pendingCount).map((i) => (
                <div key={i} className="rounded-lg border overflow-hidden">
                  <div className="aspect-[4/3] bg-muted animate-pulse flex items-center justify-center">
                    <Spinner />
                  </div>
                  <div className="p-3">
                    <div className="bg-muted animate-pulse rounded-md h-2.5" />
                  </div>
                </div>
              ))}

              {data?.results.map((item) => {
                const isSelected = selection.some(R.whereEq({ id: item.id }));

                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    selected={isSelected}
                    onClick={() => {
                      if (multiple) {
                        setSelection(
                          !isSelected ? R.append(item) : R.without([item]),
                        );
                      } else {
                        setSelection(isSelected ? [] : [item]);
                      }
                    }}
                  >
                    {isSelected && (
                      <div className="absolute top-2 left-2 size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm pointer-events-none">
                        <PiCheckBold className="size-3" />
                      </div>
                    )}
                  </ItemCard>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {data?.pagination ? (
        <div className="empty:hidden mt-3 flex justify-center">
          <Pagination
            onPageChange={setPage}
            current={data.pagination.current}
            pages={data.pagination.pages}
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 mt-6">
        <div className="flex -space-x-5 h-10">
          {selection.map((item) =>
            item.thumbnail ? (
              <img
                src={item.thumbnail}
                alt=""
                className="size-10 rounded-md object-cover border-2 border-gray-50"
              />
            ) : (
              <div className="size-10 bg-accent rounded-md border-2 border-gray-50" />
            ),
          )}
        </div>
        <div className="flex items-center gap-2">
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              disabled={R.isEmpty(selection)}
              onClick={() => onSelect(multiple ? selection : selection[0])}
            >
              {multiple && selection.length > 0
                ? t("widgets.media_widget.select_n_media", {
                    n: selection.length,
                  })
                : t("widgets.media_widget.select_media")}
            </Button>
          </DialogClose>
        </div>
      </div>
    </DropzoneArea>
  );
}

function DropzoneArea({
  onDrop,
  children,
}: {
  onDrop(files: File[]): void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { getRootProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div {...getRootProps()} className="flex-1 flex flex-col overflow-hidden">
      {isDragActive && (
        <div className="absolute left-0 right-0 bottom-0 top-0 flex items-center justify-center select-none z-20 bg-gray-950/40 rounded-md">
          <div className="relative rounded-lg border-dashed border aspect-square flex items-center justify-center p-12">
            <div className="rounded-lg border aspect-square animate-ping size-full absolute" />
            <span className="text-gray-50 font-medium">
              {t("widgets.media_widget.upload_label")}
            </span>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
