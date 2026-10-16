import { Button } from "@/components/ui/button";
import { useComponentLink } from "@/hooks/use-component-link";
import type { FormField, Model } from "@/types";

/** A Link component: a text link that opens the component's URL. */
export function Link({
  model,
  formField,
}: {
  model: Model;
  formField: FormField;
}) {
  const getLink = useComponentLink(model, formField);

  return (
    getLink && (
      <Button
        variant="link"
        className="h-auto px-0"
        onClick={async () => {
          const link = await getLink();

          window.open(link, "_blank", "noopener");
        }}
      >
        {formField.label}
      </Button>
    )
  );
}
