// The content list: a model's objects as a table or as rows.
import { useState } from "react";
import {
  PiArrowLeftBold,
  PiArrowRightBold,
  PiCaretDownBold,
  PiPaperPlaneTiltBold,
  PiPlusBold,
  PiRowsBold,
  PiSortAscendingBold,
  PiTableBold,
  PiTrashBold,
} from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  BoolMark,
  BulkBar,
  EmptyState,
  FilterChip,
  type FilterValues,
  hasFilters,
  HeaderTabs,
  PageBody,
  PageHeader,
  SearchInput,
  SharedBanner,
  StatusBadge,
  TABLE_CELL,
  TABLE_HEAD,
  Toolbar,
  UserAvatar,
  ViewToggle,
} from "../components";
import { type Article, articles, STATUS_LABELS } from "../data";

const FILTERS: { label: string; options: string[]; multiple?: boolean }[] = [
  { label: "Status", options: Object.values(STATUS_LABELS) },
  { label: "Featured", options: ["Yes", "No"] },
  { label: "Author", options: ["Leon", "Eva", "Noah"], multiple: true },
  { label: "Published at", options: ["Last week", "Last month", "This year"] },
  {
    label: "Categories",
    options: ["General", "Guides", "Opinion", "Updates"],
    multiple: true,
  },
];

/** The scope tabs of the articles list, shared with the trash page. */
export function ArticleTabs({ current }: { current: "list" | "trash" }) {
  return (
    <HeaderTabs
      current={
        current === "list" ? "#/content/articles" : "#/content/articles/trash"
      }
      tabs={[
        { label: "All articles", href: "#/content/articles" },
        { label: "Trash", count: 3, href: "#/content/articles/trash" },
      ]}
    />
  );
}

export function ContentListScreen() {
  const { settings, update } = usePrototype();
  const { listView, listState } = settings;
  // The "filtered" and "selected" states preset the filters and the
  // selection (the screen remounts per list state, see app.tsx).
  const [filters, setFilters] = useState<FilterValues>((): FilterValues =>
    listState === "filtered" ? { Status: ["Published"] } : {},
  );
  const [selected, setSelected] = useState<Set<string>>(() =>
    listState === "selected" ? new Set(["1", "4"]) : new Set(),
  );
  const filtered = hasFilters(filters);
  const status = filters.Status?.[0];
  const rows =
    listState === "empty"
      ? []
      : status
        ? articles.filter((article) => STATUS_LABELS[article.status] === status)
        : articles;

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
  const allSelected =
    rows.length > 0 && rows.every((row) => selected.has(row.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));

  return (
    <>
      {settings.tenant && <SharedBanner noun="articles" />}
      <PageHeader
        icon={<span className="ph-bold ph-article" />}
        title="Articles"
        meta={
          <span className="text-muted-foreground text-sm tabular-nums">
            {filtered ? `${rows.length} of 128` : "128"}
          </span>
        }
        actions={
          <Button
            onClick={() => (window.location.hash = "#/content/articles/new")}
          >
            <PiPlusBold />
            Create
          </Button>
        }
      >
        <ArticleTabs current="list" />
        <Toolbar>
          <SearchInput placeholder="Search articles" />
          {FILTERS.map((filter) => (
            <FilterChip
              key={filter.label}
              label={filter.label}
              options={filter.options}
              multiple={filter.multiple}
              value={filters[filter.label] ?? []}
              onChange={(next) =>
                setFilters({ ...filters, [filter.label]: next })
              }
            />
          ))}
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setFilters({})}
            >
              Clear filters
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {listView === "list" && <SortMenu />}
            <ViewToggle
              value={listView}
              onChange={(listView) => update({ listView })}
              options={[
                { value: "table", icon: <PiTableBold />, label: "Table view" },
                { value: "list", icon: <PiRowsBold />, label: "List view" },
              ]}
            />
          </div>
        </Toolbar>
      </PageHeader>

      <PageBody>
        <div className="rounded-lg border bg-card overflow-x-auto scrollbar">
          {rows.length === 0 ? (
            filtered ? (
              <EmptyState
                icon={<span className="ph-bold ph-funnel" />}
                title="No articles match"
                description="No article matches the current filters."
                action={
                  <Button variant="outline" onClick={() => setFilters({})}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<span className="ph-bold ph-article" />}
                title="No articles yet"
                description="Articles you create appear here. Deleted articles are kept in the trash for 30 days."
                action={
                  <Button
                    onClick={() =>
                      (window.location.hash = "#/content/articles/new")
                    }
                  >
                    <PiPlusBold />
                    Create
                  </Button>
                }
              />
            )
          ) : listView === "table" ? (
            <ArticlesTable
              rows={rows}
              selected={selected}
              allSelected={allSelected}
              onToggle={toggle}
              onToggleAll={toggleAll}
            />
          ) : (
            <ArticlesList rows={rows} selected={selected} onToggle={toggle} />
          )}
        </div>
        {rows.length > 0 && (
          <ListFooter
            summary={
              filtered ? `${rows.length} articles` : "1–8 of 128 articles"
            }
            pages={filtered ? 1 : 16}
          />
        )}
      </PageBody>

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          noun={selected.size === 1 ? "article" : "articles"}
          onClear={() => setSelected(new Set())}
          actions={
            <>
              <Button variant="ghost" size="sm">
                <PiPaperPlaneTiltBold />
                Publish
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <PiTrashBold />
                Move to trash
              </Button>
            </>
          }
        />
      )}
    </>
  );
}

