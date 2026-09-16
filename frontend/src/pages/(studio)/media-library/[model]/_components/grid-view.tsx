import { ItemCard } from "@/components/media-library/item-card";
import { useDiscover } from "@/hooks/use-discover";

export function GridView({
  items,
}: {
  items: { id: number | string; [p: string]: unknown }[];
}) {
  const { data: discover } = useDiscover();
  const model = discover?.media_library.models.media_model;

  return (
    model && (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {items.map((item: any) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>
    )
  );
}
