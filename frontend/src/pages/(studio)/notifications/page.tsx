import * as R from "ramda";
import { useTranslation } from "react-i18next";
import { PiBellBold } from "react-icons/pi";
import { useSearchParams } from "react-router";

import { NotificationList } from "@/components/notifications/notification-list";
import { Search } from "@/components/search";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDiscover } from "@/hooks/use-discover";
import {
  type NotificationQuery,
  useNotificationFilterOptions,
} from "@/hooks/use-notifications";

// The Select's value for "no filter": Radix reserves the empty string.
const ANY = "__any";

const CONTENT_ACTIONS = [
  "created",
  "updated",
  "deleted",
  "restored",
  "reordered",
];

function FilterSelect({
  label,
  value,
  anyLabel,
  options,
  onChange,
}: {
  label: string;
  value: string;
  anyLabel: string;
  options: { value: string; label: string }[];
  onChange(value: string): void;
}) {
  return (
    <Select
      value={value || ANY}
      onValueChange={(next) => onChange(next === ANY ? "" : next)}
    >
      <SelectTrigger size="sm" className="w-44 max-w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{anyLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="first-letter:uppercase">{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The notifications as a page: reached from the popover's See all, and
 * what the main menu item opens on narrow screens. Besides the list's
 * tabs it filters by model and event and searches, with the filters in
 * the URL (search, model, event).
 */
export function NotificationsPage() {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const { data: options } = useNotificationFilterOptions();
  const [searchParams, setSearchParams] = useSearchParams();
  const query: NotificationQuery = {
    q: searchParams.get("search") ?? "",
    model: searchParams.get("model") ?? "",
    event: searchParams.get("event") ?? "",
  };

  const setParam = (name: string, value: string) =>
    setSearchParams((params) => {
      if (value) {
        params.set(name, value);
      } else {
        params.delete(name);
      }
      return params;
    });

  const models = (options?.models ?? []).map((label) => ({
    value: label,
    label:
      discover?.models.find(R.whereEq({ label }))?.verbose_name_plural ?? label,
  }));
  const events = (options?.events ?? []).map((event) => {
    const action = event.key.startsWith("content.")
      ? event.key.slice("content.".length)
      : null;

    return {
      value: event.key,
      label:
        action && CONTENT_ACTIONS.includes(action)
          ? t(`notifications.filters.${action}`)
          : (event.label ?? event.key),
    };
  });

  const filters = (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
      <Search />
      {models.length > 0 && (
        <FilterSelect
          label={t("notifications.filters.model")}
          anyLabel={t("notifications.filters.any_model")}
          value={query.model ?? ""}
          options={models}
          onChange={(value) => setParam("model", value)}
        />
      )}
      {events.length > 0 && (
        <FilterSelect
          label={t("notifications.filters.event")}
          anyLabel={t("notifications.filters.any_event")}
          value={query.event ?? ""}
          options={events}
          onChange={(value) => setParam("event", value)}
        />
      )}
    </div>
  );

  return (
    <>
      <PageHeader icon={<PiBellBold />} title={t("notifications.title")} />
      <div className="flex-1 min-h-0 flex flex-col w-full max-w-3xl mx-auto sm:px-6 sm:py-6">
        <div className="flex-1 min-h-0 flex flex-col sm:border sm:rounded-xl overflow-hidden bg-card">
          <NotificationList
            variant="page"
            query={query}
            filters={filters}
            onClearFilters={() =>
              setSearchParams((params) => {
                params.delete("search");
                params.delete("model");
                params.delete("event");
                return params;
              })
            }
          />
        </div>
      </div>
    </>
  );
}
