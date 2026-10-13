import { ItemCard } from "@/components/media-library/item-card";
import type { MediaItem } from "@/types";

/**
 * The media library's grid view: one card per item. Like the list
 * view, it carries no selection — clicking a card opens the item for
 * editing; the table's checkboxes carry the bulk selection.
 */
export function GridView({ items }: { items: MediaItem[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}
