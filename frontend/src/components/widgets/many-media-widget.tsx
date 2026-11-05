import { MediaGrid } from "@/components/widgets/media-widget";
import type { MediaItem, ModelField, WidgetProps } from "@/types";

export function ManyMediaWidget({
  value,
  field,
  onChange,
}: {
  field: ModelField;
} & WidgetProps<MediaItem[]>) {
  return <MediaGrid value={value} field={field} onChange={onChange} />;
}
