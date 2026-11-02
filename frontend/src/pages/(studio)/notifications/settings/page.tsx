import * as R from "ramda";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PiBellBold,
  PiCaretRightBold,
  PiCheckBold,
  PiWarningCircleBold,
} from "react-icons/pi";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useDiscover } from "@/hooks/use-discover";
import {
  getToastsEnabled,
  type GridAction,
  type ModelSettings,
  setToastsEnabled,
  useNotificationSettings,
  useSaveDigestSettings,
  useSaveEventSettings,
  useSaveModelSettings,
  useUnfollow,
} from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";
import { useTenant } from "@/tenant";
import type { Model } from "@/types";

const ACTIONS: GridAction[] = ["created", "updated", "deleted", "restored"];

const GRID =
  "grid grid-cols-[minmax(10rem,1fr)_10.5rem_repeat(4,5rem)] items-center px-4";

function Card({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border rounded-xl shadow-md overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function GridRow({
  model,
  row,
  onChange,
}: {
  model: Model;
  row: ModelSettings;
  onChange(row: ModelSettings): void;
}) {
  const { t } = useTranslation();
  const singleton = model.admin.is_singleton;
  const name = model.verbose_name_plural;

  return (
    <div className={cn(GRID, "min-h-12 border-b last:border-b-0")}>
      <span className="font-medium text-sm truncate first-letter:uppercase">
        {name}
      </span>
      <div className="w-40">
        {singleton ? (
          <span className="text-xs text-muted-foreground">
            {t("notifications.settings.one_object")}
          </span>
        ) : (
          <Select
            value={row.scope}
            onValueChange={(scope) =>
              onChange({ ...row, scope: scope as ModelSettings["scope"] })
            }
          >
            <SelectTrigger
              size="sm"
              className="w-full"
              aria-label={t("notifications.settings.scope_label", { name })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("notifications.settings.scope_all")}
              </SelectItem>
              <SelectItem value="mine">
                {t("notifications.settings.scope_mine")}
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      {ACTIONS.map((action) => {
        // Your own creation never notifies you: with "Created by me"
        // the column cannot apply.
        const shown =
          action in row.events &&
          !(action === "created" && row.scope === "mine");

        return (
          <span key={action} className="flex justify-center">
            {shown && (
              <Checkbox
                checked={!!row.events[action]}
                aria-label={t("notifications.settings.cell_label", {
                  name,
                  action: t(`notifications.settings.${action}`),
                })}
                onCheckedChange={(checked) =>
                  onChange({
                    ...row,
                    events: { ...row.events, [action]: checked === true },
                  })
                }
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

function ModelGroupRows({
  label,
  rows,
  models,
  onChange,
}: {
  label: string;
  rows: ModelSettings[];
  models: Model[];
  onChange(row: ModelSettings): void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const on = rows.reduce(
    (count, row) => count + Object.values(row.events).filter(Boolean).length,
    0,
  );

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        className="w-full flex items-center gap-1.5 px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground text-left outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <PiCaretRightBold
          className={cn("size-3 transition-transform", expanded && "rotate-90")}
        />
        <span className="flex-1 first-letter:uppercase">{label}</span>
        {!expanded && (
          <span className="font-normal">
            {t("notifications.settings.events_on", { count: on })}
          </span>
        )}
      </button>
      {expanded &&
        rows.map((row) => {
          const model = models.find(R.whereEq({ label: row.model }));

          return model ? (
            <GridRow
              key={row.model}
              model={model}
              row={row}
              onChange={onChange}
            />
          ) : null;
        })}
    </div>
  );
}

/**
 * The notification settings: per model which changes notify the user
 * and about which objects, the events the site registered, the
 * followed objects, and whether this browser shows toasts. Every
 * change is saved as it is made.
 */
export function NotificationSettingsPage() {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const { enabled: multitenancy, tenant } = useTenant();
  const {
    data: settings,
    isPending,
    isError,
    refetch,
  } = useNotificationSettings();
  const saveModel = useSaveModelSettings();
  const saveEvent = useSaveEventSettings();
  const unfollow = useUnfollow();
  const saveDigest = useSaveDigestSettings();
  const [toasts, setToasts] = useState(getToastsEnabled);
  const [saved, setSaved] = useState(false);
  const models = discover?.models ?? [];
  const onSaved = { onSuccess: () => setSaved(true) };
  const failed =
    saveModel.isError ||
    saveEvent.isError ||
    unfollow.isError ||
    saveDigest.isError;

  // The grid follows the main menu's groups; models in none come last.
  const groups = (() => {
    if (!settings) {
      return [];
    }

    const seen = new Set<string>();
    const result = (discover?.model_groups ?? []).map((group) => {
      const rows = group.models
        .map((label) => settings.models.find(R.whereEq({ model: label })))
        .filter((row): row is ModelSettings => !!row);

      rows.forEach((row) => seen.add(row.model));

      return { name: group.name, label: group.label, rows };
    });
    const rest = settings.models.filter((row) => !seen.has(row.model));

    if (rest.length) {
      result.push({
        name: "__other",
        label: t("notifications.settings.other_models"),
        rows: rest,
      });
    }

    return result.filter((group) => group.rows.length > 0);
  })();

  let body;

  if (isError) {
    body = (
      <EmptyState
        icon={<PiWarningCircleBold />}
        title={t("notifications.settings.error")}
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            {t("notifications.retry")}
          </Button>
        }
      />
    );
  } else if (isPending) {
    body = (
      <div className="py-16 flex justify-center">
        <Spinner />
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-6 max-w-4xl">
        {multitenancy && tenant && (
          <p className="text-sm text-muted-foreground">
            {t("notifications.settings.tenant", { tenant: tenant.__str__ })}
          </p>
        )}
        <Card
          title={t("notifications.settings.content_title")}
          description={t("notifications.settings.content_description")}
        >
          <div className="overflow-x-auto scrollbar">
            <div className="min-w-[44rem]">
              <div
                className={cn(
                  GRID,
                  "h-9 bg-muted border-y text-xs font-medium text-muted-foreground",
                )}
              >
                <span>{t("notifications.settings.model")}</span>
                <span>{t("notifications.settings.which")}</span>
                {ACTIONS.map((action) => (
                  <span key={action} className="text-center">
                    {t(`notifications.settings.${action}`)}
                  </span>
                ))}
              </div>
              {groups.map((group) => (
                <ModelGroupRows
                  key={group.name}
                  label={group.label}
                  rows={group.rows}
                  models={models}
                  onChange={(row) => saveModel.mutate(row, onSaved)}
                />
              ))}
            </div>
          </div>
          <p className="px-4 py-3 text-xs text-muted-foreground border-t">
            {t("notifications.settings.scope_note")}
          </p>
        </Card>

        {settings.events.length > 0 && (
          <Card
            title={t("notifications.settings.events_title")}
            description={t("notifications.settings.events_description")}
          >
            {settings.events.map((event) => (
              <div
                key={event.key}
                className="flex items-center gap-4 px-4 py-3 border-t"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={`event-${event.key}`}
                      className="text-sm font-medium"
                    >
                      {event.label}
                    </label>
                    {event.required && (
                      <Badge variant="secondary">
                        {t("notifications.settings.required")}
                      </Badge>
                    )}
                  </div>
                  {event.description && (
                    <div className="text-sm text-muted-foreground">
                      {event.description}
                    </div>
                  )}
                </div>
                <Switch
                  id={`event-${event.key}`}
                  checked={event.enabled}
                  disabled={event.required}
                  onCheckedChange={(enabled) =>
                    saveEvent.mutate({ key: event.key, enabled }, onSaved)
                  }
                />
              </div>
            ))}
          </Card>
        )}

        <Card
          title={t("notifications.settings.followed_title")}
          description={t("notifications.settings.followed_description")}
        >
          {settings.follows.length === 0 ? (
            <div className="px-4 py-3 border-t text-sm text-muted-foreground">
              {t("notifications.settings.followed_empty")}
            </div>
          ) : (
            <ul>
              {settings.follows.map((follow) => {
                const model = models.find(R.whereEq({ label: follow.model }));

                return (
                  <li
                    key={`${follow.model}:${follow.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 border-t"
                  >
                    <div className="flex-1 min-w-0">
                      <Link
                        to={
                          model?.admin.is_singleton
                            ? `/content/${follow.model}`
                            : `/content/${follow.model}/${follow.id}`
                        }
                        className="text-sm font-medium hover:underline"
                      >
                        {follow.repr}
                      </Link>
                      <div className="text-xs text-muted-foreground first-letter:uppercase">
                        {model?.verbose_name ?? follow.model}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={t("notifications.settings.unfollow_label", {
                        name: follow.repr,
                      })}
                      onClick={() =>
                        unfollow.mutate(
                          { model: follow.model, id: follow.id },
                          onSaved,
                        )
                      }
                    >
                      {t("notifications.follow.unfollow")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {settings.digest && (
          <section className="bg-card border rounded-xl shadow-md flex items-center gap-4 p-4">
            <div className="flex-1 min-w-0">
              <label
                htmlFor="notification-digest"
                className="text-sm font-semibold"
              >
                {t("notifications.settings.digest_title")}
              </label>
              <div className="text-sm text-muted-foreground">
                {settings.digest.email
                  ? t("notifications.settings.digest_description", {
                      email: settings.digest.email,
                    })
                  : t("notifications.settings.digest_no_email")}
              </div>
            </div>
            <Switch
              id="notification-digest"
              checked={settings.digest.enabled}
              disabled={!settings.digest.email}
              onCheckedChange={(enabled) =>
                saveDigest.mutate({ enabled }, onSaved)
              }
            />
          </section>
        )}

        <section className="bg-card border rounded-xl shadow-md flex items-center gap-4 p-4">
          <div className="flex-1 min-w-0">
            <label
              htmlFor="notification-toasts"
              className="text-sm font-semibold"
            >
              {t("notifications.settings.toasts_title")}
            </label>
            <div className="text-sm text-muted-foreground">
              {t("notifications.settings.toasts_description")}
            </div>
          </div>
          <Switch
            id="notification-toasts"
            checked={toasts}
            onCheckedChange={(enabled) => {
              setToastsEnabled(enabled);
              setToasts(enabled);
              setSaved(true);
            }}
          />
        </section>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        icon={<PiBellBold />}
        title={t("notifications.settings.title")}
        description={t("notifications.settings.description")}
        actions={
          <span
            role="status"
            className="text-xs text-muted-foreground inline-flex items-center gap-1.5"
          >
            {failed ? (
              <span className="text-destructive">
                {t("notifications.settings.save_failed")}
              </span>
            ) : (
              saved && (
                <>
                  <PiCheckBold className="text-success" />
                  {t("notifications.settings.saved")}
                </>
              )
            )}
          </span>
        }
      />
      <PageBody>{body}</PageBody>
    </>
  );
}
