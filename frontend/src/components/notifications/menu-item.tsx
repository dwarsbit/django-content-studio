import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiBellBold } from "react-icons/pi";
import { Link, useMatch } from "react-router";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NARROW_QUERY, useMediaQuery } from "@/hooks/use-media-query";
import { useNotificationStatus } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

import { unreadBadgeText } from "./describe";
import { NotificationList } from "./notification-list";

/**
 * The main menu's Notifications item with the unread badge. It opens
 * the notifications in a popover; on narrow screens it leads to the
 * notifications page instead. The count is in the item's accessible
 * name, so the badge is hidden from assistive technology and no poll
 * is announced.
 */
export function NotificationsMenuItem({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const narrow = useMediaQuery(NARROW_QUERY);
  const [open, setOpen] = useState(false);
  const { data: status } = useNotificationStatus();
  const unread = status?.unread ?? 0;
  const active = !!useMatch("/notifications/*");
  const title = t("notifications.title");
  const label = unread
    ? t("notifications.label_unread", { count: unread })
    : title;
  const className = cn(
    "relative flex items-center h-8 rounded-md text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer",
    active || open
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
    collapsed ? "w-9 mx-auto justify-center" : "w-full px-2 gap-2.5",
  );
  const content = (
    <>
      <span
        className={cn(
          "relative shrink-0 flex items-center justify-center size-4 [&_svg]:size-4",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <PiBellBold />
        {collapsed && unread > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-sidebar"
          />
        )}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left">{title}</span>
          {unread > 0 && (
            <span
              aria-hidden
              data-testid="notifications-badge"
              className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold inline-flex items-center justify-center tabular-nums"
            >
              {unreadBadgeText(unread)}
            </span>
          )}
        </>
      )}
    </>
  );

  const withTooltip = (item: React.ReactElement) =>
    collapsed ? (
      <Tooltip>
        <TooltipTrigger asChild>{item}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    ) : (
      item
    );

  if (narrow) {
    return withTooltip(
      <Link
        to="/notifications"
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {content}
      </Link>,
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {withTooltip(
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={className}
          >
            {content}
          </button>
        </PopoverTrigger>,
      )}
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        aria-label={title}
        className="w-[400px] max-w-[calc(100vw-80px)] p-0 overflow-hidden rounded-xl shadow-lg"
      >
        <NotificationList variant="popover" onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
