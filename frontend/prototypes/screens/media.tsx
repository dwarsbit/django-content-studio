// The media library: folders on the left, files as a grid.
import { useState } from "react";
import {
  PiCaretDownBold,
  PiCaretRightBold,
  PiCopyBold,
  PiDotsThreeBold,
  PiDownloadSimpleBold,
  PiFileAudioBold,
  PiFileBold,
  PiFilePdfBold,
  PiFileVideoBold,
  PiFileZipBold,
  PiFolderBold,
  PiFolderPlusBold,
  PiFolderSimpleBold,
  PiImagesBold,
  PiListBulletsBold,
  PiRowsBold,
  PiSquaresFourBold,
  PiTableBold,
  PiTrashBold,
  PiUploadSimpleBold,
} from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { usePrototype } from "../app";
import {
  BulkBar,
  EmptyState,
  Field,
  FilterChip,
  PageBody,
  PageHeader,
  SearchInput,
  TextInput,
  Toolbar,
  ViewToggle,
} from "../components";
import { folders, type MediaFolder, type MediaItem, mediaItems } from "../data";

/** The icon of a file that has no thumbnail, by extension and type. */
function FileIcon({
  item,
  className,
}: {
  item: MediaItem;
  className?: string;
}) {
  if (item.extension === "PDF") return <PiFilePdfBold className={className} />;
  if (item.extension === "ZIP") return <PiFileZipBold className={className} />;
  if (item.type === "video") return <PiFileVideoBold className={className} />;
  if (item.type === "audio") return <PiFileAudioBold className={className} />;
  if (item.type === "image") return <PiImagesBold className={className} />;
  return <PiFileBold className={className} />;
}

