// The trash: the model's soft-deleted objects, restorable for 30 days.
import { useState } from "react";
import {
  PiArrowCounterClockwiseBold,
  PiTrashBold,
  PiTrashSimpleBold,
} from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  PageBody,
  PageHeader,
  SearchInput,
  SharedBanner,
  StatusBadge,
  TABLE_CELL,
  TABLE_HEAD,
  Toolbar,
  UserAvatar,
} from "../components";
import { trashedArticles } from "../data";
import { ArticleTabs, ListFooter } from "./list";

export function TrashScreen() {
  const { settings } = usePrototype();
  const rows = settings.listState === "empty" ? [] : trashedArticles;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
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

  return (
    <>
      {settings.tenant && <SharedBanner noun="articles" />}
      <PageHeader
        icon={<span className="ph-bold ph-article" />}
        title="Articles"
        meta={
          <span className="text-muted-foreground text-sm tabular-nums">
            {rows.length} in the trash
          </span>
        }
        actions={
          rows.length > 0 && (
            <Button variant="outline">
              <PiTrashSimpleBold />
              Empty trash
            </Button>
          )
        }
      >
        <ArticleTabs current="trash" />
        <Toolbar>
          <SearchInput placeholder="Search the trash" />
          <span className="ml-auto text-xs text-muted-foreground">
            Deleted articles are kept for 30 days.
          </span>
        </Toolbar>
      </PageHeader>

      <PageBody>
        <div className="rounded-lg border bg-card overflow-x-auto scrollbar">
          {rows.length === 0 ? (
            <EmptyState
              icon={<PiTrashSimpleBold />}
              title="The trash is empty"
              description="Articles you delete land here and can be restored for 30 days."
            />
          ) : (
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead className={cn(TABLE_HEAD, "w-10")}>
                    <Checkbox
                      checked={allSelected}
                      aria-label="Select all"
                      onCheckedChange={() =>
                        setSelected(
                          allSelected
                            ? new Set()
                            : new Set(rows.map((row) => row.id)),
                        )
                      }
                    />
                  </TableHead>
                  <TableHead className={TABLE_HEAD}>Title</TableHead>
                  <TableHead className={TABLE_HEAD}>Status</TableHead>
                  <TableHead className={TABLE_HEAD}>Deleted</TableHead>
                  <TableHead className={TABLE_HEAD}>Deleted by</TableHead>
                  <TableHead className={TABLE_HEAD}>Kept for</TableHead>
                  <TableHead className={TABLE_HEAD}>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((article) => {
                  const isSelected = selected.has(article.id);
                  return (
                    <TableRow
                      key={article.id}
                      data-state={isSelected ? "selected" : undefined}
                      className="group"
                      onClick={() => toggle(article.id)}
                    >
                      <TableCell
                        className={cn(TABLE_CELL, "w-10")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          aria-label="Select row"
                          onCheckedChange={() => toggle(article.id)}
                        />
                      </TableCell>
                      <TableCell
                        className={cn(TABLE_CELL, "max-w-md truncate")}
                      >
                        {article.title}
                      </TableCell>
                      <TableCell className={TABLE_CELL}>
                        <StatusBadge status={article.status} />
                      </TableCell>
                      <TableCell
                        className={cn(
                          TABLE_CELL,
                          "text-muted-foreground font-normal",
                        )}
                      >
                        {article.deletedAt}
                      </TableCell>
                      <TableCell className={TABLE_CELL}>
                        <span className="inline-flex items-center gap-2">
                          <UserAvatar user={article.deletedBy} />
                          {article.deletedBy.name.split(" ")[0]}
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          TABLE_CELL,
                          "text-muted-foreground font-normal tabular-nums",
                        )}
                      >
                        {article.expiresIn}
                      </TableCell>
                      <TableCell
                        className={cn(TABLE_CELL, "text-right")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Button
                          variant="outline"
                          size="xs"
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <PiArrowCounterClockwiseBold />
                          Restore
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
        {rows.length > 0 && (
          <ListFooter
            summary={`${rows.length} articles in the trash`}
            pages={1}
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
                <PiArrowCounterClockwiseBold />
                Restore
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <PiTrashBold />
                Delete permanently
              </Button>
            </>
          }
        />
      )}
    </>
  );
}