/** The count and the pagination under a list. */
export function ListFooter({
  summary,
  pages,
}: {
  summary: string;
  pages: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 pt-3 text-sm text-muted-foreground">
      <span className="tabular-nums">{summary}</span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous page"
            disabled
          >
            <PiArrowLeftBold />
          </Button>
          <PageButton page={1} active />
          <PageButton page={2} />
          <PageButton page={3} />
          <span className="px-1">…</span>
          <PageButton page={pages} />
          <Button variant="ghost" size="icon-sm" aria-label="Next page">
            <PiArrowRightBold />
          </Button>
        </div>
      )}
    </div>
  );
}

function PageButton({ page, active }: { page: number; active?: boolean }) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      className="tabular-nums text-foreground"
      aria-current={active ? "page" : undefined}
    >
      {page}
    </Button>
  );
}

function SortMenu() {
  const [sort, setSort] = useState("newest");
  const labels: Record<string, string> = {
    newest: "Newest first",
    oldest: "Oldest first",
    title: "Title A–Z",
    views: "Most viewed",
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border bg-background shadow-xs text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer select-none",
          "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring",
        )}
      >
        <PiSortAscendingBold />
        {labels[sort]}
        <PiCaretDownBold className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
          {Object.entries(labels).map(([value, label]) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ArticlesTable({
  rows,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
}: {
  rows: Article[];
  selected: Set<string>;
  allSelected: boolean;
  onToggle(id: string): void;
  onToggleAll(): void;
}) {
  return (
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
          <TableHead className={TABLE_HEAD}>
            <SortableHead label="Title" />
          </TableHead>
          <TableHead className={TABLE_HEAD}>Status</TableHead>
          <TableHead className={TABLE_HEAD}>Featured</TableHead>
          <TableHead className={cn(TABLE_HEAD, "[&_div]:justify-end")}>
            <SortableHead label="Views" active direction="desc" />
          </TableHead>
          <TableHead className={TABLE_HEAD}>Author</TableHead>
          <TableHead className={TABLE_HEAD}>Published</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((article) => {
          const isSelected = selected.has(article.id);
          return (
            <TableRow
              key={article.id}
              data-state={isSelected ? "selected" : undefined}
              onClick={() => (window.location.hash = "#/content/articles/1")}
            >
              <TableCell
                className={cn(TABLE_CELL, "w-10")}
                onClick={(event) => event.stopPropagation()}
              >
                <Checkbox
                  checked={isSelected}
                  aria-label="Select row"
                  onCheckedChange={() => onToggle(article.id)}
                />
              </TableCell>
              <TableCell className={cn(TABLE_CELL, "max-w-md truncate")}>
                {article.title}
              </TableCell>
              <TableCell className={TABLE_CELL}>
                <StatusBadge status={article.status} />
              </TableCell>
              <TableCell className={TABLE_CELL}>
                <BoolMark value={article.featured} />
              </TableCell>
              <TableCell className={cn(TABLE_CELL, "text-right tabular-nums")}>
                {article.views.toLocaleString("en")}
              </TableCell>
              <TableCell className={TABLE_CELL}>
                <span className="inline-flex items-center gap-2">
                  <UserAvatar user={article.author} />
                  <span>{article.author.name.split(" ")[0]}</span>
                </span>
              </TableCell>
              <TableCell
                className={cn(TABLE_CELL, "text-muted-foreground font-normal")}
              >
                {article.publishedAt ?? "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function SortableHead({
  label,
  active,
  direction = "asc",
}: {
  label: string;
  active?: boolean;
  direction?: "asc" | "desc";
}) {
  return (
    <button
      type="button"
      className={cn(
        "group inline-flex items-center gap-1 cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-foreground" : "hover:text-foreground",
      )}
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      {label}
      <PiCaretDownBold
        className={cn(
          "size-3 transition-opacity",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-50",
          active && direction === "asc" && "rotate-180",
        )}
      />
    </button>
  );
}

function ArticlesList({
  rows,
  selected,
  onToggle,
}: {
  rows: Article[];
  selected: Set<string>;
  onToggle(id: string): void;
}) {
  return (
    <div className="divide-y">
      {rows.map((article) => {
        const isSelected = selected.has(article.id);
        return (
          <div
            key={article.id}
            className={cn(
              "group flex items-center gap-3 pl-3 pr-4 py-3 cursor-pointer hover:bg-muted",
              isSelected && "bg-accent",
            )}
            onClick={() => (window.location.hash = "#/content/articles/1")}
          >
            <span
              className={cn(
                "flex items-center transition-opacity",
                isSelected
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <Checkbox
                checked={isSelected}
                aria-label="Select row"
                onCheckedChange={() => onToggle(article.id)}
              />
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{article.title}</div>
              <div className="text-muted-foreground truncate">
                {article.excerpt}
              </div>
            </div>
            <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap">
              {article.publishedAt ?? "Not published"}
            </span>
            <StatusBadge status={article.status} />
          </div>
        );
      })}
    </div>
  );
}
