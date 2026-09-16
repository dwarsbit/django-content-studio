import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as R from "ramda";
import { useState } from "react";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PiPlus } from "react-icons/pi";

import { FormatRenderer } from "@/components/formats/renderer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHttp } from "@/hooks/use-http";
import { cn } from "@/lib/utils";
import type { Id, Model, PaginatedResponse, Resource } from "@/types";

import { Editor } from "./editor";

export function Inline({
  relModel,
  relId,
  model,
  adminModel,
}: {
  // Related model label
  relModel: string;
  // Related resource id
  relId: Id;
  // Inline model
  model: Model;
  // Inline admin model
  adminModel: { fk_name: string; list_display: string[] | null };
}) {
  const { t } = useTranslation();
  const http = useHttp();
  const queryClient = useQueryClient();
  const [create, setCreate] = useState(false);
  const [page, setPage] = useState(1);
  const readOnly = !model.admin;
  const relName = useWatch({ name: "__str__" });
  const { data, isLoading } = useQuery({
    retry: false,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    queryKey: [
      "resources",
      relModel,
      model.label,
      adminModel.fk_name,
      relId,
      page,
    ],
    async queryFn() {
      const { data } = await http.get<PaginatedResponse<Resource>>(
        `/inlines/${relModel}/${model.label}`,
        {
          params: { [`${adminModel.fk_name}_id`]: relId, page },
        },
      );

      return data;
    },
  });

  return (
    <div className="space-y-4">
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent
          className="sm:max-w-[min(1200px,calc(100vw-48px))] p-0 overflow-hidden flex flex-col"
          showCloseButton={false}
        >
          <Editor
            modelLabel={model.label}
            initialValues={{
              [adminModel.fk_name]: { id: relId, __str__: relName },
            }}
            onSave={async () => {
              setCreate(false);
              await queryClient.invalidateQueries({
                queryKey: [
                  "resources",
                  relModel,
                  model.label,
                  adminModel.fk_name,
                  relId,
                ],
              });
            }}
            onClose={() => setCreate(false)}
          />
        </DialogContent>
      </Dialog>
      <div className="border rounded-lg scrollbar bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              {adminModel.list_display?.map((field) => (
                <TableHead key={field}>
                  <div className="flex items-center">
                    {model.fields[field]?.verbose_name}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <tr>
                <td colSpan={adminModel.list_display?.length}>
                  <div className="flex justify-center py-24">
                    <Spinner />
                  </div>
                </td>
              </tr>
            ) : R.isEmpty(data?.results) ? (
              <tr>
                <td colSpan={adminModel.list_display?.length}>
                  <div className="text-center py-12 text-muted-foreground select-none">
                    {t("editor.empty_state")}
                  </div>
                </td>
              </tr>
            ) : (
              data?.results.map((resource) => (
                <InlineRow
                  key={resource.id}
                  resource={resource}
                  model={model}
                  adminModel={adminModel}
                  relModel={relModel}
                  relId={relId}
                  relName={relName}
                  readOnly={readOnly}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data?.pagination && (
        <div className="flex justify-center">
          <Pagination
            current={data.pagination.current}
            pages={data.pagination.pages}
            onPageChange={setPage}
          />
        </div>
      )}

      <div className="flex justify-center">
        <Button size="sm" variant="outline" onClick={() => setCreate(true)}>
          <PiPlus />
          {t("common.create")}
        </Button>
      </div>
    </div>
  );
}

function InlineRow({
  resource,
  readOnly,
  model,
  relModel,
  adminModel,
  relId,
  relName,
}: {
  relId: Id;
  relName: string;
  relModel: string;
  resource: Resource;
  readOnly: boolean;
  model: Model;
  adminModel: { fk_name: string; list_display: string[] | null };
}) {
  const [edit, setEdit] = useState(false);
  const queryClient = useQueryClient();

  return (
    <>
      <Dialog key={resource.id} open={edit} onOpenChange={setEdit}>
        {!readOnly && (
          <DialogContent
            className="sm:max-w-[min(1200px,calc(100vw-48px))] p-0 overflow-hidden flex flex-col"
            showCloseButton={false}
          >
            <Editor
              modelLabel={model.label}
              id={resource.id}
              initialValues={{
                [adminModel.fk_name]: { id: relId, __str__: relName },
              }}
              onSave={async () => {
                setEdit(false);
                await queryClient.invalidateQueries({
                  queryKey: [
                    "resources",
                    relModel,
                    model.label,
                    adminModel.fk_name,
                    relId,
                  ],
                });
              }}
              onClose={() => setEdit(false)}
              onDelete={() => setEdit(false)}
            />
          </DialogContent>
        )}
      </Dialog>
      <TableRow
        onClick={() => !readOnly && setEdit(true)}
        className={cn({
          "hover:bg-transparent": readOnly,
        })}
      >
        {adminModel.list_display?.map((field) => (
          <TableCell key={field}>
            <FormatRenderer
              value={resource[field]}
              field={model.fields[field]}
            />
          </TableCell>
        ))}
      </TableRow>
    </>
  );
}
