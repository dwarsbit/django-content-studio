import { ItemCard } from "@/components/media-library/item-card";
import type { MediaItem } from "@/types";

/**
 * The media library's grid view: one card per file. Clicking a card
 * opens the file; the checkbox on hover selects it for the bulk
 * actions.
 */
export function GridView({
  items,
  selected,
  onToggle,
  onOpen,
}: {
  items: MediaItem[];
  selected: Set<string>;
  onToggle(id: string): void;
  onOpen(id: string): void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4">
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          selected={selected.has(String(item.id))}
          onToggle={() => onToggle(String(item.id))}
          onOpen={() => onOpen(String(item.id))}
        />
      ))}
    </div>
  );
}
