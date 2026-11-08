import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PiUserCircleBold } from "react-icons/pi";

import { HeaderTabs } from "@/components/header-tabs";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ProfileUser } from "@/hooks/use-profile";

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

/** The page header with the Overview and Edit profile tabs. */
export function ProfileHeader({
  current,
  actions,
}: {
  current: "/profile" | "/profile/edit";
  actions?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <PageHeader
      icon={<PiUserCircleBold />}
      title={t("profile.title")}
      actions={actions}
    >
      <HeaderTabs
        current={current}
        tabs={[
          { label: t("profile.overview"), to: "/profile" },
          { label: t("profile.edit"), to: "/profile/edit" },
        ]}
      />
    </PageHeader>
  );
}

/**
 * Who the user is: their picture or initials, name, username and email
 * address, superuser and group badges, and since when and last when
 * they signed in.
 */
export function ProfileCard({ user }: { user?: ProfileUser }) {
  const { t } = useTranslation();

  if (!user) {
    return (
      <section
        aria-busy
        className="rounded-lg border bg-card shadow-xs p-5 flex items-center gap-4"
      >
        <div className="size-16 shrink-0 rounded-full bg-muted animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-48 rounded bg-muted animate-pulse" />
          <div className="h-3.5 w-64 rounded bg-muted animate-pulse" />
        </div>
      </section>
    );
  }

  const name = user.name || user.username;
  const subtitle = [user.name ? user.username : "", user.email]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-lg border bg-card shadow-xs p-5 flex flex-wrap items-center gap-4">
      <UserAvatar
        name={name}
        initials={user.initials || null}
        src={user.avatar}
        className="size-16 [&_[data-slot=avatar-fallback]]:text-xl"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-semibold tracking-tight truncate">
            {name}
          </h2>
          {user.is_superuser && (
            <Badge tone="yellow">{t("profile.superuser")}</Badge>
          )}
          {user.groups.map((group) => (
            <Badge key={group} tone="gray">
              {group}
            </Badge>
          ))}
        </div>
        {subtitle && (
          <div className="text-sm text-muted-foreground mt-0.5 truncate">
            {subtitle}
          </div>
        )}
      </div>
      {(user.date_joined || user.last_login) && (
        <dl className="flex gap-8 text-sm">
          {user.date_joined && (
            <div>
              <dt className="text-muted-foreground">
                {t("profile.member_since")}
              </dt>
              <dd
                className="font-medium"
                title={dayjs(user.date_joined).format("LLL")}
              >
                {dayjs(user.date_joined).format("MMMM YYYY")}
              </dd>
            </div>
          )}
          {user.last_login && (
            <div>
              <dt className="text-muted-foreground">
                {t("profile.last_login")}
              </dt>
              <dd
                className="font-medium"
                title={dayjs(user.last_login).format("LLL")}
              >
                {dayjs(user.last_login).fromNow()}
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
