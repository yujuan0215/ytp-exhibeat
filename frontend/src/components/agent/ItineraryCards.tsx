import { useMemo, useState } from "react";
import { CalendarDays, Clock3, MapPin, Navigation, Save } from "lucide-react";
import type { AgentItineraryStop } from "@/lib/api";
import { saveChatItinerary } from "@/lib/itineraries";
import { ActionToast } from "@/components/ActionToast";

type ItineraryCardsProps = {
  title?: string;
  introText?: string;
  date?: string;
  stops: AgentItineraryStop[];
  showSaveAction?: boolean;
};

const FALLBACK_STOP_IMAGE =
  "https://images.unsplash.com/photo-1549490349-8643362247b5?w=1200&auto=format&fit=crop&q=80";
const ITINERARY_BUFFER_MINUTES = 10;

function parseTimeRangeMinutes(range?: string): number | undefined {
  if (!range) return undefined;
  const match = range.match(/(\d{1,2}):(\d{2})\s*[-~–—]\s*(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  const sh = Number(match[1]);
  const sm = Number(match[2]);
  const eh = Number(match[3]);
  const em = Number(match[4]);
  if ([sh, sm, eh, em].some((v) => Number.isNaN(v))) return undefined;
  const start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end < start) end += 24 * 60;
  const diff = end - start;
  return diff > 0 ? diff : undefined;
}

export function ItineraryCards({ title, introText, date, stops, showSaveAction = true }: ItineraryCardsProps) {
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const groupedDays = useMemo(() => {
    const buckets: Array<{ key: string; label: string; dayDate?: string; stops: AgentItineraryStop[] }> = [];
    for (const stop of stops) {
      const label = stop.dayLabel?.trim() || "Day 1";
      const dayDate = stop.dayDate?.trim() || stop.date?.trim() || "";
      const key = `${label}|${dayDate}`;
      const existing = buckets.find((bucket) => bucket.key === key);
      if (existing) {
        existing.stops.push(stop);
      } else {
        buckets.push({ key, label, dayDate: dayDate || undefined, stops: [stop] });
      }
    }
    return buckets;
  }, [stops]);
  const hasPerDayDateLabels = groupedDays.some((group) => Boolean(group.dayDate));

  const renderTransportText = (stop: AgentItineraryStop): string => {
    if (stop.travelSummary) return stop.travelSummary;
    return [stop.transportMode || "", stop.estimatedTravelMinutes ? `${stop.estimatedTravelMinutes} 分鐘` : ""]
      .filter(Boolean)
      .join(" · ");
  };

  const handleSave = () => {
    const suggested = (title || "我的行程").trim();
    const name = window.prompt("請輸入行程名稱", suggested);
    if (name === null) return;
    const finalName = name.trim() || suggested || "我的行程";
    saveChatItinerary({ name: finalName, title, introText, date, stops });
    setToastMessage(`已儲存行程：「${finalName}」`);
    setToastOpen(true);
    window.setTimeout(() => setToastOpen(false), 1800);
  };

  return (
    <div className="w-full max-w-full rounded-2xl border border-white/10 bg-[#171728] p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-white">{title || "AI 行程規劃"}</p>
          {date && !hasPerDayDateLabels ? <p className="mt-1 text-sm text-white/70">日期：{date}</p> : null}
          {introText ? <p className="mt-1 text-sm text-white/70">{introText}</p> : null}
        </div>
        {showSaveAction ? (
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-cyan-300/35 bg-cyan-400/15 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/25"
          >
            <Save className="h-3.5 w-3.5" />
            儲存到行程
          </button>
        ) : null}
      </div>

      <div className="space-y-6">
        {groupedDays.map((group) => (
          <section key={group.key}>
            <p className="mb-3 text-sm font-semibold text-cyan-100">
              {group.label} : {group.dayDate || "日期待確認"}
            </p>
            <div className="space-y-4">
              {group.stops.map((stop, idx) => (
                <article key={`${group.key}-${stop.id}-${idx}`} className="rounded-xl border border-white/10 bg-[#101019] p-4">
            {(() => {
              const slotMinutes = parseTimeRangeMinutes(stop.timeRange);
              const incomingTravel = stop.estimatedTravelMinutes || 0;
              const originalStay = stop.estimatedStayMinutes;
              const maxAllowedStay =
                typeof slotMinutes === "number"
                  ? Math.max(0, slotMinutes - incomingTravel - ITINERARY_BUFFER_MINUTES)
                  : undefined;
              const effectiveStay =
                typeof originalStay === "number" && typeof maxAllowedStay === "number"
                  ? Math.min(originalStay, maxAllowedStay)
                  : originalStay;
              const hasConsistencyAdjust =
                typeof originalStay === "number" &&
                typeof effectiveStay === "number" &&
                effectiveStay < originalStay;
              const impossibleWindow =
                typeof slotMinutes === "number" &&
                slotMinutes < incomingTravel + ITINERARY_BUFFER_MINUTES;

              return (
                <>
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
                  {effectiveStay ? (
                    <p className="flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5" /> 預計停留：{effectiveStay} 分鐘
                    </p>
                  ) : null}
                  {hasConsistencyAdjust ? (
                    <p className="text-xs text-amber-200/90">
                      已依時間一致性調整停留時間（含交通與 {ITINERARY_BUFFER_MINUTES} 分鐘緩衝）。
                    </p>
                  ) : null}
                  {impossibleWindow ? (
                    <p className="text-xs text-amber-200/90">
                      此站時間區間不足以容納交通與緩衝，建議重新排序或放寬時間。
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
                      交通：{renderTransportText(stop)}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
                </>
              );
            })()}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <ActionToast open={toastOpen} message={toastMessage} />
    </div>
  );
}
