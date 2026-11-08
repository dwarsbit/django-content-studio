import { useSearchParams } from "react-router";

import {
  type AnalyticsRange,
  PRESETS,
  type RangeKey,
} from "@/components/analytics/data";
import { RangeSelect } from "@/components/analytics/range-select";
import { PageBody } from "@/components/ui/page-header";
import { useProfile } from "@/hooks/use-profile";

import { EditProfile } from "./_components/edit-profile";
import { ProfileOverview } from "./_components/overview";
import { ProfileCard, ProfileHeader } from "./_components/profile-header";

function rangeFromParams(params: URLSearchParams): AnalyticsRange {
  const key = params.get("range") as RangeKey | null;

  if (key === "custom" && params.get("start") && params.get("end")) {
    return { key, start: params.get("start")!, end: params.get("end")! };
  }

  return { key: key && (PRESETS as string[]).includes(key) ? key : "30d" };
}

/**
 * The signed-in user's profile, opened from the user menu: the overview
 * of their changes (/profile, with the range in the URL) and the edit
 * tab (/profile/edit).
 */
export function ProfilePage({ tab }: { tab: "overview" | "edit" }) {
  const { data: profile } = useProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const range = rangeFromParams(searchParams);

  if (tab === "edit") {
    return <EditProfile profile={profile} />;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ProfileHeader
        current="/profile"
        actions={
          <RangeSelect
            value={range}
            onChange={(next) =>
              setSearchParams(
                (params) => {
                  params.set("range", next.key);
                  for (const name of ["start", "end"] as const) {
                    if (next[name]) params.set(name, next[name]);
                    else params.delete(name);
                  }
                  return params;
                },
                { replace: true },
              )
            }
          />
        }
      />
      <PageBody className="space-y-5">
        <ProfileCard user={profile?.user} />
        <ProfileOverview range={range} />
      </PageBody>
    </div>
  );
}
