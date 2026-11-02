import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PiArrowUpBold,
  PiBellBold,
  PiCheckBold,
  PiCheckCircleBold,
  PiWarningBold,
  PiWarningCircleBold,
} from "react-icons/pi";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useDiscover } from "@/hooks/use-discover";
import {
  type Notification,
  type NotificationFilter,
  useArrivedSince,
  useMarkRead,
  useNotificationList,
  useNotificationStatus,
} from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

import {
  dayGroup,
  describe,
  isContentEvent,
  isExternal,
  relativeTimeOf,
} from "./describe";

const GROUPS = ["today", "yesterday", "earlier"] as const;

export function NotificationIcon({
  notification,
}: {
  notification: Notification;
}) {
  if (isContentEvent(notification) && notification.actor) {
    return (
      <UserAvatar
        aria-hidden
        name={notification.actor.name}
        initials={notification.actor.initials}
        src={notification.actor.avatar}
        className="size-8 shrink-0 [&_[data-slot=avatar-fallback]]:text-[11px]"
      />
    );
  }

  const tone = {
    info: "bg-muted border text-muted-foreground",
    success: "bg-success/12 text-success",
    warning: "bg-warning/12 text-warning",
    error: "bg-destructive/12 text-destructive",
  }[notification.level];
  const Icon = {
    info: PiBellBold,
    success: PiCheckCircleBold,
    warning: PiWarningBold,
    error: PiWarningCircleBold,
  }[notification.level];

  return (
    <span
      aria-hidden
      className={cn(
        "size-8 shrink-0 rounded-full flex items-center justify-center [&_svg]:size-4",
        tone,
      )}
    >
      <Icon />
    </span>
  );
}

