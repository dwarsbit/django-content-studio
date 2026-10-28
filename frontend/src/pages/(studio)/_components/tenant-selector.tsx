import * as R from "ramda";
import { useTranslation } from "react-i18next";
import {
  PiCaretUpDownBold,
  PiCheckBold,
  PiGearBold,
  PiPlusBold,
} from "react-icons/pi";
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
import { cn } from "@/lib/utils";
import { useTenant } from "@/tenant";

/**
 * The tenant switch at the top of the main menu: the current tenant,
 * and a list to switch to another one or add one.
 */
export function TenantSelector({ collapsed }: { collapsed: boolean }) {
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
        className={cn(
          "flex items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring cursor-pointer hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent",
          collapsed
            ? "size-8 justify-center"
            : "flex-1 min-w-0 gap-2 h-9 -ml-2 px-2 text-left",
        )}
        aria-label={collapsed ? tenant?.__str__ : undefined}
      >
        <Avatar className="size-6 rounded-md">
          <AvatarFallback className="rounded-md bg-primary text-primary-foreground text-xs">
            {tenant?.__str__[0]}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate leading-tight">
                {tenant?.__str__}
              </div>
              {tenantModel && (
                <div className="text-[11px] text-muted-foreground truncate leading-tight first-letter:uppercase">
                  {tenantModel.verbose_name}
                </div>
              )}
            </div>
            <PiCaretUpDownBold className="size-3.5 text-muted-foreground shrink-0" />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="p-0 w-56" side="bottom" align="start">
        <Command>
          <CommandInput />
          <CommandList>
            <CommandGroup>
              {tenants.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  keywords={[item.__str__]}
                  onSelect={(value) => {
                    setTenant(value);
                    window.location.reload();
                  }}
                >
                  <span className="flex-1 truncate">{item.__str__}</span>
                  {item.id === tenant?.id && <PiCheckBold />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {tenantModel &&
          tenant &&
          tenantModel.admin.permissions.change_permission && (
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() =>
                  navigate(`/content/${tenantModel.label}/${tenant.id}`)
                }
              >
                <PiGearBold />
                {t("tenant.selector.settings")}
              </Button>
            </div>
          )}
        {tenantModel?.admin.permissions.add_permission && (
          <div className="border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => navigate(`/content/${tenantModel.label}/new`)}
            >
              <PiPlusBold />
              {t("tenant.selector.add")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
