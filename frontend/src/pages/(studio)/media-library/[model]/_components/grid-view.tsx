import { ItemCard } from "@/components/media-library/item-card";
import { useDiscover } from "@/hooks/use-discover";
import type { MediaItem } from "@/types";

export function GridView({ items }: { items: MediaItem[] }) {
  const { data: discover } = useDiscover();
  const model = discover?.media_library.models.media_model;

  return (
    model && (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>
    )
  );
}
