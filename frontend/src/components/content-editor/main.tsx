import * as R from "ramda";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConditions } from "@/hooks/use-conditions";
import { useDiscover } from "@/hooks/use-discover";
import type { Id, Model } from "@/types";

import { Conditional } from "./conditional";
import { fieldNames, useResetInvalidInput } from "./conditional-fields";
import { FormSet } from "./form-set";
import { Inline } from "./inline";

export function Main({
  model,
  id,
  hiddenFields,
}: {
  model: Model;
  id?: Id | null;
  hiddenFields: string[];
}) {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const {
    admin: {
      edit: { main, inlines },
    },
  } = model;
  // Tabs (form set groups) show while their condition holds.
  const shownGroups = useConditions(main.map((group) => group.when));
  const visibleMain = main.filter((_, idx) => shownGroups[idx]);
  const showGroups =
    main.length > 1 || !R.isEmpty(main[0]?.label) || !R.isEmpty(inlines);
  const groups = visibleMain.filter(R.prop("label"));
  const tabValues = [
    ...visibleMain.map((group) => group.label || "default"),
    ...(R.isEmpty(groups) && !R.isEmpty(inlines) ? ["default"] : []),
    ...(id ? inlines.map((inline) => inline.model) : []),
  ];
  const [selectedTab, setSelectedTab] = useState(groups[0]?.label || "default");
  // A selected tab that is hidden gives way to the first one shown.
  const tab = tabValues.includes(selectedTab)
    ? selectedTab
    : (tabValues[0] ?? "default");

  useResetInvalidInput(
    main
      .filter((_, idx) => !shownGroups[idx])
      .flatMap((group) => fieldNames(group.formsets)),
  );

  return (
    <div>
      <Tabs value={tab} onValueChange={setSelectedTab}>
        {showGroups && (
          <TabsList variant="line" className="mb-5">
            {groups.map((formSetGroup, idx) => (
              <TabsTrigger key={idx} value={formSetGroup.label}>
                <span className="first-letter:uppercase">
                  {formSetGroup.label}
                </span>
              </TabsTrigger>
            ))}
            {R.isEmpty(groups) && !R.isEmpty(inlines) && (
              <TabsTrigger value="default">{t("common.general")}</TabsTrigger>
            )}
            {id
              ? inlines.map((inline) => (
                  <TabsTrigger key={inline.model} value={inline.model}>
                    <span className="first-letter:uppercase">
                      {
                        discover?.models.find(
                          R.whereEq({ label: inline.model }),
                        )?.verbose_name_plural
                      }
                    </span>
                  </TabsTrigger>
                ))
              : null}
          </TabsList>
        )}
        {visibleMain.map((formSetGroup, idx) => (
          <TabsContent
            key={formSetGroup.label || idx}
            value={formSetGroup.label || "default"}
            className="space-y-5"
          >
            {formSetGroup.formsets.map((formSet, idx) => (
              <Conditional
                key={idx}
                when={formSet.when}
                fields={fieldNames(formSet.fields)}
              >
                <section className="rounded-lg border bg-card shadow-xs w-full">
                  <FormSet
                    model={model}
                    formSet={formSet}
                    hiddenFields={hiddenFields}
                  />
                </section>
              </Conditional>
            ))}
          </TabsContent>
        ))}
        {id
          ? inlines.map((inline) => {
              const inlineModel = discover?.models.find(
                R.whereEq({ label: inline.model }),
              );

              return inlineModel ? (
                <TabsContent key={inline.model} value={inline.model}>
                  <Inline
                    relModel={model.label}
                    relId={id}
                    model={inlineModel}
                    adminModel={inline}
                  />
                </TabsContent>
              ) : null;
            })
          : null}
      </Tabs>
    </div>
  );
}
