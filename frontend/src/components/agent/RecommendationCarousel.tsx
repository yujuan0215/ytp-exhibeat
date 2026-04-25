import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ListPlus, MapPin, CalendarDays } from "lucide-react";
import type { AgentRecommendationItem } from "@/lib/api";
import {
  addEventToTripList,
  agentRecommendationToExhibition,
  createTripList,
  getTripLists,
  TRIP_LISTS_CHANGE_EVENT,
  type TripList,
} from "@/lib/tripLists";
import { AddToTripListMenu } from "@/components/collection/AddToTripListMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type RecommendationCarouselProps = {
  title?: string;
  introText?: string;
  events: AgentRecommendationItem[];
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1549490349-8643362247b5?w=600&auto=format&fit=crop&q=80";

export function RecommendationCarousel({ title, introText, events }: RecommendationCarouselProps) {
  const [lists, setLists] = useState<TripList[]>(() => getTripLists());
  const [batchHint, setBatchHint] = useState("");

  useEffect(() => {
    const sync = () => setLists(getTripLists());
    window.addEventListener(TRIP_LISTS_CHANGE_EVENT, sync);
    return () => window.removeEventListener(TRIP_LISTS_CHANGE_EVENT, sync);
  }, []);

  const addAllToList = (listId: string) => {
    for (const ev of events) {
      addEventToTripList(listId, agentRecommendationToExhibition(ev));
    }
    setLists(getTripLists());
    const name = lists.find((l) => l.id === listId)?.name ?? "";
    setBatchHint(`已將 ${events.length} 筆加入「${name}」`);
    window.setTimeout(() => setBatchHint(""), 4000);
  };

  const createNewListWithAll = () => {
    const suggestedName = title || "AI 推薦清單";
    const name = window.prompt("新行程清單名稱", suggestedName);
    if (name === null) return;
    const list = createTripList(name);
    for (const ev of events) {
      addEventToTripList(list.id, agentRecommendationToExhibition(ev));
    }
    setLists(getTripLists());
    setBatchHint(`已建立並加入「${list.name}」`);
    window.setTimeout(() => setBatchHint(""), 4000);
  };

  return (
    <div className="w-full max-w-[95%] rounded-2xl border border-white/10 bg-[#171728] p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          {title && <p className="text-sm font-semibold text-white">{title}</p>}
          {introText && <p className="mt-1 text-xs text-white/65">{introText}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-xs text-white/85 hover:bg-white/10"
          >
            <ListPlus className="h-3.5 w-3.5" /> 加入行程清單
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px] border border-white/10 bg-[#1a1625] text-white">
            <DropdownMenuLabel className="text-white/80">整批加入</DropdownMenuLabel>
            {lists.length === 0 ? (
              <DropdownMenuItem onClick={createNewListWithAll} className="text-white focus:bg-white/10">
                建立新清單並加入全部…
              </DropdownMenuItem>
            ) : (
              <>
                {lists.map((list) => (
                  <DropdownMenuItem
                    key={list.id}
                    onClick={() => addAllToList(list.id)}
                    className="text-white focus:bg-white/10"
                  >
                    {list.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onClick={createNewListWithAll} className="text-white focus:bg-white/10">
                  新增清單並加入全部…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {batchHint && <p className="mb-3 text-xs text-emerald-300">{batchHint}</p>}

      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
        {events.map((event) => (
          <article
            key={event.id}
            className="relative min-w-[235px] max-w-[235px] snap-start overflow-hidden rounded-xl border border-white/10 bg-[#101019]"
          >
            <div className="absolute right-2 top-2 z-10" onClick={(e) => e.preventDefault()}>
              <AddToTripListMenu kind="event" exhibition={agentRecommendationToExhibition(event)} align="end" />
            </div>
            <img
              src={event.imageUrl || FALLBACK_IMAGE}
              alt={event.title}
              className="h-32 w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
              }}
            />
            <div className="space-y-2 p-3">
              <h4 className="line-clamp-2 text-sm font-bold text-white">{event.title}</h4>
              <p className="flex items-center gap-1 text-[11px] text-white/70">
                <CalendarDays className="h-3.5 w-3.5" /> {event.dateStr}
              </p>
              <p className="line-clamp-1 flex items-center gap-1 text-[11px] text-white/60">
                <MapPin className="h-3.5 w-3.5" /> {event.location}
              </p>
              <Link
                to={`/map?eventId=${encodeURIComponent(event.id)}`}
                className="mt-1 block border-t border-white/10 pt-2 text-center text-xs font-semibold text-cyan-200 hover:text-cyan-100"
              >
                在地圖中查看
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
