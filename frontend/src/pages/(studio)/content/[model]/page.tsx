import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as R from "ramda";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiFileTextBold, PiRowsBold, PiTableBold } from "react-icons/pi";
import { Link, useParams, useSearchParams } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import { cn } from "@/lib/utils";
import type { PaginatedResponse, Resource } from "@/types";

import { BulkBar } from "./_components/bulk-bar";
import { Filters } from "./_components/filters";
import { ListView } from "./_components/list-view";
import { SortSelect } from "./_components/sort-select";
import { TableView } from "./_components/table-view";
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

  // The remembered ordering ("" meaning none) and filters (a flat
  // record of "field" / "field__lookup" to value), per content type.
  const storedOrdering = (label: string) =>
    localStorage.getItem(`__dcs_list_ordering__:${label}`);
  const storedFilters = (label: string) => {
    try {
      return JSON.parse(
        localStorage.getItem(`__dcs_list_filters__:${label}`) ?? "{}",
      ) as Record<string, string>;
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

  const setOrdering = (next: string | null) => {
    setOrderingState(next);

    if (model) {
      if (next) {
        localStorage.setItem(`__dcs_list_ordering__:${model.label}`, next);
      } else {
        localStorage.removeItem(`__dcs_list_ordering__:${model.label}`);
      }
    }

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

  const clearSelection = () => setSelected(new Set());
  const actions = model?.admin.list.actions ?? [];

  const { data } = useQuery({
    retry: false,
    enabled: !R.isNil(model),
    queryKey: [
      "resources",
      appLabel,
      { search, page, ordering: effectiveOrdering, filters },
    ],
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

  return model && data ? (
    <div className="flex flex-col overflow-hidden w-full max-w-[1200px] mx-auto pr-8 pl-4">
      <div className="flex items-center gap-4 pb-3 pt-6 w-full">
        {model.admin.icon ? (
          <span
            className={cn(model.admin.icon, "text-lg text-muted-foreground")}
          />
        ) : (
          <PiFileTextBold />
        )}
        <div className="select-none flex-1">
          <h1 className="text-lg font-semibold">{model.verbose_name_plural}</h1>
          {model.admin.list.description && (
            <div className="text-muted-foreground">
              {model.admin.list.description}
            </div>
          )}
        </div>
        {model.admin.list.trash && (
          <Link
            to={`/content/${model.label}/trash`}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("list_view.trash")}
          </Link>
        )}
        {model.admin.permissions.add_permission && (
          <Link to={`/content/${model.label}/new`} className={buttonVariants()}>
            {t("common.create")}
          </Link>
        )}
      </div>

      <div className="py-6 space-y-4 w-full">
        <div className="flex gap-3 items-center justify-between">
          {view === "table" && selected.size > 0 && actions.length > 0 ? (
            <BulkBar
              modelLabel={model.label}
              actions={actions}
              ids={Array.from(selected)}
              onDone={clearSelection}
            />
          ) : (
            <>
              <Filters
                model={model}
                values={filters}
                onValuesChange={setFilters}
              />
              <div className="flex items-center gap-2">
                {view === "list" && !R.isNil(sortableBy) && (
                  <SortSelect
                    model={model}
                    ordering={ordering}
                    onOrderingChange={setOrdering}
                  />
                )}
                {views.length > 1 && (
                  <div className="flex items-center gap-1 rounded-lg border p-1">
                    {views.includes("table") && (
                      <button
                        type="button"
                        title={t("list_view.table_view")}
                        onClick={() => setView("table")}
                        className={cn(
                          "flex items-center justify-center size-6 rounded-md cursor-pointer",
                          view === "table"
                            ? "bg-foreground/10"
                            : "hover:bg-foreground/5 text-muted-foreground",
                        )}
                      >
                        <PiTableBold />
                      </button>
                    )}
                    {views.includes("list") && (
                      <button
                        type="button"
                        title={t("list_view.list_view")}
                        onClick={() => setView("list")}
                        className={cn(
                          "flex items-center justify-center size-6 rounded-md cursor-pointer",
                          view === "list"
                            ? "bg-foreground/10"
                            : "hover:bg-foreground/5 text-muted-foreground",
                        )}
                      >
                        <PiRowsBold />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        {view === "list" ? (
          <ListView items={data.results} model={model} />
        ) : (
          <TableView
            items={data.results}
            model={model}
            selected={selected}
            ordering={ordering}
            onOrderingChange={setOrdering}
            onToggle={toggle}
            onToggleAll={toggleAll}
          />
        )}
        <div className="flex items-center justify-center">
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
      </div>
    </div>
  ) : (
    <div className="flex-1 flex items-center justify-center">
      <Spinner />
    </div>
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
