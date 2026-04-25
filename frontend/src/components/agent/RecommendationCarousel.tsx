import { useState } from "react";
import { Link } from "react-router-dom";
import { BookmarkPlus, MapPin, CalendarDays } from "lucide-react";
import type { AgentRecommendationItem } from "@/lib/api";
import { saveRecommendationList } from "@/lib/recommendationLists";

type RecommendationCarouselProps = {
  title?: string;
  introText?: string;
  events: AgentRecommendationItem[];
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1549490349-8643362247b5?w=600&auto=format&fit=crop&q=80";

export function RecommendationCarousel({ title, introText, events }: RecommendationCarouselProps) {
  const [savedName, setSavedName] = useState("");

  const handleSaveList = () => {
    const suggestedName = title || "AI 推薦清單";
    const name = window.prompt("請輸入清單名稱", suggestedName);
    if (name === null) return;
    const saved = saveRecommendationList(name, events);
    setSavedName(saved.name);
  };

  return (
    <div className="w-full max-w-[95%] rounded-2xl border border-white/10 bg-[#171728] p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          {title && <p className="text-sm font-semibold text-white">{title}</p>}
          {introText && <p className="mt-1 text-xs text-white/65">{introText}</p>}
        </div>
        <button
          type="button"
          onClick={handleSaveList}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-xs text-white/85 hover:bg-white/10"
        >
          <BookmarkPlus className="h-3.5 w-3.5" /> 儲存為清單
        </button>
      </div>

      {savedName && <p className="mb-3 text-xs text-emerald-300">已儲存推薦清單：{savedName}</p>}

      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
        {events.map((event) => (
          <article
            key={event.id}
            className="min-w-[235px] max-w-[235px] snap-start overflow-hidden rounded-xl border border-white/10 bg-[#101019]"
          >
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
