import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import {
  fetchSince,
  getToastsEnabled,
  type Notification,
  useMarkRead,
  useNotificationStatus,
} from "@/hooks/use-notifications";

import { describe, isExternal } from "./describe";

// More than this in one poll collapse into one toast.
export const MAX_TOASTS = 3;
// Long enough to read and reach; sonner pauses it on hover and focus.
export const TOAST_DURATION = 8_000;

/**
 * Shows the notifications a poll brings as toasts: never for the ones
 * there when the admin loaded, only while the tab is visible, only when
 * this browser wants them (the settings page's switch), and at most
 * three, else one toast for them all. The toast is an announcement:
 * every notification also stays in the list.
 */
export function NotificationToasts() {
  const { t } = useTranslation();
  const http = useHttp();
  const navigate = useNavigate();
  const { data: discover } = useDiscover();
  const { data: status } = useNotificationStatus();
  const { mutate: markRead } = useMarkRead();
  // The newest change seen; undefined until the first poll answers.
  const seen = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!status) {
      return;
    }

    const previous = seen.current;
    seen.current = status.latest;

    if (
      previous === undefined ||
      !status.latest ||
      (previous && status.latest <= previous) ||
      document.visibilityState === "hidden" ||
      !getToastsEnabled()
    ) {
      return;
    }

    const show = (notifications: Notification[]) => {
      const fresh = notifications.filter((n) => !n.read);

      if (fresh.length === 0) {
        return;
      }

      if (fresh.length > MAX_TOASTS) {
        const first = describe(fresh[0], discover?.models ?? [], t);

        toast(t("notifications.toast_many", { count: fresh.length }), {
          description: first.text,
          duration: TOAST_DURATION,
          action: {
            label: t("notifications.toast_show"),
            onClick: () => navigate("/notifications"),
          },
          cancel: {
            label: t("notifications.mark_all_read"),
            onClick: () => markRead({ before: status.latest! }),
          },
        });
        return;
      }

      for (const notification of fresh) {
        const description = describe(notification, discover?.models ?? [], t);
        const show =
          {
            info: toast,
            success: toast.success,
            warning: toast.warning,
            error: toast.error,
          }[notification.level] ?? toast;

        show(description.text || t("notifications.title"), {
          id: `notification-${notification.id}`,
          description: description.meta || undefined,
          duration: TOAST_DURATION,
          action: description.href
            ? {
                label: t("notifications.toast_open"),
                onClick: () => {
                  markRead({ ids: [notification.id] });

                  if (isExternal(description.href!)) {
                    window.open(description.href!, "_blank", "noopener");
                  } else {
                    navigate(description.href!);
                  }
                },
              }
            : undefined,
          cancel: {
            label: t("notifications.mark_read"),
            onClick: () => markRead({ ids: [notification.id] }),
          },
        });
      }
    };

    fetchSince(http, previous ?? new Date(0).toISOString())
      .then((data) => show(data.results))
      .catch(() => undefined);
  }, [status, http, t, navigate, markRead, discover?.models]);

  return null;
}
