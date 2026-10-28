import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as R from "ramda";
import { useEffect, useState } from "react";

import { useHttp } from "@/hooks/use-http";
import type { Id, Model, PresenceUser } from "@/types";

// How often an open edit page announces itself and the list page asks
// who has its objects open. The server forgets an edit page after 45
// seconds without a heartbeat.
export const PRESENCE_INTERVAL = 15_000;

// An id for this edit page (a browser tab), so a user with the object
// open in two tabs stays present until both are closed. Not a secret.
function newSessionId() {
  return `${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

/**
 * The edit page's heartbeat: announces that the user has the object open,
 * viewing it or editing it, and returns the other users who have it open.
 * Polling pauses while the tab is hidden; leaving the page (or closing
 * the tab) clears the user's entry.
 */
export function usePresence({
  model,
  id,
  editing,
  enabled = true,
}: {
  model: Model;
  id?: Id | null;
  editing: boolean;
  enabled?: boolean;
}): PresenceUser[] {
  const http = useHttp();
  const [session] = useState(newSessionId);
  const active = enabled && !!model.admin.presence && !R.isNil(id);
  const state = editing ? "editing" : "viewing";
  const url = `/content/${model.label}/${id}/presence`;

  const { data } = useQuery({
    enabled: active,
    retry: false,
    gcTime: 0,
    // A change of state announces itself right away; the previous
    // answer stays on screen meanwhile.
    queryKey: ["presence", model.label, String(id), session, state],
    placeholderData: keepPreviousData,
    refetchInterval: PRESENCE_INTERVAL,
    refetchIntervalInBackground: false,
    async queryFn() {
      const { data } = await http.post<{ users: PresenceUser[] }>(
        `/content/${model.label}/${id}/presence`,
        { session, state },
      );

      return data.users;
    },
  });

  useEffect(() => {
    if (!active) {
      return;
    }

    // keepalive lets the request outlive a closing tab.
    const leave = () => {
      http
        .delete(url, {
          params: { session },
          adapter: "fetch",
          fetchOptions: { keepalive: true },
        })
        .catch(() => undefined);
    };

    window.addEventListener("pagehide", leave);

    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [active, http, session, url]);

  return active ? (data ?? []) : [];
}

/**
 * Who else has the objects of a list page open, by id, in one request,
 * refreshed on the heartbeat's interval while the tab is visible.
 */
export function usePresenceList(
  model: Model | undefined,
  ids: Id[],
): Record<string, PresenceUser[]> {
  const http = useHttp();
  const enabled = !!model?.admin.presence && ids.length > 0;

  const { data } = useQuery({
    enabled,
    retry: false,
    queryKey: ["presence", model?.label, "list", ids],
    placeholderData: keepPreviousData,
    refetchInterval: PRESENCE_INTERVAL,
    refetchIntervalInBackground: false,
    async queryFn() {
      const { data } = await http.get<Record<string, PresenceUser[]>>(
        `/content/${model!.label}/presence`,
        { params: new URLSearchParams(ids.map((id) => ["id", String(id)])) },
      );

      return data;
    },
  });

  return enabled ? (data ?? {}) : {};
}
