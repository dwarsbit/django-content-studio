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
import { MoveMenu, Reorderable, RowDragHandle } from "@/components/reorderable";
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
import { useMoveResource } from "@/hooks/use-move-resource";
import { useReorderableRow } from "@/hooks/use-reorderable-row";
import { getEdges, type Move } from "@/lib/reorder";
import { cn } from "@/lib/utils";
import type {
  FieldFormat,
  FormField,
  Id,
  Model,
  PaginatedResponse,
  Permissions,
  Resource,
} from "@/types";

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
  adminModel: {
    fk_name: string;
    readonly_fields?: string[];
    prepopulated_fields?: Record<string, string[]>;
    table_display: Model["admin"]["edit"]["inlines"][number]["table_display"];
    reorderable?: boolean;
    header?: FormField[];
    permissions?: Permissions;
  };
}) {
  const { t } = useTranslation();
  const http = useHttp();
  const queryClient = useQueryClient();
  const [create, setCreate] = useState(false);
  const [page, setPage] = useState(1);
  const readOnly = !model.admin;
  // Without add permission there is nothing to create; rows still open
  // read-only for editors who may only view them.
  const canAdd = !readOnly && (adminModel.permissions?.add_permission ?? true);
  const relName = useWatch({ name: "__str__" });
  const listKey = [
    "resources",
    relModel,
    model.label,
    adminModel.fk_name,
    relId,
  ];
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

  const { mutate: move } = useMoveResource({
    endpoint: `/inlines/${relModel}/${model.label}`,
    queryKey: [...listKey, page],
    invalidateKey: listKey,
  });
  // Inline rows are always in their manual order: no search or
  // ordering can turn reordering off.
  const onMove = adminModel.reorderable
    ? (id: Id, next: Move) => move({ id, move: next })
    : undefined;
  const columns = (adminModel.table_display?.length ?? 0) + (onMove ? 2 : 0);

  return (
    <div className="space-y-4">
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent
          className="sm:max-w-[min(1200px,calc(100vw-48px))] p-0 overflow-hidden flex flex-col"
          showCloseButton={false}
        >
          <Editor
            dialog
            modelLabel={model.label}
            inlineOf={relModel}
            headerComponents={adminModel.header}
            initialValues={{
              [adminModel.fk_name]: { id: relId, __str__: relName },
              // The inline studio decides what is read-only, not the
              // inline model's own studio.
              __readonly_fields__: adminModel.readonly_fields ?? [],
            }}
            prepopulatedFields={adminModel.prepopulated_fields ?? {}}
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
      <div className="border rounded-lg scrollbar bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {onMove && (
                <TableHead className="w-8">
                  <span className="sr-only">{t("reorder.drag")}</span>
                </TableHead>
              )}
              {adminModel.table_display?.map(({ name, header }) => (
                <TableHead key={name}>
                  {header ?? model.fields[name]?.verbose_name}
                </TableHead>
              ))}
              {onMove && (
                <TableHead className="w-10">
                  <span className="sr-only">{t("reorder.menu")}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <tr>
                <td colSpan={columns}>
                  <div className="flex justify-center py-24">
                    <Spinner />
                  </div>
                </td>
              </tr>
            ) : R.isEmpty(data?.results) ? (
              <tr>
                <td colSpan={columns}>
                  <div className="text-center py-12 text-muted-foreground select-none">
                    {t("editor.empty_state")}
                  </div>
                </td>
              </tr>
            ) : (
              data &&
              (onMove ? (
                <Reorderable
                  ids={data.results.map((resource) => resource.id)}
                  getLabel={(id) =>
                    data.results.find(
                      (resource) => String(resource.id) === String(id),
                    )?.__str__ ?? id
                  }
                  onMove={onMove}
                >
                  {data.results.map((resource, index) => (
                    <SortableInlineRow
                      key={resource.id}
                      resource={resource}
                      edges={getEdges(index, data.results.length, {
                        isFirstPage: data.pagination.current <= 1,
                        isLastPage:
                          data.pagination.current >= data.pagination.pages,
                      })}
                      model={model}
                      adminModel={adminModel}
                      relModel={relModel}
                      relId={relId}
                      relName={relName}
                      readOnly={readOnly}
                      onMove={onMove}
                    />
                  ))}
                </Reorderable>
              ) : (
                data.results.map((resource) => (
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

      {canAdd && (
        <div className="flex justify-center">
          <Button size="sm" variant="outline" onClick={() => setCreate(true)}>
            <PiPlus />
            {t("common.create")}
          </Button>
        </div>
      )}
    </div>
  );
}

function SortableInlineRow(
  props: Omit<Parameters<typeof InlineRow>[0], "sortable">,
) {
  const sortable = useReorderableRow(props.resource.id);

  return <InlineRow {...props} sortable={sortable} />;
}

function InlineRow({
  resource,
  readOnly,
  model,
  relModel,
  adminModel,
  relId,
  relName,
  onMove,
  sortable,
  edges,
}: {
  relId: Id;
  relName: string;
  relModel: string;
  resource: Resource;
  readOnly: boolean;
  model: Model;
  adminModel: {
    fk_name: string;
    readonly_fields?: string[];
    prepopulated_fields?: Record<string, string[]>;
    table_display: Model["admin"]["edit"]["inlines"][number]["table_display"];
    reorderable?: boolean;
    header?: FormField[];
    permissions?: Permissions;
  };
  onMove?: (id: Id, move: Move) => void;
  sortable?: ReturnType<typeof useReorderableRow>;
  edges?: ReturnType<typeof getEdges>;
}) {
  const [edit, setEdit] = useState(false);
  const queryClient = useQueryClient();
  const canChange = adminModel.permissions?.change_permission ?? true;

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
              inlineOf={relModel}
              id={resource.id}
              headerComponents={adminModel.header}
              readOnly={!canChange}
              canDelete={adminModel.permissions?.delete_permission ?? true}
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
        ref={sortable?.ref}
        style={sortable?.style}
        onClick={() => !readOnly && setEdit(true)}
        className={cn({
          "hover:bg-transparent": readOnly,
          "bg-muted shadow-sm": sortable?.isDragging,
        })}
      >
        {sortable && (
          <TableCell className="w-8 pr-0">
            <RowDragHandle handleProps={sortable.handleProps} />
          </TableCell>
        )}
        {adminModel.table_display?.map(({ name, format }, index) => (
          <TableCell key={name} className={cn({ "font-medium": index === 0 })}>
            <FormatRenderer
              value={resource[name]}
              field={model.fields[name]}
              formatName={(format as FieldFormat | null) ?? undefined}
            />
          </TableCell>
        ))}
        {onMove && (
          <TableCell
            className="w-10"
            onClick={(event) => event.stopPropagation()}
          >
            <MoveMenu onMove={(move) => onMove(resource.id, move)} {...edges} />
          </TableCell>
        )}
      </TableRow>
    </>
  );
}