function NotificationRow({
  notification,
  onNavigate,
}: {
  notification: Notification;
  onNavigate?(): void;
}) {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const { mutate: markRead } = useMarkRead();
  const description = describe(notification, discover?.models ?? [], t);
  const time = relativeTimeOf(notification);
  const label = [
    description.text,
    description.objects,
    [description.meta, time].filter(Boolean).join(", "),
    notification.read ? null : t("notifications.unread"),
  ]
    .filter(Boolean)
    .join(". ");

  const open = () => {
    if (!notification.read) {
      markRead({ ids: [notification.id] });
    }
  };

  const content = (
    <>
      <NotificationIcon notification={notification} />
      <span aria-hidden className="flex-1 min-w-0 block">
        <span
          className={cn(
            "block",
            notification.read ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {description.sentence}
        </span>
        {description.objects && (
          <span className="block truncate text-xs text-muted-foreground">
            {description.objects}
          </span>
        )}
        <span className="block mt-0.5 text-xs text-muted-foreground first-letter:uppercase">
          {[description.meta, time].filter(Boolean).join(" · ")}
        </span>
      </span>
    </>
  );
  const className =
    "flex-1 min-w-0 flex gap-3 py-2.5 pl-4 pr-1 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset cursor-pointer";

  let row;

  if (description.href && isExternal(description.href)) {
    row = (
      <a
        href={description.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className={className}
        onClick={() => {
          open();
          onNavigate?.();
        }}
      >
        {content}
      </a>
    );
  } else if (description.href) {
    row = (
      <Link
        to={description.href}
        aria-label={label}
        className={className}
        onClick={() => {
          open();
          onNavigate?.();
        }}
      >
        {content}
      </Link>
    );
  } else {
    row = (
      <button
        type="button"
        aria-label={label}
        className={className}
        onClick={open}
      >
        {content}
      </button>
    );
  }

  return (
    <li
      className={cn(
        "flex items-start",
        !notification.read && "bg-accent/60",
        "hover:bg-accent",
      )}
    >
      {row}
      <div className="w-9 shrink-0 pt-3.5 pr-3 flex justify-end">
        {!notification.read && (
          <button
            type="button"
            title={t("notifications.mark_read")}
            aria-label={t("notifications.mark_read_label", {
              text: description.text,
            })}
            className="size-6 rounded-full flex items-center justify-center outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer"
            onClick={() => markRead({ ids: [notification.id] })}
          >
            <span className="size-2 rounded-full bg-primary" />
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * The notifications, with the Unread and All tabs, mark all as read,
 * the "new" pill when more arrive while it is open, and its footer:
 * the popover of the main menu and the notifications page.
 */
export function NotificationList({
  variant,
  onNavigate,
}: {
  variant: "popover" | "page";
  // Called when a row or a footer link leads elsewhere.
  onNavigate?(): void;
}) {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const [filter, setFilter] = useState<NotificationFilter>("unread");
  const { data: status } = useNotificationStatus();
  const list = useNotificationList(filter);
  const { mutate: markRead, isPending: isMarking } = useMarkRead();
  // When the shown rows were loaded: newer ones wait behind the pill.
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const arrived = useArrivedSince(loadedAt);
  const notifications = list.data?.pages.flatMap((page) => page.results) ?? [];
  const unread = status?.unread ?? 0;
  const retention = discover?.notifications?.retention;

  useEffect(() => {
    if (list.isSuccess && !list.isFetching) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the time of the list on screen, set once a load settles
      setLoadedAt((previous) => previous ?? status?.latest ?? "");
    }
  }, [list.isSuccess, list.isFetching, status?.latest]);

  const showArrived = async () => {
    setLoadedAt(null);
    await list.refetch();
  };

  const footer = (
    <div className="px-4 py-2.5 border-t bg-muted flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>
        {retention ? t("notifications.retention", { count: retention }) : ""}
      </span>
      <span className="flex gap-3 shrink-0">
        {variant === "popover" && (
          <Link
            to="/notifications"
            className="font-medium text-foreground hover:underline"
            onClick={onNavigate}
          >
            {t("notifications.see_all")}
          </Link>
        )}
        <Link
          to="/notifications/settings"
          className="font-medium text-foreground hover:underline"
          onClick={onNavigate}
        >
          {t("notifications.settings_link")}
        </Link>
      </span>
    </div>
  );

  let body;

  if (list.isError) {
    body = (
      <div role="alert">
        <EmptyState
          icon={<PiWarningCircleBold />}
          title={t("notifications.error_title")}
          description={t("notifications.error_description")}
          action={
            <Button variant="outline" size="sm" onClick={() => list.refetch()}>
              {t("notifications.retry")}
            </Button>
          }
          className="py-12"
        />
      </div>
    );
  } else if (list.isPending) {
    body = (
      <div className="py-12 flex justify-center" role="status">
        <Spinner />
        <span className="sr-only">{t("notifications.loading")}</span>
      </div>
    );
  } else if (notifications.length === 0) {
    body = (
      <EmptyState
        icon={filter === "unread" ? <PiCheckBold /> : <PiBellBold />}
        title={t(
          filter === "unread"
            ? "notifications.empty_unread_title"
            : "notifications.empty_all_title",
        )}
        description={t(
          filter === "unread"
            ? "notifications.empty_unread_description"
            : "notifications.empty_all_description",
        )}
        className="py-12"
      />
    );
  } else {
    body = GROUPS.map((group) => {
      const items = notifications.filter(
        (notification) => dayGroup(notification) === group,
      );

      return items.length ? (
        <section key={group} aria-label={t(`notifications.${group}`)}>
          <h3 className="px-4 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">
            {t(`notifications.${group}`)}
          </h3>
          <ul>
            {items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </section>
      ) : null;
    });
  }

  return (
    <div
      className={cn(
        "flex flex-col min-h-0",
        variant === "popover" ? "max-h-[min(640px,80vh)]" : "flex-1",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2",
          variant === "popover"
            ? "flex-wrap pl-4 pr-3 pt-3 pb-2"
            : "px-4 pt-3 pb-2",
        )}
      >
        {variant === "popover" && (
          <h2 className="flex-1 text-sm font-semibold">
            {t("notifications.title")}
          </h2>
        )}
        <Tabs
          value={filter}
          onValueChange={(value) => {
            setFilter(value as NotificationFilter);
            setLoadedAt(null);
          }}
          className={variant === "popover" ? "order-last w-full" : "flex-1"}
        >
          <TabsList>
            <TabsTrigger value="unread">
              {unread
                ? t("notifications.unread_tab_count", { count: unread })
                : t("notifications.unread_tab")}
            </TabsTrigger>
            <TabsTrigger value="all">{t("notifications.all_tab")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant="ghost"
          size="xs"
          disabled={unread === 0 || isMarking}
          onClick={() =>
            markRead({ before: status?.latest ?? new Date().toISOString() })
          }
        >
          {t("notifications.mark_all_read")}
        </Button>
      </div>
      <div
        className={cn(
          "flex-1 min-h-0 overflow-y-auto scrollbar border-t",
          variant === "page" && "border-b",
        )}
      >
        {arrived > 0 && (
          <div className="px-4 py-2 flex justify-center border-b bg-muted">
            <button
              type="button"
              className="h-6 px-2.5 rounded-full bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer"
              onClick={showArrived}
            >
              <PiArrowUpBold className="size-3" />
              {t("notifications.new", { count: arrived })}
            </button>
          </div>
        )}
        {body}
        {list.hasNextPage && variant === "page" && (
          <div className="py-3 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              isLoading={list.isFetchingNextPage}
              onClick={() => list.fetchNextPage()}
            >
              {t("notifications.load_more")}
            </Button>
          </div>
        )}
      </div>
      {footer}
    </div>
  );
}
