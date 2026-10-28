import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";

/**
 * A person: their picture, or their initials on the secondary color.
 */
function UserAvatar({
  name,
  initials,
  src,
  className,
  ...props
}: React.ComponentProps<typeof Avatar> & {
  name: string;
  // Derived from the name when not given.
  initials?: string | null;
  src?: string | null;
}) {
  return (
    <Avatar
      data-slot="user-avatar"
      className={cn("size-6", className)}
      {...props}
    >
      {src && <AvatarImage src={src} alt={name} />}
      <AvatarFallback className="text-[10px] font-semibold bg-secondary text-secondary-foreground">
        {(initials || getInitials(name)).slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

export { UserAvatar };
