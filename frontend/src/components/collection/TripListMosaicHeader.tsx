import { useTheme } from "@/lib/theme";
import { getListMosaicImageUrls, type TripList } from "@/lib/tripLists";

type Props = {
  list: TripList;
  className?: string;
};

export function TripListMosaicHeader({ list, className = "" }: Props) {
  const { theme } = useTheme();
  const isV1 = theme === "v1";
  const urls = getListMosaicImageUrls(list);

  return (
    <div
      className={`grid grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden bg-black/40 ${isV1 ? "rounded-md" : "rounded-xl"} aspect-[4/3] ${className}`}
    >
      {urls.map((src, i) => (
        <img
          key={`${list.id}-${i}`}
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              "https://images.unsplash.com/photo-1549490349-8643362247b5?w=300&auto=format&fit=crop&q=60";
          }}
        />
      ))}
    </div>
  );
}
