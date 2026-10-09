import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as R from "ramda";
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

import { Filters } from "./_components/filters";
import { ListRowsView } from "./_components/list-rows";
import { ListView } from "./_components/list-view";

export function ModelListPage() {
  const { t } = useTranslation();
  const { model: appLabel } = useParams<{ model: string }>();
  const http = useHttp();
  const { data: discover } = useDiscover();
  const model = discover?.models.find(R.whereEq({ label: appLabel }));
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const ordering = searchParams.get("ordering");
  const search = searchParams.get("search");
  // The views the admin offers; more than one shows a toggle. The choice
  // lives in the URL so reloads and shared links keep it.
  const views = model?.admin.list.views ?? ["table"];
  const viewParam = searchParams.get("view");
  const view = views.includes(viewParam ?? "") ? viewParam : views[0];
  const setView = (next: string) => (params: URLSearchParams) => {
    params.set("view", next);
    return params;
  };
  const filters = Array.from(searchParams.entries())
    .filter(([key]) => key.startsWith("filters."))
    .reduce(
      (result, [key, value]) =>
        value
          ? {
              ...result,
              [key.replace("filters.", "")]: value,
            }
          : result,
      {},
    );

  const { data } = useQuery({
    retry: false,
    enabled: !R.isNil(model),
    queryKey: ["resources", appLabel, { search, page, ordering, filters }],
    placeholderData: keepPreviousData,
    async queryFn() {
      const { data } = await http.get<PaginatedResponse<Resource>>(
        `/content/${appLabel}`,
        {
          params: {
            ...filters,
            search: search || undefined,
            page,
            ordering,
          },
        },
      );

      return data;
    },
  });

  return model && data ? (
    <div className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-4 px-8 py-2 border-b">
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
        {views.length > 1 && (
          <div className="flex items-center gap-1 rounded-lg border p-1">
            {views.includes("table") && (
              <button
                type="button"
                title={t("list_view.table_view")}
                onClick={() => setSearchParams(setView("table"))}
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
                onClick={() => setSearchParams(setView("list"))}
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
        {model.admin.permissions.add_permission && (
          <Link
            to={{ hash: `editor:${model.label}` }}
            className={buttonVariants()}
          >
            {t("common.create")}
          </Link>
        )}
      </div>

      <div className="px-8 py-2 border-b">
        <Filters model={model} />
      </div>
      {view === "list" ? (
        <ListRowsView items={data.results} model={model} />
      ) : (
        <ListView items={data.results} model={model} />
      )}
      <div className="py-2 border-t flex items-center justify-center">
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
  ) : (
    <div className="flex-1 flex items-center justify-center">
      <Spinner />
    </div>
  );
}
