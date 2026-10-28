import { useTranslation } from "react-i18next";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import type { PresenceUser } from "@/types";

function usePresenceLabel() {
  const { t } = useTranslation();

  return (user: PresenceUser) =>
    t(user.state === "editing" ? "presence.editing" : "presence.viewing", {
      name: user.name,
    });
}

// An editing user's avatar gets a ring in the warning color, the color
// of unsaved changes; a viewing user's a ring in the page color, which
// separates the overlapping avatars.
function PresenceAvatar({
  user,
  className,
}: {
  user: PresenceUser;
  className?: string;
}) {
  return (
    <UserAvatar
      name={user.name}
      initials={user.initials}
      src={user.avatar}
      data-state={user.state}
      className={cn(
        "ring-2",
        user.state === "editing" ? "ring-warning" : "ring-background",
        className,
      )}
    />
  );
}

/**
 * The other users who have the object open, on the edit page: a stack of
 * avatars, each with a tooltip naming the user and whether they are
 * viewing or editing.
 */
export function PresenceAvatars({
  users,
  max = 4,
  className,
}: {
  users: PresenceUser[];
  max?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const label = usePresenceLabel();

  if (users.length === 0) {
    return null;
  }

  // An overflow counter takes the last place.
  const shown = users.length > max ? users.slice(0, max - 1) : users;
  const rest = users.slice(shown.length);

  return (
    <ul
      className={cn("flex items-center -space-x-1.5 mr-2", className)}
      aria-label={t("presence.label")}
    >
      {shown.map((user) => (
        <li key={user.id} className="flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                <PresenceAvatar user={user} className="size-7" />
                <span className="sr-only">{label(user)}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>{label(user)}</TooltipContent>
          </Tooltip>
        </li>
      ))}
      {rest.length > 0 && (
        <li className="flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="size-7 rounded-full ring-2 ring-background bg-muted text-muted-foreground text-[10px] font-semibold flex items-center justify-center tabular-nums select-none outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                +{rest.length}
                <span className="sr-only">{rest.map(label).join(", ")}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {rest.map((user) => (
                <div key={user.id}>{label(user)}</div>
              ))}
            </TooltipContent>
          </Tooltip>
        </li>
      )}
    </ul>
  );
}

/**
 * On a list page's row: a small stack of the avatars of the other users
 * who have the object open, with one tooltip naming each.
 */
export function PresenceIndicator({
  users,
  max = 3,
  className,
}: {
  users?: PresenceUser[];
  max?: number;
  className?: string;
}) {
  const label = usePresenceLabel();

  if (!users || users.length === 0) {
    return null;
  }

  const shown = users.length > max ? users.slice(0, max - 1) : users;
  const rest = users.length - shown.length;
  const description = users.map(label).join(", ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="img"
          aria-label={description}
          data-slot="presence-indicator"
          className={cn(
            "inline-flex items-center -space-x-1 shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring",
            className,
          )}
        >
          {shown.map((user) => (
            <PresenceAvatar
              key={user.id}
              user={user}
              className="size-5 [&_[data-slot=avatar-fallback]]:text-[9px]"
            />
          ))}
          {rest > 0 && (
            <span className="size-5 rounded-full ring-2 ring-background bg-muted text-muted-foreground text-[9px] font-semibold flex items-center justify-center tabular-nums">
              +{rest}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {users.map((user) => (
          <div key={user.id}>{label(user)}</div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
