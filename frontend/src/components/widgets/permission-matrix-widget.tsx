import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PiMagnifyingGlassBold } from "react-icons/pi";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useHttp } from "@/hooks/use-http";
import { cn } from "@/lib/utils";
import type { Model, Resource, WidgetProps } from "@/types";

export interface PermissionOption {
  id: number;
  __str__: string;
  codename: string;
  name: string;
  // The default action the permission is for; null for the model's own.
  action: PermissionAction | null;
  // Whether the editor may grant (or revoke) it: what they have
  // themselves, unless they are a superuser.
  grantable: boolean;
}

export interface PermissionModelOption {
  model: string;
  name: string;
  permissions: PermissionOption[];
}

export interface PermissionAppOption {
  app_label: string;
  name: string;
  models: PermissionModelOption[];
}

type PermissionAction = "add" | "change" | "view" | "delete";

const ACTIONS: PermissionAction[] = ["add", "change", "view", "delete"];

type CheckState = boolean | "indeterminate";

/**
 * Whether all, some or none of the given permissions are selected, for
 * the toggles of a row, a column or an app.
 */
function checkState(
  permissions: PermissionOption[],
  selected: Set<string>,
): CheckState {
  const count = permissions.filter((p) => selected.has(String(p.id))).length;

  if (count === 0) {
    return false;
  }

  return count === permissions.length ? true : "indeterminate";
}

function matches(text: string, search: string) {
  return text.toLowerCase().includes(search);
}

/**
 * The permissions of a many-to-many field to auth.Permission as a matrix:
 * a row per model, grouped by app, with add, change, view and delete
 * columns and the model's own permissions after them. Rows, columns and
 * apps toggle as a whole. Permissions the editor does not have are shown
 * but cannot be changed (the server refuses them too).
 */
