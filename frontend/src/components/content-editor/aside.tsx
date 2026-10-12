import * as R from "ramda";

import type { Model } from "@/types";

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
      <aside className="space-y-4">
        {sidebar.map((formSet, idx) => (
          <section key={idx} className="border rounded-lg p-4 w-full">
            <FormSet
              model={model}
              formSet={formSet}
              hiddenFields={hiddenFields}
            />
          </section>
        ))}
      </aside>
    )
  );
}
