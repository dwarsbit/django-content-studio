import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import {
  type NotificationStatus,
  useNotificationStatus,
} from "@/hooks/use-notifications";
import {
  isPollLeader,
  setPollLeader,
  supportsLeaderElection,
  type SyncMessage,
  syncName,
  TAB_ID,
} from "@/lib/notification-sync";
import { useTenant } from "@/tenant";

/**
 * Elects this tab as the browser's polling tab while it is visible and
 * no other visible tab holds the lock, shares its polls with the other
 * tabs and takes theirs. Mounted once, beside the toasts.
 */
export function NotificationSync() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  const tenant = tenantId ?? "";
  const name = syncName(tenant);
  const { data: status, dataUpdatedAt } = useNotificationStatus();
  const channel = useRef<BroadcastChannel | null>(null);
  // The last status another tab shared, so it is not shared back.
  const received = useRef<NotificationStatus | null>(null);

  // The election: stand while visible, step down when hidden.
  useEffect(() => {
    if (!supportsLeaderElection()) {
      return;
    }

    let controller: AbortController | null = null;
    let release: (() => void) | null = null;

    const stand = () => {
      if (controller) {
        return;
      }

      controller = new AbortController();
      navigator.locks
        .request(
          name,
          { signal: controller.signal },
          () =>
            new Promise<void>((resolve) => {
              release = resolve;
              setPollLeader(true);
            }),
        )
        .catch(() => undefined);
    };

    const stepDown = () => {
      controller?.abort();
      controller = null;
      release?.();
      release = null;
      setPollLeader(false);
    };

    const onVisibilityChange = () =>
      document.visibilityState === "hidden" ? stepDown() : stand();

    setPollLeader(false);
    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stepDown();
      setPollLeader(true);
    };
  }, [name]);

  // The channel: take the other tabs' polls and changes.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      return;
    }

    const current = new BroadcastChannel(name);
    channel.current = current;

    current.onmessage = (event: MessageEvent<SyncMessage>) => {
      const message = event.data;

      if (!message || message.from === TAB_ID) {
        return;
      }

      if (message.type === "status") {
        received.current = message.status;
        queryClient.setQueryData(
          ["notifications", tenant, "status"],
          message.status,
        );
      } else if (message.type === "changed") {
        void queryClient.invalidateQueries({
          queryKey: ["notifications", tenant],
        });
      }
    };

    return () => {
      current.close();
      channel.current = null;
    };
  }, [name, tenant, queryClient]);

  // Share this tab's own polls while it leads.
  useEffect(() => {
    if (!status || status === received.current || !isPollLeader()) {
      return;
    }

    channel.current?.postMessage({
      type: "status",
      from: TAB_ID,
      status,
    } satisfies SyncMessage);
  }, [status, dataUpdatedAt]);

  return null;
}
