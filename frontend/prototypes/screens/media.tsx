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

import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { usePrototype } from "../app";
import {
  BulkBar,
  EmptyState,
  Field,
  FilterChip,
  type FilterValues,
  PageBody,
  PageHeader,
  SearchInput,
  TABLE_CELL,
  TABLE_HEAD,
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
  const [filters, setFilters] = useState<FilterValues>({});
  const TYPE_FILTER: Record<string, MediaItem["type"]> = {
    Images: "image",
    Video: "video",
    Audio: "audio",
    Files: "file",
  };
  const types = (filters.Type ?? []).map((label) => TYPE_FILTER[label]);
  const tags = filters.Tags ?? [];
  const items = empty
    ? []
    : mediaItems.filter(
        (item) =>
          (types.length === 0 || types.includes(item.type)) &&
          (tags.length === 0 || item.tags.some((tag) => tags.includes(tag))),
      );
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
            multiple
            options={["Images", "Video", "Audio", "Files"]}
            value={filters.Type ?? []}
            onChange={(next) => setFilters({ ...filters, Type: next })}
          />
          <FilterChip
            label="Tags"
            multiple
            options={[
              "brand",
              "marketing",
              "print",
              "studio",
              "team",
              "travel",
            ]}
            value={filters.Tags ?? []}
            onChange={(next) => setFilters({ ...filters, Tags: next })}
          />
          <span className="md:hidden">
            <FilterChip
              label="Folder"
              options={["Brand", "Blog covers", "Documents", "Uploads 2026"]}
              value={folder ? [findPath(folders, folder).at(-1)!.name] : []}
              onChange={(next) =>
                setFolder(
                  next[0]
                    ? (folders.find((entry) => entry.name === next[0])?.id ??
                        null)
                    : null,
                )
              }
            />
          </span>
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
          <aside className="hidden md:block w-52 shrink-0 sticky top-0 space-y-0.5">
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
            ) : view === "list" ? (
              <div className="rounded-lg border bg-card divide-y overflow-hidden">
                {items.map((item) => (
                  <MediaRow
                    key={item.id}
                    item={item}
                    selected={selected.has(item.id)}
                    onToggle={() => toggle(item.id)}
                    onOpen={() => setOpen(item)}
                  />
                ))}
              </div>
            ) : (
              <MediaTable
                items={items}
                selected={selected}
                onToggle={toggle}
                onToggleAll={() =>
                  setSelected(
                    items.every((item) => selected.has(item.id))
                      ? new Set()
                      : new Set(items.map((item) => item.id)),
                  )
                }
                onOpen={setOpen}
              />
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

function MediaRow({
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
      className={cn(
        "group flex items-center gap-3 pl-3 pr-3 py-2 cursor-pointer hover:bg-muted",
        selected && "bg-accent",
      )}
      onClick={onOpen}
    >
      <span onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={selected}
          aria-label={`Select ${item.name}`}
          onCheckedChange={onToggle}
        />
      </span>
      <Thumb item={item} className="size-10" />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{item.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {item.extension} · {item.size}
          {item.dimensions ? ` · ${item.dimensions}` : ""}
        </div>
      </div>
      <span className="hidden md:flex items-center gap-1">
        {item.tags.map((tag) => (
          <Badge key={tag} variant="outline" className="text-muted-foreground">
            {tag}
          </Badge>
        ))}
      </span>
      <span className="hidden sm:inline text-xs text-muted-foreground w-24 text-right">
        {item.uploadedAt}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="File actions"
        className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={(event) => event.stopPropagation()}
      >
        <PiDotsThreeBold />
      </Button>
    </div>
  );
}

function MediaTable({
  items,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
}: {
  items: MediaItem[];
  selected: Set<string>;
  onToggle(id: string): void;
  onToggleAll(): void;
  onOpen(item: MediaItem): void;
}) {
  const allSelected = items.every((item) => selected.has(item.id));

  return (
    <div className="rounded-lg border bg-card overflow-x-auto scrollbar">
      <Table>
        <TableHeader className="bg-muted/60">
          <TableRow>
            <TableHead className={cn(TABLE_HEAD, "w-10")}>
              <Checkbox
                checked={allSelected}
                aria-label="Select all"
                onCheckedChange={onToggleAll}
              />
            </TableHead>
            <TableHead className={TABLE_HEAD}>Name</TableHead>
            <TableHead className={TABLE_HEAD}>Type</TableHead>
            <TableHead className={cn(TABLE_HEAD, "[&_div]:justify-end")}>
              Size
            </TableHead>
            <TableHead className={TABLE_HEAD}>Dimensions</TableHead>
            <TableHead className={TABLE_HEAD}>Tags</TableHead>
            <TableHead className={TABLE_HEAD}>Uploaded</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const isSelected = selected.has(item.id);
            return (
              <TableRow
                key={item.id}
                data-state={isSelected ? "selected" : undefined}
                onClick={() => onOpen(item)}
              >
                <TableCell
                  className={cn(TABLE_CELL, "w-10")}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Checkbox
                    checked={isSelected}
                    aria-label={`Select ${item.name}`}
                    onCheckedChange={() => onToggle(item.id)}
                  />
                </TableCell>
                <TableCell className={cn(TABLE_CELL, "max-w-xs")}>
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Thumb item={item} className="size-7" />
                    <span className="truncate">{item.name}</span>
                  </span>
                </TableCell>
                <TableCell
                  className={cn(
                    TABLE_CELL,
                    "text-muted-foreground font-normal",
                  )}
                >
                  {item.extension}
                </TableCell>
                <TableCell
                  className={cn(
                    TABLE_CELL,
                    "text-right tabular-nums font-normal",
                  )}
                >
                  {item.size}
                </TableCell>
                <TableCell
                  className={cn(
                    TABLE_CELL,
                    "text-muted-foreground font-normal tabular-nums",
                  )}
                >
                  {item.dimensions ?? "—"}
                </TableCell>
                <TableCell className={cn(TABLE_CELL, "font-normal")}>
                  <span className="flex items-center gap-1">
                    {item.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="text-muted-foreground"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </span>
                </TableCell>
                <TableCell
                  className={cn(
                    TABLE_CELL,
                    "text-muted-foreground font-normal",
                  )}
                >
                  {item.uploadedAt}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** A file's thumbnail, or its type icon on a mist tile. */
function Thumb({ item, className }: { item: MediaItem; className: string }) {
  return item.thumbnail ? (
    <img
      src={item.thumbnail}
      alt=""
      draggable={false}
      className={cn("rounded object-cover shrink-0", className)}
    />
  ) : (
    <span
      className={cn(
        "rounded bg-muted border flex items-center justify-center text-muted-foreground shrink-0",
        className,
      )}
    >
      <FileIcon item={item} className="size-4" />
    </span>
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
