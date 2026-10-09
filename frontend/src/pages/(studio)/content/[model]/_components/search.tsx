import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useDebounce } from "react-use";

import { Input } from "@/components/ui/input";

export function Search() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [local, setLocal] = useState(searchParams.get("search") ?? "");

  useDebounce(
    () => {
      // Only navigate when the value actually changed: setSearchParams drops
      // the location hash, and the no-op run on mount would otherwise close
      // an editor opened right after page load (and pollute every list URL
      // with an empty ?search=).
      if ((searchParams.get("search") ?? "") === local) {
        return;
      }

      setSearchParams((searchParams) => {
        if (local) {
          searchParams.set("search", local);
        } else {
          searchParams.delete("search");
        }
        return searchParams;
      });
    },
    300,
    [local, searchParams, setSearchParams],
  );

  return (
    <Input
      size="sm"
      className="w-[260px] shrink-0 max-w-full"
      placeholder={t("common.search")}
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
      }}
    />
  );
}
