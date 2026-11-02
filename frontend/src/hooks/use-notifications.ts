import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import { announceChange, usePollLeader } from "@/lib/notification-sync";
import { safeStorage } from "@/lib/safe-storage";
import { useTenant } from "@/tenant";
import type { Id } from "@/types";

// How often the admin asks for the unread count, while the tab is
// visible.
export const NOTIFICATIONS_INTERVAL = 30_000;

export const PAGE_SIZE = 20;

export type NotificationLevel = "info" | "success" | "warning" | "error";

export type NotificationFilter = "unread" | "all";

export interface NotificationActor {
  id: Id;
  name: string;
  initials: string;
  avatar: string | null;
}

export interface Notification {
  id: number;
  // "content.created", "content.updated", ... or a registered key.
  event: string;
  level: NotificationLevel;
  actor: NotificationActor | null;
  // The model label of its object, if any.
  model: string | null;
  object_id: string | null;
  object_repr: string;
  // Whether its object still exists (trashed objects do).
  exists: boolean;
  url: string;
  // Rendered text of a registered event.
  title: string;
  body: string;
  // A content summary's named objects.
  objects: { id: string; repr: string; followed: boolean }[];
  count: number;
  created_at: string;
  updated_at: string;
  read: boolean;
}

export interface NotificationStatus {
  unread: number;
  latest: string | null;
}

export type GridAction = "created" | "updated" | "deleted" | "restored";

export interface ModelSettings {
  model: string;
  scope: "all" | "mine";
  events: Partial<Record<GridAction, boolean>>;
  // Nothing stored: the default applies.
  default: boolean;
}

export interface EventSettings {
  key: string;
  label: string;
  description: string;
  level: NotificationLevel;
  required: boolean;
  enabled: boolean;
}

export interface FollowedObject {
  model: string;
  id: string;
  repr: string;
  created_at: string;
}

export interface NotificationSettings {
  models: ModelSettings[];
  events: EventSettings[];
  follows: FollowedObject[];
}

export interface FollowState {
  following: boolean;
  // The user created the object, and so is notified by default.
  creator: boolean;
}

const TOASTS_KEY = "notification-toasts";

/** Whether new notifications show as toasts in this browser. */
export function getToastsEnabled() {
  return safeStorage.get(TOASTS_KEY) !== "false";
}

export function setToastsEnabled(enabled: boolean) {
  safeStorage.set(TOASTS_KEY, String(enabled));
}

/** Whether the notifications app is installed. */
export function useNotificationsEnabled() {
  const { data: discover } = useDiscover();

  return !!discover?.notifications?.enabled;
}

function useTenantKey() {
  const { tenantId } = useTenant();

  return tenantId ?? "";
}

/**
 * The unread count and the time the newest notification changed,
 * polled every 30 seconds while the tab is visible: by one tab per
 * browser, which shares the answer with the others (NotificationSync).
 */
export function useNotificationStatus() {
  const http = useHttp();
  const enabled = useNotificationsEnabled();
  const tenant = useTenantKey();
  const leader = usePollLeader();

  return useQuery({
    enabled,
    retry: false,
    queryKey: ["notifications", tenant, "status"],
    refetchInterval: leader ? NOTIFICATIONS_INTERVAL : false,
    refetchIntervalInBackground: false,
    async queryFn() {
      const { data } = await http.get<NotificationStatus>(
        "/notifications/status",
      );

      return data;
    },
  });
}

/** The user's notifications, a page at a time. */
export function useNotificationList(filter: NotificationFilter) {
  const http = useHttp();
  const enabled = useNotificationsEnabled();
  const tenant = useTenantKey();

  return useInfiniteQuery({
    enabled,
    retry: false,
    queryKey: ["notifications", tenant, "list", filter],
    async queryFn({ pageParam }) {
      const { data } = await http.get<{
        results: Notification[];
        next: number | null;
      }>("/notifications", {
        params: { filter, offset: pageParam, limit: PAGE_SIZE },
      });

      return data;
    },
    initialPageParam: 0,
    getNextPageParam: (page: { next: number | null }) => page.next,
  });
}

/** The unread notifications that changed after a time. */
export async function fetchSince(
  http: ReturnType<typeof useHttp>,
  since: string,
) {
  const { data } = await http.get<{
    results: Notification[];
    next: number | null;
  }>("/notifications", {
    params: { filter: "unread", since, limit: PAGE_SIZE },
  });

  return data;
}

/**
 * How many notifications arrived after the list was loaded: the "new"
 * pill on an open list, which leaves the rows under the pointer alone.
 */
export function useArrivedSince(since: string | null | undefined) {
  const http = useHttp();
  const tenant = useTenantKey();
  const { data: status } = useNotificationStatus();
  const moved = !!since && !!status?.latest && status.latest > since;

  const { data } = useQuery({
    enabled: moved,
    retry: false,
    queryKey: ["notifications", tenant, "since", since, status?.latest],
    async queryFn() {
      const { data } = await http.get<{ results: Notification[] }>(
        "/notifications",
        { params: { filter: "unread", since, limit: PAGE_SIZE } },
      );

      return data;
    },
  });

  return moved ? (data?.results.length ?? 0) : 0;
}

