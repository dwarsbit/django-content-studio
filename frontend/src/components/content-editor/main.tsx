import * as R from "ramda";
import { useTranslation } from "react-i18next";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDiscover } from "@/hooks/use-discover";
import type { Id, Model } from "@/types";

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
  const showGroups =
    main.length > 1 || !R.isEmpty(main[0]?.label) || !R.isEmpty(inlines);
  const groups = main.filter(R.prop("label"));

  return (
    <div>
      <Tabs defaultValue={groups[0]?.label || "default"}>
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
        {main.map((formSetGroup, idx) => (
          <TabsContent
            key={idx}
            value={formSetGroup.label || "default"}
            className="space-y-5"
          >
            {formSetGroup.formsets.map((formSet, idx) => (
              <section
                key={idx}
                className="rounded-lg border bg-card shadow-xs w-full"
              >
                <FormSet
                  model={model}
                  formSet={formSet}
                  hiddenFields={hiddenFields}
                />
              </section>
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
