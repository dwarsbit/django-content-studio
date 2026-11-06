import * as R from "ramda";

import type { Model } from "@/types";

import { Conditional } from "./conditional";
import { fieldNames } from "./conditional-fields";
import { EditPlacementContext } from "./edit-placement";
import { FormSet } from "./form-set";

export function Aside({
  model,
  hiddenFields,
}: {
  model: Model;
  hiddenFields: string[];
}) {
  const {
    admin: {
      edit: { sidebar },
    },
  } = model;
  const hasSidebar = !R.isEmpty(sidebar) && !R.isNil(sidebar);

  return (
    hasSidebar && (
      <EditPlacementContext.Provider value="sidebar">
        <aside className="space-y-4">
          {sidebar.map((formSet, idx) => (
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
        </aside>
      </EditPlacementContext.Provider>
    )
  );
}
