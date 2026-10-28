import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as R from "ramda";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiFileTextBold, PiRowsBold, PiTableBold } from "react-icons/pi";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import { ExportMenu } from "@/components/export-menu";
import { HeaderTabs } from "@/components/header-tabs";
import { buttonVariants } from "@/components/ui/button";
import { PageBody, PageHeader, Toolbar } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDiscover } from "@/hooks/use-discover";
import { useExport } from "@/hooks/use-export";
import { useHttp } from "@/hooks/use-http";
import { useMoveResource } from "@/hooks/use-move-resource";
import { getDownloadErrorMessage } from "@/lib/download";
import type { ExportFormat, Model, PaginatedResponse, Resource } from "@/types";

import { ContentBulkBar } from "./_components/bulk-bar";
import { Filters } from "./_components/filters";
import { ListView } from "./_components/list-view";
import { SortSelect } from "./_components/sort-select";
import { type ReorderProps, TableView } from "./_components/table-view";
import { ContentEditorPage } from "./[id]/page";

export function ModelListPage() {
  const { t } = useTranslation();
  const { model: appLabel } = useParams<{ model: string }>();
  const http = useHttp();
  const { data: discover } = useDiscover();
  const model = discover?.models.find(R.whereEq({ label: appLabel }));
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const search = searchParams.get("search");
  // The views the admin offers; more than one shows a toggle. The
  // choice is remembered per content type in local storage.
  const views = model?.admin.list.views ?? ["table"];
  const sortableBy = model?.admin.list.sortable_by ?? null;

  // Reads the remembered choice, falling back to the first offered
  // view when nothing (or a no longer offered view) is stored.
  const storedView = (label: string) => {
    const remembered = localStorage.getItem(`__dcs_list_view__:${label}`);

    return remembered && views.includes(remembered) ? remembered : views[0];
  };

  // The remembered ordering (null meaning none) and filters (a flat
  // record of "field" / "field__lookup" to value), per content type.
  // A remembered value can outlive the studio's configuration — a
  // removed column, filter or sortable field is dropped instead of
  // being sent as an ignored parameter.
  const sanitizeOrdering = (ordering: string | null) => {
    const name = ordering?.replace(/^-/, "");

    return ordering &&
      name &&
      model &&
      !R.isNil(model.fields[name]) &&
      model.admin.list.display.some((column) => column.name === name) &&
      (R.isNil(sortableBy) || sortableBy.includes(name))
      ? ordering
      : null;
  };
  const sanitizeFilters = (filters: Record<string, string>) => {
    if (!model) {
      return {};
    }

    const filterable = new Set(model.admin.list.filter ?? []);

    return Object.fromEntries(
      Object.entries(filters).filter(([key]) => {
        const name = key.split("__")[0];

        return filterable.has(name) && !R.isNil(model.fields[name]);
      }),
    );
  };
  const storedOrdering = (label: string) =>
    sanitizeOrdering(localStorage.getItem(`__dcs_list_ordering__:${label}`));
  const storedFilters = (label: string) => {
    try {
      return sanitizeFilters(
        JSON.parse(
          localStorage.getItem(`__dcs_list_filters__:${label}`) ?? "{}",
        ) as Record<string, string>,
      );
    } catch {
      return {};
    }
  };

  const [view, setViewState] = useState<string>(() =>
    model?.label ? storedView(model.label) : views[0],
  );
  const [ordering, setOrderingState] = useState<string | null>(() =>
    model?.label ? storedOrdering(model.label) : null,
  );
  const [filters, setFiltersState] = useState<Record<string, string>>(() =>
    model?.label ? storedFilters(model.label) : {},
  );
  const [lastLabel, setLastLabel] = useState(model?.label);

  // Navigating between content types re-reads the remembered choice,
  // ordering and filters.
  if (model && model.label !== lastLabel) {
    setLastLabel(model.label);
    setViewState(storedView(model.label));
    setOrderingState(storedOrdering(model.label));
    setFiltersState(storedFilters(model.label));
  }

  // Without sortable_by the list view always uses the default
  // ordering; the stored ordering is kept for the table to pick
  // back up.
  const effectiveOrdering =
    view === "list" && R.isNil(sortableBy) ? null : ordering;

  // Selection is current-page: any URL change (page, search) or
  // change of the remembered ordering or filters resets it — during
  // render, the sanctioned way to adjust state to an external change.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [lastParams, setLastParams] = useState(searchParams);

  if (searchParams !== lastParams) {
    setLastParams(searchParams);
    setSelected(new Set());
  }

  const setView = (next: string) => {
    setViewState(next);

    if (model) {
      localStorage.setItem(`__dcs_list_view__:${model.label}`, next);
    }

    // Selection is current-page: switching views resets it.
    setSelected(new Set());
  };

  // Narrowing or re-sorting the list can strand the current page, so
  // every state change returns to the first page.
  const resetPage = () =>
    setSearchParams((searchParams) => {
      searchParams.delete("page");
      return searchParams;
    });

  const setOrdering = (next: string | null) => {
    setOrderingState(next);

    if (model) {
      if (next) {
        localStorage.setItem(`__dcs_list_ordering__:${model.label}`, next);
      } else {
        localStorage.removeItem(`__dcs_list_ordering__:${model.label}`);
      }
    }

    resetPage();
    setSelected(new Set());
  };

  const setFilters = (next: Record<string, string>) => {
    setFiltersState(next);

    if (model) {
      if (R.isEmpty(next)) {
        localStorage.removeItem(`__dcs_list_filters__:${model.label}`);
      } else {
        localStorage.setItem(
          `__dcs_list_filters__:${model.label}`,
          JSON.stringify(next),
        );
      }
    }

    resetPage();
    setSelected(new Set());
  };

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

  const toggleAll = (ids: string[]) =>
    setSelected((previous) =>
      ids.every((id) => previous.has(id)) ? new Set() : new Set(ids),
    );

  // Whether a search term or remembered filters narrow the list —
  // the empty state's no-results notice depends on it — and clearing
  // both.
  const filtered = !R.isEmpty(filters) || !!search;
  const clearContext = () => {
    setFilters({});
    setSearchParams((searchParams) => {
      searchParams.delete("search");
      return searchParams;
    });
  };

  const clearSelection = () => setSelected(new Set());
  const actions = model?.admin.list.actions ?? [];

  // Export writes every object matching the search and filters, in the
  // list's ordering: all pages, not only the current one.
  const exportFormats = model?.admin.list.export?.formats ?? [];
  const { mutateAsync: runExport, isPending: isExporting } = useExport(
    appLabel ?? "",
  );
  const exportList = async (format: ExportFormat) => {
    try {
      await runExport({
        format,
        params: {
          ...filters,
          search: search || undefined,
          ordering: effectiveOrdering,
        },
      });
    } catch (e) {
      toast.error(await getDownloadErrorMessage(e));
    }
  };

  const queryKey = [
    "resources",
    appLabel,
    { search, page, ordering: effectiveOrdering, filters },
  ];

  const { data } = useQuery({
    retry: false,
    enabled: !R.isNil(model),
    queryKey,
    placeholderData: keepPreviousData,
    async queryFn() {
      const { data } = await http.get<PaginatedResponse<Resource>>(
        `/content/${appLabel}`,
        {
          params: {
            ...filters,
            search: search || undefined,
            page,
            ordering: effectiveOrdering,
          },
        },
      );

      return data;
    },
  });

  // Reordering follows the manual order, so it is off while another
  // ordering or a search (ranked results) decides the order; filters
  // only narrow the list and keep it on.
  const { mutate: move } = useMoveResource({
    endpoint: `/content/${appLabel}`,
    queryKey,
    invalidateKey: ["resources", appLabel],
    params: filters,
  });
  const reorder: ReorderProps | undefined = model?.admin.list.reorderable
    ? {
        disabledReason: search
          ? t("reorder.disabled_search")
          : effectiveOrdering
            ? t("reorder.disabled_ordering")
            : null,
        onMove: (id, next) => move({ id, move: next }),
        isFirstPage: !data || data.pagination.current <= 1,
        isLastPage: !data || data.pagination.current >= data.pagination.pages,
      }
    : undefined;

  return model && data ? (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <PageHeader
        icon={
          model.admin.icon ? (
            <span className={model.admin.icon} />
          ) : (
            <PiFileTextBold />
          )
        }
        title={model.verbose_name_plural}
        meta={
          <span className="text-muted-foreground text-sm tabular-nums">
            {data.pagination.count}
          </span>
        }
        description={model.admin.list.description}
        actions={
          model.admin.permissions.add_permission && (
            <Link
              to={`/content/${model.label}/new`}
              className={buttonVariants()}
            >
              {t("common.create")}
            </Link>
          )
        }
      >
        {model.admin.list.trash && <ListTabs model={model} current="list" />}
        <Toolbar>
          <Filters model={model} values={filters} onValuesChange={setFilters} />
          <div className="ml-auto flex items-center gap-2">
            {exportFormats.length > 0 && (
              <ExportMenu
                formats={exportFormats}
                disabled={isExporting}
                onExport={exportList}
              />
            )}
            {view === "list" && !R.isNil(sortableBy) && (
              <SortSelect
                model={model}
                ordering={ordering}
                onOrderingChange={setOrdering}
              />
            )}
            {views.length > 1 && (
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={view}
                onValueChange={(next) => next && setView(next)}
                aria-label={t("list_view.view")}
              >
                {views.includes("table") && (
                  <ToggleGroupItem
                    value="table"
                    title={t("list_view.table_view")}
                    aria-label={t("list_view.table_view")}
                    className="min-w-8"
                  >
                    <PiTableBold />
                  </ToggleGroupItem>
                )}
                {views.includes("list") && (
                  <ToggleGroupItem
                    value="list"
                    title={t("list_view.list_view")}
                    aria-label={t("list_view.list_view")}
                    className="min-w-8"
                  >
                    <PiRowsBold />
                  </ToggleGroupItem>
                )}
              </ToggleGroup>
            )}
          </div>
        </Toolbar>
      </PageHeader>

      <PageBody className="space-y-3">
        {view === "list" ? (
          <ListView
            items={data.results}
            model={model}
            selected={actions.length > 0 ? selected : undefined}
            onToggle={actions.length > 0 ? toggle : undefined}
            filtered={filtered}
            onClear={clearContext}
            reorder={reorder}
          />
        ) : (
          <TableView
            items={data.results}
            model={model}
            selected={selected}
            ordering={ordering}
            onOrderingChange={setOrdering}
            onToggle={toggle}
            onToggleAll={toggleAll}
            filtered={filtered}
            onClear={clearContext}
            reorder={reorder}
          />
        )}
        {data.results.length > 0 && (
          <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
            <span className="tabular-nums select-none">
              {t("list_view.count", {
                count: data.pagination.count,
                singular: model.verbose_name,
                plural: model.verbose_name_plural,
              })}
              {data.pagination.pages > 1 &&
                ` · ${t("list_view.page_of", data.pagination)}`}
            </span>
            <Pagination
              current={data.pagination.current}
              pages={data.pagination.pages}
              onPageChange={(page) =>
                setSearchParams((searchParams) => {
                  searchParams.set("page", `${page}`);
                  return searchParams;
                })
              }
            />
          </div>
        )}
      </PageBody>

      {selected.size > 0 && actions.length > 0 && (
        <ContentBulkBar
          modelLabel={model.label}
          actions={actions}
          ids={Array.from(selected)}
          ordering={effectiveOrdering}
          onDone={clearSelection}
        />
      )}
    </div>
  ) : (
    <div className="flex-1 flex items-center justify-center">
      <Spinner />
    </div>
  );
}

