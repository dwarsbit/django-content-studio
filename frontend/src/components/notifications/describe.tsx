import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { TFunction } from "i18next";
import * as R from "ramda";
import React from "react";

import type { Notification } from "@/hooks/use-notifications";
import type { Model } from "@/types";

dayjs.extend(relativeTime);

const MARK = "\u0001";

/**
 * A translated sentence with some of its values set in bold: the
 * translation places them, so the word order is the language's own.
 */
export function fill(
  template: string,
  values: Record<string, React.ReactNode>,
): React.ReactNode[] {
  return template
    .split(new RegExp(`${MARK}(\\w+)${MARK}`))
    .map((part, index) =>
      index % 2 === 1 ? (
        <React.Fragment key={index}>{values[part]}</React.Fragment>
      ) : (
        part
      ),
    );
}

function placeholders(...names: string[]) {
  return Object.fromEntries(
    names.map((name) => [name, `${MARK}${name}${MARK}`]),
  );
}

export interface Description {
  // The sentence, with the actor and the object in bold.
  sentence: React.ReactNode;
  // The same as plain text, for accessible names and toasts.
  text: string;
  // Under the sentence: the model, the number of changes, the event.
  meta: string;
  // The named objects of a summary, as one line.
  objects: string;
  // Where it leads: a path in the admin, an absolute URL or nothing.
  href: string | null;
  // Whether the object's name is a link (it still exists).
  linked: boolean;
}

export function isContentEvent(notification: Notification) {
  return notification.event.startsWith("content.");
}

/** The path of an object's edit page, or of a model's list. */
function contentPath(model: Model | undefined, id?: string | null) {
  if (!model) {
    return null;
  }

  if (model.admin.is_singleton || !id) {
    return `/content/${model.label}`;
  }

  return `/content/${model.label}/${id}`;
}

export function describe(
  notification: Notification,
  models: Model[],
  t: TFunction,
): Description {
  const model = notification.model
    ? models.find(R.whereEq({ label: notification.model }))
    : undefined;
  const actor = notification.actor?.name ?? t("notifications.someone");
  const strong = (text: string, underline = false) => (
    <strong
      className={
        underline
          ? "font-semibold underline decoration-border underline-offset-3"
          : "font-semibold"
      }
    >
      {text}
    </strong>
  );

  if (!isContentEvent(notification)) {
    const href =
      notification.object_id && notification.exists
        ? contentPath(model, notification.object_id)
        : notification.url || null;

    return {
      sentence: notification.title || notification.event,
      text: [notification.title, notification.body].filter(Boolean).join(". "),
      meta: notification.body,
      objects: "",
      href,
      linked: false,
    };
  }

  const action = notification.event.slice("content.".length);
  const single = !!notification.object_id;
  const modelName = model?.verbose_name ?? notification.model ?? "";
  const modelPlural = model?.verbose_name_plural ?? notification.model ?? "";
  const linked = single && notification.exists && !!model;
  const key = single
    ? `notifications.content.${action}`
    : `notifications.content.${action}_many`;
  const options = {
    model: modelName,
    models: modelPlural,
    count: notification.count,
  };
  const template = t(key, {
    ...options,
    ...placeholders("actor", "object"),
  });
  const sentence = fill(template, {
    actor: notification.actor ? strong(actor) : actor,
    object: strong(notification.object_repr, linked),
  });
  const text = t(key, { ...options, actor, object: notification.object_repr });
  const meta = [
    modelPlural,
    single && notification.count > 1
      ? t("notifications.changes", { count: notification.count })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const rest = notification.count - notification.objects.length;
  const objects = single
    ? ""
    : [
        notification.objects.map((object) => object.repr).join(", "),
        rest > 0 ? t("notifications.more", { count: rest }) : null,
      ]
        .filter(Boolean)
        .join(" ");

  return {
    sentence,
    text,
    meta,
    objects,
    href: linked
      ? contentPath(model, notification.object_id)
      : single
        ? null
        : contentPath(model),
    linked,
  };
}

export function relativeTimeOf(notification: Notification) {
  return dayjs(notification.updated_at).fromNow();
}

/** Today, yesterday or earlier: the headings of the list. */
export function dayGroup(notification: Notification) {
  const day = dayjs(notification.updated_at).startOf("day");
  const today = dayjs().startOf("day");

  if (!day.isBefore(today)) {
    return "today";
  }

  if (!day.isBefore(today.subtract(1, "day"))) {
    return "yesterday";
  }

  return "earlier";
}

export function isExternal(href: string) {
  return /^https?:\/\//i.test(href);
}

/** The badge's text: the count, or 99+ beyond 99. */
export function unreadBadgeText(unread: number) {
  return unread > 99 ? "99+" : String(unread);
}