/**
 * Mark notifications as read: some by id, or every one that did not
 * change after a time (mark all as read).
 */
export function useMarkRead() {
  const http = useHttp();
  const queryClient = useQueryClient();
  const tenant = useTenantKey();

  return useMutation({
    async mutationFn(payload: { ids: number[] } | { before: string }) {
      const { data } = await http.post<{ unread: number }>(
        "/notifications/read",
        payload,
      );

      return data;
    },
    onMutate(payload) {
      // The rows turn read at once; the server answers the count.
      queryClient.setQueriesData<{
        pages: { results: Notification[]; next: number | null }[];
      }>({ queryKey: ["notifications", tenant, "list"] }, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                results: page.results.map((notification) =>
                  (
                    "ids" in payload
                      ? payload.ids.includes(notification.id)
                      : notification.updated_at <= payload.before
                  )
                    ? { ...notification, read: true }
                    : notification,
                ),
              })),
            }
          : old,
      );
    },
    onSuccess({ unread }) {
      queryClient.setQueryData<NotificationStatus>(
        ["notifications", tenant, "status"],
        (old) => (old ? { ...old, unread } : old),
      );
    },
    onSettled() {
      announceChange(tenant);

      return queryClient.invalidateQueries({
        queryKey: ["notifications", tenant],
      });
    },
  });
}

export function useNotificationSettings() {
  const http = useHttp();
  const enabled = useNotificationsEnabled();
  const tenant = useTenantKey();

  return useQuery({
    enabled,
    retry: false,
    queryKey: ["notifications", tenant, "settings"],
    async queryFn() {
      const { data } = await http.get<NotificationSettings>(
        "/notifications/settings",
      );

      return data;
    },
  });
}

/** Store a change on the settings page: shown at once, saved behind. */
function useSettingsMutation<T>(
  send: (http: ReturnType<typeof useHttp>, value: T) => Promise<unknown>,
  apply: (settings: NotificationSettings, value: T) => NotificationSettings,
) {
  const http = useHttp();
  const queryClient = useQueryClient();
  const tenant = useTenantKey();
  const queryKey = ["notifications", tenant, "settings"];

  return useMutation({
    mutationFn: (value: T) => send(http, value),
    async onMutate(value) {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<NotificationSettings>(queryKey);

      if (previous) {
        queryClient.setQueryData(queryKey, apply(previous, value));
      }

      return { previous };
    },
    onError(_error, _value, context) {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSuccess() {
      announceChange(tenant);
    },
  });
}

export function useSaveModelSettings() {
  return useSettingsMutation<ModelSettings>(
    (http, row) =>
      http.put(`/notifications/settings/models/${row.model}`, {
        scope: row.scope,
        events: row.events,
      }),
    (settings, row) => ({
      ...settings,
      models: settings.models.map((existing) =>
        existing.model === row.model ? { ...row, default: false } : existing,
      ),
    }),
  );
}

export function useSaveEventSettings() {
  return useSettingsMutation<{ key: string; enabled: boolean }>(
    (http, { key, enabled }) =>
      http.put(`/notifications/settings/events/${key}`, { enabled }),
    (settings, { key, enabled }) => ({
      ...settings,
      events: settings.events.map((event) =>
        event.key === key ? { ...event, enabled } : event,
      ),
    }),
  );
}

/** Whether the user follows an object, and following or unfollowing it. */
export function useFollow(model: string, id: Id | null | undefined) {
  const http = useHttp();
  const queryClient = useQueryClient();
  const tenant = useTenantKey();
  const queryKey = ["notifications", tenant, "follow", model, String(id)];

  const query = useQuery({
    enabled: id != null,
    retry: false,
    queryKey,
    async queryFn() {
      const { data } = await http.get<FollowState>("/notifications/follow", {
        params: { model, id },
      });

      return data;
    },
  });

  const mutation = useMutation({
    async mutationFn(follow: boolean) {
      const { data } = follow
        ? await http.post<FollowState>("/notifications/follow", { model, id })
        : await http.delete<FollowState>("/notifications/follow", {
            params: { model, id },
          });

      return data;
    },
    onSuccess(data) {
      announceChange(tenant);
      queryClient.setQueryData(queryKey, data);
      void queryClient.invalidateQueries({
        queryKey: ["notifications", tenant, "settings"],
      });
    },
  });

  return { data: query.data, setFollowing: mutation.mutateAsync, mutation };
}

/** Unfollow from the settings page, where only the list is at hand. */
export function useUnfollow() {
  return useSettingsMutation<{ model: string; id: string }>(
    (http, { model, id }) =>
      http.delete("/notifications/follow", { params: { model, id } }),
    (settings, { model, id }) => ({
      ...settings,
      follows: settings.follows.filter(
        (follow) => !(follow.model === model && follow.id === id),
      ),
    }),
  );
}
