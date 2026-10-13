import { ItemCard } from "@/components/media-library/item-card";
import type { MediaItem } from "@/types";

export function GridView({
  items,
  selectedIds,
  onToggleSelect,
}: {
  items: MediaItem[];
  /** The page's bulk selection, by item id. */
  selectedIds: Set<string>;
  onToggleSelect(id: string): void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          selected={selectedIds.has(String(item.id))}
          onToggleSelect={() => onToggleSelect(item.id)}
        />
      ))}
    </div>
  );
}
