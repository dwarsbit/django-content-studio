import * as R from "ramda";
import { useTranslation } from "react-i18next";
import { PiCaretUpDownBold, PiGearBold } from "react-icons/pi";
import { useNavigate } from "react-router";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDiscover } from "@/hooks/use-discover";
import { useTenant } from "@/tenant";

export function TenantSelector() {
  const { tenant, tenants, setTenant } = useTenant();
  const { data: discover } = useDiscover();
  const navigate = useNavigate();
  const tenantModel = discover?.models.find(
    R.whereEq({ label: discover?.multitenancy.tenant_model }),
  );
  const { t } = useTranslation();

  return (
    <Popover>
      <PopoverTrigger
        asChild
        className="group w-full flex items-center justify-between gap-2 rounded-md hover:bg-gray-100 data-[state=open]:bg-gray-100 hover:cursor-pointer"
      >
        <div>
          {tenant && (
            <>
              <Avatar className="size-7 shrink-0">
                <AvatarFallback>{tenant.__str__[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 max-w-[84px] text-left font-semibold text-gray-900 truncate">
                {tenant.__str__}
              </div>
              {tenantModel?.admin.permissions.change_permission && (
                <button
                  className="p-1 hover:bg-gray-200 cursor-pointer rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate({
                      hash: `editor:${tenantModel.label}:${tenant.id}`,
                    });
                  }}
                >
                  <PiGearBold />
                </button>
              )}
            </>
          )}
          <div className="p-1 group-hover:bg-gray-200 group-data-[state=open]:bg-gray-300 rounded">
            <PiCaretUpDownBold />
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-0" side="bottom" align="start">
        <Command>
          <CommandInput />
          <CommandList>
            <CommandGroup>
              {tenants.map((tenant) => (
                <CommandItem
                  key={tenant.id}
                  value={tenant.id}
                  keywords={[tenant.__str__]}
                  onSelect={(value) => {
                    setTenant(value);
                    window.location.reload();
                  }}
                >
                  <div className="flex-1">{tenant.__str__}</div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {tenantModel?.admin.permissions.add_permission && (
          <div className="border-t p-1">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate({ hash: `editor:${tenantModel.label}` })}
            >
              {t("tenant.selector.add")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
