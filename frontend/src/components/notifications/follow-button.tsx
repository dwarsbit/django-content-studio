import { useTranslation } from "react-i18next";
import { PiBellBold, PiBellRingingBold } from "react-icons/pi";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFollow } from "@/hooks/use-notifications";
import type { Id, Model } from "@/types";

function useFollowToggle(model: Model, id: Id, name: string) {
  const { t } = useTranslation();
  const follow = useFollow(model.label, id);
  const following = !!follow.data?.following;

  const toggle = async (value = !following) => {
    try {
      await follow.setFollowing(value);
    } catch {
      toast.error(t("notifications.follow.failed"));
      return;
    }

    // A toast once, not a banner on every visit.
    toast(
      t(
        value
          ? "notifications.follow.followed"
          : "notifications.follow.unfollowed",
        {
          name,
        },
      ),
      {
        id: `follow-${model.label}-${id}`,
        action: {
          label: t("notifications.follow.undo"),
          onClick: () => {
            follow.setFollowing(!value).catch(() => undefined);
          },
        },
        description: (
          <Link to="/notifications/settings" className="underline">
            {t("notifications.settings_link")}
          </Link>
        ),
      },
    );
  };

  return { follow, following, toggle };
}

function hintFor(
  t: ReturnType<typeof useTranslation>["t"],
  following: boolean,
  creator: boolean,
) {
  if (following) {
    return t("notifications.follow.following_hint");
  }

  return creator
    ? t("notifications.follow.creator_hint")
    : t("notifications.follow.follow_hint");
}

/**
 * Follow in the edit page's header: every change to the object then
 * notifies the user. Pressed while following.
 */
export function FollowButton({
  model,
  id,
  name,
  className,
}: {
  model: Model;
  id: Id;
  name: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { follow, following, toggle } = useFollowToggle(model, id, name);

  if (!follow.data) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant={following ? "secondary" : "outline"}
          aria-pressed={following}
          className={className}
          disabled={follow.mutation.isPending}
          onClick={() => toggle()}
        >
          {following ? <PiBellRingingBold /> : <PiBellBold />}
          {t(
            following
              ? "notifications.follow.following"
              : "notifications.follow.follow",
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {hintFor(t, following, follow.data.creator)}
      </TooltipContent>
    </Tooltip>
  );
}

/** Follow in the more actions menu, on narrow screens. */
export function FollowMenuItem({
  model,
  id,
  name,
  className,
}: {
  model: Model;
  id: Id;
  name: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { follow, following, toggle } = useFollowToggle(model, id, name);

  if (!follow.data) {
    return null;
  }

  return (
    <DropdownMenuItem className={className} onSelect={() => toggle()}>
      {t(
        following
          ? "notifications.follow.unfollow"
          : "notifications.follow.follow",
      )}
      {following ? <PiBellRingingBold /> : <PiBellBold />}
    </DropdownMenuItem>
  );
}
