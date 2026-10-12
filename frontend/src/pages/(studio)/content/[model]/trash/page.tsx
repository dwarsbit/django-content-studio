import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import * as R from "ramda";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import { getErrorMessage } from "@/lib/utils";
import type { Model, PaginatedResponse, Resource } from "@/types";

dayjs.extend(localizedFormat);

// The model's trash: the soft-deleted objects, most recently deleted
// first, with restore and permanent delete. Reached from the list view
// and deep-linkable at /content/<model>/trash.
export function ContentTrashPage() {
  const { model: appLabel } = useParams<{ model: string }>();
  const { data: discover } = useDiscover();
  const model = discover?.models.find(R.whereEq({ label: appLabel }));

  return model ? (
    <TrashView model={model} />
  ) : (
    <div className="py-12 flex items-center justify-center">
      <Spinner />
    </div>
  );
}

function TrashView({ model }: { model: Model }) {
  const { t } = useTranslation();
  const http = useHttp();
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const hasTrash = model.admin.list.trash ?? false;

  const { data } = useQuery({
    retry: false,
    enabled: hasTrash,
    queryKey: ["trash", model.label, page],
    placeholderData: keepPreviousData,
    async queryFn() {
      const { data } = await http.get<PaginatedResponse<Resource>>(
        `/content/${model.label}/trash`,
        { params: { page } },
      );

      return data;
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["trash", model.label] });
    await queryClient.invalidateQueries({
      queryKey: ["resources", model.label],
    });
  };

  const { mutateAsync: restore } = useMutation({
    async mutationFn(id: string) {
      await http.post(`/content/${model.label}/${id}/restore`);
    },
    onSuccess: invalidate,
  });

  const { mutateAsync: destroy } = useMutation({
    async mutationFn(id: string) {
      await http.delete(`/content/${model.label}/${id}/destroy`);
    },
    onSuccess: invalidate,
  });

  async function onRestore(id: string) {
    try {
      await restore(id);
      toast.success(t("trash.restored"));
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  async function onDestroy(id: string) {
    const confirmed = await confirm({ description: t("trash.delete_confirm") });

    if (!confirmed) {
      return;
    }

    try {
      await destroy(id);
      toast.success(t("trash.destroyed"));
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  const canRestore = model.admin.permissions.change_permission;
  const canDestroy = model.admin.permissions.delete_permission;

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-4 px-8 py-3 border-b">
        <div className="select-none flex-1">
          <h1 className="text-lg font-semibold">
            {t("trash.title", { model: model.verbose_name_plural })}
          </h1>
          <div className="text-muted-foreground">{t("trash.subtitle")}</div>
        </div>
        <Link
          to={`/content/${model.label}`}
          className={buttonVariants({ variant: "outline" })}
        >
          {t("editor.back_to_list")}
        </Link>
      </div>

      <div className="px-8 py-6 space-y-4 w-full max-w-[1128px] mx-auto">
        {!hasTrash ? (
          <div className="text-muted-foreground">{t("trash.unavailable")}</div>
        ) : !data ? (
          <div className="py-12 flex items-center justify-center">
            <Spinner />
          </div>
        ) : R.isEmpty(data.results) ? (
          <div className="text-muted-foreground">{t("trash.empty")}</div>
        ) : (
          <table className="w-full border">
            <tbody>
              {data.results.map((row) => (
                <tr key={row.id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 font-medium">
                    <div className="line-clamp-1">{row.__str__}</div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                    {dayjs(String(row.removed_at)).format("lll")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {canRestore && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onRestore(String(row.id))}
                        >
                          {t("trash.restore")}
                        </Button>
                      )}
                      {canDestroy && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onDestroy(String(row.id))}
                        >
                          {t("trash.delete_permanently")}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination
          current={data?.pagination.current ?? 1}
          pages={data?.pagination.pages ?? 1}
          onPageChange={(next) =>
            setSearchParams((searchParams) => {
              searchParams.set("page", `${next}`);
              return searchParams;
            })
          }
        />
      </div>
    </div>
  );
}
