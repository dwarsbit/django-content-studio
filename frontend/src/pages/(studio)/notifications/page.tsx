import { useTranslation } from "react-i18next";
import { PiBellBold } from "react-icons/pi";

import { NotificationList } from "@/components/notifications/notification-list";
import { PageHeader } from "@/components/ui/page-header";

/**
 * The notifications as a page: reached from the popover's See all, and
 * what the main menu item opens on narrow screens.
 */
export function NotificationsPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader icon={<PiBellBold />} title={t("notifications.title")} />
      <div className="flex-1 min-h-0 flex flex-col w-full max-w-3xl mx-auto sm:px-6 sm:py-6">
        <div className="flex-1 min-h-0 flex flex-col sm:border sm:rounded-xl overflow-hidden bg-card">
          <NotificationList variant="page" />
        </div>
      </div>
    </>
  );
}
