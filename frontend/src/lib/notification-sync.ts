/**
 * One polling tab per browser. The visible tabs of one admin take turns
 * holding a Web Lock: the holder polls the notification status and
 * shares each answer over a BroadcastChannel; the other tabs take it
 * from there instead of polling themselves. A tab steps down when it is
 * hidden, so the poll keeps to the visible tabs. Tabs also tell each
 * other when notifications changed (marked as read, settings saved),
 * so every tab stays in step.
 *
 * Without BroadcastChannel or Web Locks, every visible tab polls.
 */
import { useSyncExternalStore } from "react";

import type { NotificationStatus } from "@/hooks/use-notifications";

export type SyncMessage =
  | { type: "status"; from: string; status: NotificationStatus }
  | { type: "changed"; from: string };

// Tells this tab's messages from the others'.
export const TAB_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function supportsLeaderElection() {
  return (
    typeof BroadcastChannel !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.locks
  );
}

/** The lock and channel name: per admin (its address) and tenant. */
export function syncName(tenant: string) {
  const base =
    (window as Window & typeof globalThis & { DCS_BASENAME?: string })
      .DCS_BASENAME ?? "";

  return `dcs-notifications:${base}:${tenant}`;
}

// Whether this tab polls. True until a sync component elects, so a tab
// without one (or without support) polls as before.
let leader = true;
const listeners = new Set<() => void>();

export function setPollLeader(value: boolean) {
  if (leader !== value) {
    leader = value;
    listeners.forEach((listener) => listener());
  }
}

export function isPollLeader() {
  return leader;
}

export function usePollLeader() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    isPollLeader,
    isPollLeader,
  );
}

/** Tell the other tabs that the notifications changed. */
export function announceChange(tenant: string) {
  if (typeof BroadcastChannel === "undefined") {
    return;
  }

  const channel = new BroadcastChannel(syncName(tenant));
  channel.postMessage({ type: "changed", from: TAB_ID } satisfies SyncMessage);
  channel.close();
}