/**
 * The scope tabs of a model with a trash: the list and the trash, with
 * the number of objects in the trash.
 */
export function ListTabs({
  model,
  current,
  count,
}: {
  model: Model;
  current: "list" | "trash";
  // The number of objects in the trash, when the caller has it; the
  // list page fetches it.
  count?: number;
}) {
  const { t } = useTranslation();
  const http = useHttp();
  const { data: fetched } = useQuery({
    retry: false,
    enabled: count === undefined,
    queryKey: ["trash", model.label, "count"],
    async queryFn() {
      const { data } = await http.get<PaginatedResponse<Resource>>(
        `/content/${model.label}/trash`,
        { params: { page: 1 } },
      );

      return data.pagination.count;
    },
  });

  return (
    <HeaderTabs
      current={
        current === "list"
          ? `/content/${model.label}`
          : `/content/${model.label}/trash`
      }
      tabs={[
        {
          label: t("list_view.tabs_all", { model: model.verbose_name_plural }),
          to: `/content/${model.label}`,
        },
        {
          label: t("list_view.trash"),
          count: count ?? fetched,
          to: `/content/${model.label}/trash`,
        },
      ]}
    />
  );
}

// The content index route: the list page, or — for singletons, which
// have no list — the editor. While discover loads, the list page's
// spinner covers the wait.
export function ContentIndexPage() {
  const { model: appLabel } = useParams<{ model: string }>();
  const { data: discover } = useDiscover();
  const model = discover?.models.find(R.whereEq({ label: appLabel }));

  return model?.admin.is_singleton ? <ContentEditorPage /> : <ModelListPage />;
}
