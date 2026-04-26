import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ListPlus, MapPin, CalendarDays } from "lucide-react";
import type { AgentRecommendationItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  addStayToTripList,
  addEventToTripList,
  agentRecommendationToExhibition,
  agentRecommendationToStay,
  createTripList,
  getTripLists,
  TRIP_LISTS_CHANGE_EVENT,
  type TripList,
} from "@/lib/tripLists";
import { AddToTripListMenu } from "@/components/collection/AddToTripListMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getLocaleCopy, useLanguage } from "@/lib/language";

type RecommendationCarouselProps = {
  title?: string;
  introText?: string;
  events: AgentRecommendationItem[];
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1549490349-8643362247b5?w=600&auto=format&fit=crop&q=80";

export function RecommendationCarousel({ title, introText, events }: RecommendationCarouselProps) {
  const { user } = useAuth();
  const { locale } = useLanguage();
  const copy = getLocaleCopy(locale, {
    "zh-TW": {
      addToTripList: "加入行程清單",
      addBatch: "整批加入",
      createAndAddAll: "建立新清單並加入全部…",
      createAndAddAllAlt: "新增清單並加入全部…",
      addedToList: (count: number, name: string) => `已將 ${count} 筆加入「${name}」`,
      createdAndAdded: (name: string) => `已建立並加入「${name}」`,
      newListPrompt: "新行程清單名稱",
      aiList: "AI 推薦清單",
      reason: "推薦原因：",
      viewStayOnMap: "在地圖中查看住宿",
      viewOnMap: "在地圖中查看",
    },
    en: {
      addToTripList: "Add to trip list",
      addBatch: "Batch add",
      createAndAddAll: "Create new list and add all…",
      createAndAddAllAlt: "Create list and add all…",
      addedToList: (count: number, name: string) => `Added ${count} items to "${name}"`,
      createdAndAdded: (name: string) => `Created and added to "${name}"`,
      newListPrompt: "New trip list name",
      aiList: "AI Recommendations",
      reason: "Why recommended:",
      viewStayOnMap: "View stay on map",
      viewOnMap: "View on map",
    },
    fr: {
      addToTripList: "Ajouter à la liste de voyage",
      addBatch: "Ajouter en lot",
      createAndAddAll: "Créer et tout ajouter",
      createAndAddAllAlt: "Créer une nouvelle liste et tout ajouter",
      addedToList: (count: number, name: string) => `${count} éléments ajoutés à « ${name} »`,
      createdAndAdded: (name: string) => `Créé et ajouté à « ${name} »`,
      newListPrompt: "Nom de la nouvelle liste",
      aiList: "Liste IA",
      reason: "Raison de recommandation",
      viewStayOnMap: "Voir l'hébergement sur la carte",
      viewOnMap: "Voir sur la carte",
    },
  });
  const location = useLocation();
  const [lists, setLists] = useState<TripList[]>(() => getTripLists());
  const [batchHint, setBatchHint] = useState("");
  const returnTo = `${location.pathname}${location.search}`;

  useEffect(() => {
    const sync = () => setLists(getTripLists());
    window.addEventListener(TRIP_LISTS_CHANGE_EVENT, sync);
    return () => window.removeEventListener(TRIP_LISTS_CHANGE_EVENT, sync);
  }, []);

  const addAllToList = (listId: string) => {
    for (const ev of events) {
      if (ev.itemType === "stay") addStayToTripList(listId, agentRecommendationToStay(ev));
      else addEventToTripList(listId, agentRecommendationToExhibition(ev));
    }
    setLists(getTripLists());
    const name = lists.find((l) => l.id === listId)?.name ?? "";
    setBatchHint(copy.addedToList(events.length, name));
    window.setTimeout(() => setBatchHint(""), 4000);
  };

  const createNewListWithAll = () => {
    if (!user) return;
    const suggested = `${title || copy.aiList} ${new Date().toLocaleDateString("zh-TW")}`;
    let input: string | null = null;
    try {
      input = window.prompt(copy.newListPrompt, suggested);
    } catch {
      input = suggested;
    }
    // If prompt is blocked by environment, still create list with suggested name.
    const list = createTripList((input ?? suggested).trim() || suggested);
    for (const ev of events) {
      if (ev.itemType === "stay") addStayToTripList(list.id, agentRecommendationToStay(ev));
      else addEventToTripList(list.id, agentRecommendationToExhibition(ev));
    }
    setLists(getTripLists());
    setBatchHint(copy.createdAndAdded(list.name));
    window.setTimeout(() => setBatchHint(""), 4000);
  };

  return (
    <div className="w-full max-w-full rounded-2xl border border-white/10 bg-[#171728] p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          {title && <p className="text-sm font-semibold text-white">{title}</p>}
          {introText && <p className="mt-1 text-xs text-white/65">{introText}</p>}
        </div>
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-xs text-white/85 hover:bg-white/10"
            >
              <ListPlus className="h-3.5 w-3.5" /> {copy.addToTripList}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px] border border-white/10 bg-[#1a1625] text-white">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-white/80">{copy.addBatch}</DropdownMenuLabel>
                {lists.length === 0 ? (
                  <DropdownMenuItem onClick={createNewListWithAll} className="text-white focus:bg-white/10">
                    {copy.createAndAddAll}
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
                      {copy.createAndAddAllAlt}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {batchHint && <p className="mb-3 text-xs text-emerald-300">{batchHint}</p>}

      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
        {events.map((event) => (
          <article
            key={event.id}
            className="relative min-w-[235px] max-w-[235px] snap-start overflow-hidden rounded-xl border border-white/10 bg-[#101019]"
          >
            <div className="absolute right-2 top-2 z-10" onClick={(e) => e.preventDefault()}>
              {event.itemType !== "stay" ? (
                <AddToTripListMenu
                  kind="event"
                  exhibition={agentRecommendationToExhibition(event)}
                  align="end"
                  requireAuth={true}
                />
              ) : (
                <AddToTripListMenu
                  kind="stay"
                  stay={agentRecommendationToStay(event)}
                  align="end"
                  requireAuth={true}
                />
              )}
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
              {event.reason && (
                <p className="line-clamp-2 text-[11px] leading-relaxed text-white/65">
                  {copy.reason}{event.reason}
                </p>
              )}
              <Link
                to={
                  event.itemType === "stay" && Number.isFinite(event.stayLat) && Number.isFinite(event.stayLng)
                    ? `/map?stayId=${encodeURIComponent(event.id)}&stayLat=${encodeURIComponent(String(event.stayLat))}&stayLng=${encodeURIComponent(String(event.stayLng))}&stayName=${encodeURIComponent(event.title)}&stayAddress=${encodeURIComponent(event.stayAddress || event.location)}&returnTo=${encodeURIComponent(returnTo)}`
                    : `/map?eventId=${encodeURIComponent(event.id)}&returnTo=${encodeURIComponent(returnTo)}`
                }
                state={
                  event.itemType === "stay"
                    ? { prefillStay: agentRecommendationToStay(event) }
                    : { prefillEvent: agentRecommendationToExhibition(event) }
                }
                className="mt-1 block border-t border-white/10 pt-2 text-center text-xs font-semibold text-cyan-200 hover:text-cyan-100"
              >
                {event.itemType === "stay" ? copy.viewStayOnMap : copy.viewOnMap}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