export function MediaLibraryScreen() {
  const { settings } = usePrototype();
  const empty = settings.mediaState === "empty";
  const items = empty ? [] : mediaItems;
  const [view, setView] = useState<"grid" | "list" | "table">("grid");
  const [folder, setFolder] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<MediaItem | null>(null);

  // Changing folder resets the selection: adjusted during render, as
  // the admin does for URL changes.
  const [lastFolder, setLastFolder] = useState(folder);
  if (folder !== lastFolder) {
    setLastFolder(folder);
    setSelected(new Set());
  }

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const path = folder ? findPath(folders, folder) : [];

  return (
    <>
      <PageHeader
        icon={<PiImagesBold />}
        title="Media library"
        meta={
          <span className="text-muted-foreground text-sm tabular-nums">
            {empty ? "0 files" : "231 files"}
          </span>
        }
        actions={
          <>
            <Button variant="outline">
              <PiFolderPlusBold />
              New folder
            </Button>
            <Button>
              <PiUploadSimpleBold />
              Upload
            </Button>
          </>
        }
      >
        <Toolbar>
          <SearchInput placeholder="Search files" />
          <FilterChip
            label="Type"
            options={["Images", "Video", "Audio", "Files"]}
          />
          <FilterChip
            label="Tags"
            options={[
              "brand",
              "marketing",
              "print",
              "studio",
              "team",
              "travel",
            ]}
          />
          <div className="ml-auto flex items-center gap-2">
            <ViewToggle<"grid" | "list" | "table">
              value={view}
              onChange={setView}
              options={[
                {
                  value: "grid",
                  icon: <PiSquaresFourBold />,
                  label: "Grid view",
                },
                { value: "list", icon: <PiRowsBold />, label: "List view" },
                { value: "table", icon: <PiTableBold />, label: "Table view" },
              ]}
            />
          </div>
        </Toolbar>
      </PageHeader>

      <PageBody>
        <div className="flex gap-6 items-start">
          <aside className="w-52 shrink-0 sticky top-0 space-y-0.5">
            <FolderRow
              icon={<PiListBulletsBold />}
              label="All files"
              count={empty ? 0 : 231}
              active={folder === null}
              onClick={() => setFolder(null)}
            />
            {(empty ? [] : folders).map((entry) => (
              <FolderNode
                key={entry.id}
                folder={entry}
                depth={0}
                current={folder}
                onSelect={setFolder}
              />
            ))}
            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground w-full justify-start"
              >
                <PiFolderPlusBold />
                New folder
              </Button>
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-sm mb-3 min-h-7">
              <button
                type="button"
                className={cn(
                  "hover:text-foreground",
                  path.length ? "text-muted-foreground" : "font-medium",
                )}
                onClick={() => setFolder(null)}
              >
                All files
              </button>
              {path.map((entry, index) => (
                <span key={entry.id} className="flex items-center gap-1.5">
                  <span className="text-muted-foreground/50">/</span>
                  <button
                    type="button"
                    className={cn(
                      "hover:text-foreground",
                      index === path.length - 1
                        ? "font-medium"
                        : "text-muted-foreground",
                    )}
                    onClick={() => setFolder(entry.id)}
                  >
                    {entry.name}
                  </button>
                </span>
              ))}
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {empty ? "" : `${items.length} files`}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed">
                <EmptyState
                  icon={<PiUploadSimpleBold />}
                  title="No files yet"
                  description="Drop files here to upload them, or use the upload button. Images, video, audio and documents up to 50 MB."
                  action={
                    <Button>
                      <PiUploadSimpleBold />
                      Upload
                    </Button>
                  }
                />
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4">
                {items.map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    selected={selected.has(item.id)}
                    onToggle={() => toggle(item.id)}
                    onOpen={() => setOpen(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border bg-card divide-y overflow-hidden">
                {items.map((item) => {
                  const isSelected = selected.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "group flex items-center gap-3 pl-3 pr-3 py-2 cursor-pointer hover:bg-muted",
                        isSelected && "bg-accent",
                      )}
                      onClick={() => setOpen(item)}
                    >
                      <span onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          aria-label="Select file"
                          onCheckedChange={() => toggle(item.id)}
                        />
                      </span>
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt=""
                          className="size-9 rounded object-cover shrink-0"
                        />
                      ) : (
                        <span className="size-9 rounded bg-muted border flex items-center justify-center text-muted-foreground shrink-0">
                          <FileIcon item={item} className="size-4" />
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{item.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.extension} · {item.size}
                          {item.dimensions ? ` · ${item.dimensions}` : ""}
                        </div>
                      </div>
                      {view === "table" && (
                        <>
                          <span className="hidden md:inline text-xs text-muted-foreground w-28">
                            {item.tags.join(", ")}
                          </span>
                          <span className="hidden md:inline text-xs text-muted-foreground w-24">
                            {item.uploadedAt}
                          </span>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="File actions"
                        className="text-muted-foreground opacity-0 group-hover:opacity-100"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <PiDotsThreeBold />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </PageBody>

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          noun={selected.size === 1 ? "file" : "files"}
          onClear={() => setSelected(new Set())}
          actions={
            <>
              <Button variant="ghost" size="sm">
                <PiFolderBold />
                Move
              </Button>
              <Button variant="ghost" size="sm">
                <PiDownloadSimpleBold />
                Download
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <PiTrashBold />
                Delete
              </Button>
            </>
          }
        />
      )}

      <Sheet
        open={open !== null}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
      >
        <SheetContent className="w-[400px] sm:max-w-[400px] flex flex-col gap-0 p-0">
          {open && <Details item={open} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function findPath(tree: MediaFolder[], id: string): MediaFolder[] {
  for (const folder of tree) {
    if (folder.id === id) return [folder];
    const inner = folder.children ? findPath(folder.children, id) : [];
    if (inner.length) return [folder, ...inner];
  }
  return [];
}

function FolderRow({
  icon,
  label,
  count,
  active,
  depth = 0,
  caret,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  depth?: number;
  caret?: React.ReactNode;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      className={cn(
        "w-full h-8 flex items-center gap-2 rounded-md pr-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer",
        active
          ? "bg-accent text-foreground"
          : "text-foreground/80 hover:bg-muted hover:text-foreground",
      )}
      style={{ paddingLeft: 8 + depth * 16 }}
      onClick={onClick}
    >
      <span className="size-4 flex items-center justify-center text-muted-foreground shrink-0 [&_svg]:size-3">
        {caret}
      </span>
      <span
        className={cn(
          "shrink-0 [&_svg]:size-4",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
      {count != null && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

function FolderNode({
  folder,
  depth,
  current,
  onSelect,
}: {
  folder: MediaFolder;
  depth: number;
  current: string | null;
  onSelect(id: string): void;
}) {
  const [expanded, setExpanded] = useState(true);
  const children = folder.children ?? [];

  return (
    <>
      <FolderRow
        icon={<PiFolderSimpleBold />}
        label={folder.name}
        count={folder.count}
        depth={depth}
        active={current === folder.id}
        caret={
          children.length > 0 && (
            <span
              role="button"
              aria-label={expanded ? "Collapse" : "Expand"}
              className="rounded-sm hover:bg-foreground/10 p-0.5"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? <PiCaretDownBold /> : <PiCaretRightBold />}
            </span>
          )
        }
        onClick={() => onSelect(folder.id)}
      />
      {expanded &&
        children.map((child) => (
          <FolderNode
            key={child.id}
            folder={child}
            depth={depth + 1}
            current={current}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

function MediaCard({
  item,
  selected,
  onToggle,
  onOpen,
}: {
  item: MediaItem;
  selected: boolean;
  onToggle(): void;
  onOpen(): void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      className={cn(
        "group relative rounded-lg border bg-card overflow-hidden cursor-pointer outline-none transition-[box-shadow,border-color]",
        "hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring",
        selected && "border-ring ring-3 ring-ring/30",
      )}
      onClick={onOpen}
      onKeyDown={(event) => event.key === "Enter" && onOpen()}
    >
      <div className="relative aspect-[4/3] bg-muted">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            draggable={false}
            className="size-full object-cover"
          />
        ) : (
          <div className="size-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <FileIcon item={item} className="size-7" />
            <span className="text-[11px] font-semibold tracking-wide">
              {item.extension}
            </span>
          </div>
        )}
        <span
          className={cn(
            "absolute top-2 left-2 transition-opacity",
            selected
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            aria-label={`Select ${item.name}`}
            className="bg-background shadow-sm"
            onCheckedChange={onToggle}
          />
        </span>
        <Button
          variant="outline"
          size="icon-xs"
          aria-label="File actions"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={(event) => event.stopPropagation()}
        >
          <PiDotsThreeBold />
        </Button>
      </div>
      <div className="px-3 py-2">
        <div className="font-medium truncate">{item.name}</div>
        <div className="text-xs text-muted-foreground">
          {item.extension} · {item.size}
        </div>
      </div>
    </div>
  );
}

function Details({ item }: { item: MediaItem }) {
  const rows: [string, string][] = [
    ["Type", `${item.extension} ${item.type}`],
    ["Size", item.size],
    ...(item.dimensions
      ? [["Dimensions", item.dimensions] as [string, string]]
      : []),
    ["Uploaded", item.uploadedAt],
    ["Folder", "Brand / Photography"],
  ];

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle className="truncate pr-6">{item.name}</SheetTitle>
        <SheetDescription>
          {item.extension} · {item.size}
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto scrollbar">
        <div className="aspect-[4/3] bg-muted border-b flex items-center justify-center">
          {item.thumbnail ? (
            <img
              src={item.thumbnail}
              alt=""
              className="size-full object-contain"
            />
          ) : (
            <FileIcon item={item} className="size-10 text-muted-foreground" />
          )}
        </div>
        <div className="p-4 flex items-center gap-2 border-b">
          <Button variant="outline" size="sm">
            <PiCopyBold />
            Copy URL
          </Button>
          <Button variant="outline" size="sm">
            <PiDownloadSimpleBold />
            Download
          </Button>
          <Button variant="outline" size="sm">
            <PiFolderBold />
            Move
          </Button>
        </div>
        <div className="p-4 space-y-4 border-b">
          <Field label="name">
            <TextInput initial={item.name} />
          </Field>
          <Field
            label="alt text"
            hint="Describes the image for people who cannot see it."
          >
            <TextInput placeholder="A short description" />
          </Field>
          <Field label="tags">
            <TextInput initial={item.tags.join(", ")} />
          </Field>
        </div>
        <dl className="p-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="truncate tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <SheetFooter className="border-t flex-row items-center">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive mr-auto"
        >
          <PiTrashBold />
          Delete
        </Button>
        <Button variant="outline">Cancel</Button>
        <Button>Save</Button>
      </SheetFooter>
    </>
  );
}
