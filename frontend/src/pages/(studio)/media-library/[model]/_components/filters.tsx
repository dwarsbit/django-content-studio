import * as R from "ramda";
import { useTranslation } from "react-i18next";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export function Filters({
  filters,
  onFilterChange,
}: {
  filters: { search: string; searchInFolder: boolean };
  onFilterChange(filters: { search: string; searchInFolder: boolean }): void;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <InputGroup>
        <InputGroupInput
          value={filters.search}
          onChange={(e) =>
            onFilterChange(R.assoc("search", e.target.value, filters))
          }
          placeholder={t("common.search")}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            className={cn({ "bg-gray-100": filters.searchInFolder })}
            onClick={() =>
              onFilterChange(
                R.assoc("searchInFolder", !filters.searchInFolder, filters),
              )
            }
          >
            {t("media_library.within_folder")}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