export function PermissionMatrixWidget({
  name,
  model,
  value = [],
  onChange,
  readOnly = false,
}: {
  name: string;
  model: Model;
  readOnly?: boolean;
} & WidgetProps<Resource[]>) {
  const { t } = useTranslation();
  const http = useHttp();
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["permission-options", model.label, name],
    async queryFn() {
      const { data } = await http.get<PermissionAppOption[]>(
        `/content/${model.label}/permissions/${name}`,
      );

      return data;
    },
  });

  const selected = useMemo(
    () => new Set(value.map((item) => String(item.id))),
    [value],
  );

  const total = useMemo(
    () =>
      apps.reduce(
        (sum, app) =>
          sum +
          app.models.reduce((count, m) => count + m.permissions.length, 0),
        0,
      ),
    [apps],
  );

  // Whether any model has permissions of its own: the column is left
  // out otherwise.
  const hasOther = useMemo(
    () =>
      apps.some((app) =>
        app.models.some((m) => m.permissions.some((p) => p.action === null)),
      ),
    [apps],
  );

  const visibleApps = useMemo(() => {
    const term = search.trim().toLowerCase();

    return apps
      .map((app) => ({
        ...app,
        models: app.models.filter((m) => {
          if (
            selectedOnly &&
            !m.permissions.some((p) => selected.has(String(p.id)))
          ) {
            return false;
          }

          return (
            !term ||
            matches(app.name, term) ||
            matches(m.name, term) ||
            matches(m.model, term) ||
            m.permissions.some(
              (p) => matches(p.name, term) || matches(p.codename, term),
            )
          );
        }),
      }))
      .filter((app) => app.models.length > 0);
  }, [apps, search, selectedOnly, selected]);

  const visiblePermissions = (
    filter: (permission: PermissionOption) => boolean = () => true,
  ) =>
    visibleApps.flatMap((app) =>
      app.models.flatMap((m) => m.permissions.filter(filter)),
    );

  // Selects or deselects permissions; only the grantable ones change.
  const setPermissions = (permissions: PermissionOption[], on: boolean) => {
    const changeable = permissions.filter((p) => p.grantable);
    const ids = new Set(changeable.map((p) => String(p.id)));

    if (on) {
      const added = changeable
        .filter((p) => !selected.has(String(p.id)))
        .map((p) => ({ id: String(p.id), __str__: p.__str__ }));

      onChange([...value, ...added]);
    } else {
      onChange(value.filter((item) => !ids.has(String(item.id))));
    }
  };

  const toggleProps = (permissions: PermissionOption[], label: string) => {
    const state = checkState(permissions, selected);
    const changeable = permissions.some((p) => p.grantable);

    return {
      checked: state,
      disabled: readOnly || !changeable,
      "aria-label": label,
      onCheckedChange: () => setPermissions(permissions, state !== true),
    };
  };

  const permissionCheckbox = (permission: PermissionOption, label: string) => (
    <Checkbox
      checked={selected.has(String(permission.id))}
      disabled={readOnly || !permission.grantable}
      aria-label={label}
      title={
        permission.grantable
          ? undefined
          : t("widgets.permission_matrix.not_grantable")
      }
      onCheckedChange={(checked) => setPermissions([permission], !!checked)}
    />
  );

  // Whether some permissions are shown that the editor cannot change.
  const hasLocked = useMemo(
    () =>
      !readOnly &&
      apps.some((app) =>
        app.models.some((m) => m.permissions.some((p) => !p.grantable)),
      ),
    [apps, readOnly],
  );

  const actionLabel = (action: PermissionAction) =>
    t(`widgets.permission_matrix.actions.${action}`);

  return (
    <div className="rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2">
        <div className="relative flex-1 min-w-48">
          <PiMagnifyingGlassBold className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("widgets.permission_matrix.search")}
            aria-label={t("widgets.permission_matrix.search")}
            className="h-8 pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Checkbox
            checked={selectedOnly}
            onCheckedChange={(checked) => setSelectedOnly(!!checked)}
          />
          {t("widgets.permission_matrix.selected_only")}
        </label>
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("widgets.permission_matrix.count", {
            count: selected.size,
            total,
          })}
        </span>
      </div>
      {isLoading ? (
        <div role="status" className="py-10 flex justify-center">
          <Spinner />
        </div>
      ) : visibleApps.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground select-none">
          {t("widgets.permission_matrix.no_results")}
        </div>
      ) : (
        <div className="max-h-[32rem] overflow-auto scrollbar">
          <table className="w-full min-w-[36rem] text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="text-left">
                {/* The model column stays in view when the matrix
                    scrolls sideways on narrow screens. */}
                <th className="font-medium px-3 py-2 border-b sticky left-0 z-10 bg-muted">
                  {t("widgets.permission_matrix.model")}
                </th>
                {ACTIONS.map((action) => (
                  <th
                    key={action}
                    className="font-medium px-2 py-2 border-b w-20 text-center"
                  >
                    <label className="inline-flex flex-col items-center gap-1.5">
                      <span>{actionLabel(action)}</span>
                      <Checkbox
                        {...toggleProps(
                          visiblePermissions((p) => p.action === action),
                          t("widgets.permission_matrix.toggle_column", {
                            action: actionLabel(action),
                          }),
                        )}
                      />
                    </label>
                  </th>
                ))}
                {hasOther && (
                  <th className="font-medium px-3 py-2 border-b">
                    {t("widgets.permission_matrix.other")}
                  </th>
                )}
              </tr>
            </thead>
            {visibleApps.map((app) => {
              const appPermissions = app.models.flatMap((m) => m.permissions);

              return (
                <tbody key={app.app_label}>
                  <tr>
                    <th
                      colSpan={ACTIONS.length + (hasOther ? 2 : 1)}
                      className="text-left px-3 pt-3 pb-1.5 border-b bg-background"
                    >
                      <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Checkbox
                          {...toggleProps(
                            appPermissions,
                            t("widgets.permission_matrix.toggle_app", {
                              app: app.name,
                            }),
                          )}
                        />
                        {app.name}
                      </label>
                    </th>
                  </tr>
                  {app.models.map((m) => {
                    const byAction = new Map(
                      m.permissions
                        .filter((p) => p.action !== null)
                        .map((p) => [p.action, p]),
                    );
                    const others = m.permissions.filter(
                      (p) => p.action === null,
                    );

                    return (
                      <tr key={m.model} className="hover:bg-muted/50">
                        <td className="px-3 py-2 border-b sticky left-0 bg-background">
                          <label className="flex items-center gap-2">
                            <Checkbox
                              {...toggleProps(
                                m.permissions,
                                t("widgets.permission_matrix.toggle_model", {
                                  model: m.name,
                                }),
                              )}
                            />
                            <span className="truncate">{m.name}</span>
                          </label>
                        </td>
                        {ACTIONS.map((action) => {
                          const permission = byAction.get(action);

                          return (
                            <td
                              key={action}
                              className="px-2 py-2 border-b text-center"
                            >
                              {permission && (
                                <span className="inline-flex align-middle">
                                  {permissionCheckbox(
                                    permission,
                                    t("widgets.permission_matrix.toggle", {
                                      action: actionLabel(action),
                                      model: m.name,
                                    }),
                                  )}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        {hasOther && (
                          <td className="px-3 py-2 border-b">
                            <div className="flex flex-col gap-1.5">
                              {others.map((permission) => (
                                <label
                                  key={permission.id}
                                  className={cn(
                                    "flex items-center gap-2 whitespace-nowrap",
                                    !permission.grantable &&
                                      "text-muted-foreground",
                                  )}
                                >
                                  {permissionCheckbox(
                                    permission,
                                    permission.name,
                                  )}
                                  <span>{permission.name}</span>
                                </label>
                              ))}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
      {hasLocked && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          {t("widgets.permission_matrix.locked_hint")}
        </p>
      )}
    </div>
  );
}
