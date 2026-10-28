import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiMagnifyingGlassBold } from "react-icons/pi";
import { useSearchParams } from "react-router";
import { useDebounce } from "react-use";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

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

      // A new term strands the current page, so searching returns to
      // the first page.
      setSearchParams((searchParams) => {
        if (local) {
          searchParams.set("search", local);
        } else {
          searchParams.delete("search");
        }
        searchParams.delete("page");
        return searchParams;
      });
    },
    300,
    [local, searchParams, setSearchParams],
  );

  return (
    <InputGroup className="h-8 w-64 max-w-full shrink-0">
      <InputGroupAddon>
        <PiMagnifyingGlassBold className="text-muted-foreground" />
      </InputGroupAddon>
      <InputGroupInput
        placeholder={t("common.search")}
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
        }}
      />
    </InputGroup>
  );
}
