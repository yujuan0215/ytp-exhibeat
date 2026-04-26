import { CalendarDays, Clock3, MapPin, Navigation, ExternalLink } from "lucide-react";
import type { AgentItineraryStop } from "@/lib/api";

type ItineraryCardsProps = {
  title?: string;
  introText?: string;
  date?: string;
  stops: AgentItineraryStop[];
};

const FALLBACK_STOP_IMAGE =
  "https://images.unsplash.com/photo-1549490349-8643362247b5?w=1200&auto=format&fit=crop&q=80";

export function ItineraryCards({ title, introText, date, stops }: ItineraryCardsProps) {
  return (
    <div className="w-full max-w-full rounded-2xl border border-white/10 bg-[#171728] p-4">
      <div className="mb-4">
        <p className="text-base font-semibold text-white">{title || "AI 行程規劃"}</p>
        {date ? <p className="mt-1 text-sm text-white/70">日期：{date}</p> : null}
        {introText ? <p className="mt-1 text-sm text-white/70">{introText}</p> : null}
      </div>

      <div className="space-y-4">
        {stops.map((stop, idx) => (
          <article key={`${stop.id}-${idx}`} className="rounded-xl border border-white/10 bg-[#101019] p-4">
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <img
                  src={stop.imageUrl || FALLBACK_STOP_IMAGE}
                  alt={stop.title}
                  className="h-48 w-full rounded-lg object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = FALLBACK_STOP_IMAGE;
                  }}
                />
              </div>

              <div>
                <h4 className="text-lg font-bold text-white">{idx + 1}. {stop.title}</h4>
                <div className="flex items-start justify-between gap-3">
                  <p className="mt-1 text-sm font-semibold text-white/85">行程資訊</p>
                  {stop.timeRange ? <p className="shrink-0 text-sm font-semibold text-white/85">{stop.timeRange}</p> : null}
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/75">
                  {stop.estimatedStayMinutes ? (
                    <p className="flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5" /> 預計停留：{stop.estimatedStayMinutes} 分鐘
                    </p>
                  ) : null}
                  {stop.location ? (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> 地點：{stop.location}
                    </p>
                  ) : null}
                  {stop.date ? (
                    <p className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" /> 日期：{stop.date}
                    </p>
                  ) : null}
                  {stop.price ? <p>價格：{stop.price}</p> : null}
                  {stop.transportMode || stop.estimatedTravelMinutes || stop.travelSummary ? (
                    <p className="flex items-center gap-1.5">
                      <Navigation className="h-3.5 w-3.5" />
                      交通：
                      {[
                        stop.transportMode ? `${stop.transportMode}` : "",
                        stop.estimatedTravelMinutes ? `${stop.estimatedTravelMinutes} 分鐘` : "",
                        stop.travelSummary ? stop.travelSummary : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>

                {stop.mapUrl || stop.directionsUrl ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {stop.mapUrl ? (
                      <a
                        href={stop.mapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-400/15 px-3.5 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/20"
                      >
                        <MapPin className="h-3.5 w-3.5" /> 地圖
                      </a>
                    ) : null}
                    {stop.directionsUrl ? (
                      <a
                        href={stop.directionsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-purple-300/30 bg-purple-400/15 px-3.5 py-2 text-xs font-semibold text-purple-100 hover:bg-purple-400/20"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> 導航路線
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
