import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2,
  MapPin,
  Phone,
  Search,
  Heart,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { listLegalStays, type LegalStay } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import {
  getStayFavoriteIds,
  STAY_FAVORITES_CHANGE_EVENT,
  toggleStayFavorite,
} from "@/lib/stayFavorites";

const PAGE_SIZE = 36;

function matchesSearch(stay: LegalStay, term: string): boolean {
  if (!term.trim()) return true;
  const q = term.trim().toLowerCase();
  const haystack = [
    stay.name,
    stay.address.full,
    stay.address.city,
    stay.address.town,
    stay.description,
    stay.operatorName,
    ...stay.alternateNames,
    ...stay.classLabels,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function Accommodations() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme } = useTheme();
  const isV1 = theme === "v1";
  const [stays, setStays] = useState<LegalStay[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") ?? "");
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [favoriteStayIds, setFavoriteStayIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listLegalStays({ city: "Taipei City", limit: PAGE_SIZE, offset: 0 })
      .then((result) => {
        if (cancelled) return;
        setStays(result.stays);
      })
      .catch((error) => {
        console.error("Failed to load stays", error);
        if (!cancelled) setStays([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sync = () => setFavoriteStayIds(new Set(getStayFavoriteIds()));
    sync();
    window.addEventListener(STAY_FAVORITES_CHANGE_EVENT, sync);
    return () => window.removeEventListener(STAY_FAVORITES_CHANGE_EVENT, sync);
  }, []);

  const visibleStays = useMemo(() => stays.filter((stay) => matchesSearch(stay, searchTerm)), [stays, searchTerm]);

  useEffect(() => {
    if (expandedCardId && !visibleStays.some((s) => s.id === expandedCardId)) {
      setExpandedCardId(null);
    }
  }, [expandedCardId, visibleStays]);
  const handleOpenMapExplore = (stay: LegalStay) => {
    const backParams = new URLSearchParams();
    if (searchTerm.trim()) backParams.set("q", searchTerm.trim());
    const returnTo = `/accommodations${backParams.size ? `?${backParams.toString()}` : ""}`;
    const params = new URLSearchParams({
      stayId: stay.id,
      stayLat: String(stay.location.lat),
      stayLng: String(stay.location.lng),
      stayName: stay.name,
      stayAddress: stay.address.full,
      returnTo,
    });
    navigate(`/map?${params.toString()}`, { state: { prefillStay: stay } });
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set("q", value);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  const handleToggleFavorite = (stayId: string) => {
    const nextFavorited = toggleStayFavorite(stayId);
    setFavoriteStayIds((prev) => {
      const next = new Set(prev);
      if (nextFavorited) next.add(stayId);
      else next.delete(stayId);
      return next;
    });
  };

  return (
    <section className="px-8 py-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header>
          <h1 className="text-4xl font-bold text-white">找住宿</h1>
          <p className="mt-2 text-sm text-white/60">依關鍵字或地點搜尋住宿；點「詳細資訊」可展開下拉內容。</p>
        </header>

        <div className="relative w-full md:max-w-lg">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <input
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            type="search"
            placeholder="搜尋飯店名稱或地點（例：大安、中山、Hotel）"
            className={`h-11 w-full border border-white/10 bg-[#1f1f26]/80 pl-9 pr-4 text-sm text-white shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${isV1 ? "rounded-md" : "rounded-full"}`}
          />
        </div>

        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center gap-3 text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" /> 載入住宿資料中…
          </div>
        ) : visibleStays.length === 0 ? (
          <div className={`border border-white/10 py-16 text-center text-white/55 ${isV1 ? "rounded-md" : "rounded-2xl"}`}>
            找不到符合關鍵字的住宿，請改用其他名稱或地點。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleStays.map((stay) => {
              const expanded = expandedCardId === stay.id;
              return (
                <div
                  key={stay.id}
                  className={`border border-white/10 bg-[#171725] p-4 text-left transition-colors hover:border-cyan-300/35 hover:bg-[#1b1b2b] ${isV1 ? "rounded-md" : "rounded-2xl"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="line-clamp-2 min-w-0 flex-1 text-base font-bold text-white">{stay.name}</h2>
                    <button
                      type="button"
                      onClick={() => handleToggleFavorite(stay.id)}
                      className={`shrink-0 p-1.5 ${isV1 ? "rounded-md" : "rounded-full"} bg-black/25 hover:bg-black/40`}
                      title={favoriteStayIds.has(stay.id) ? "取消收藏" : "加入收藏"}
                    >
                      <Heart
                        className={`h-4 w-4 transition-all ${
                          favoriteStayIds.has(stay.id)
                            ? "fill-purple-500 text-purple-500"
                            : "text-white/55 hover:text-white/85"
                        }`}
                      />
                    </button>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-white/65">
                    {stay.description || "展開可查看地址、電話與更多資訊。"}
                  </p>
                  <p className="mt-3 flex items-start gap-1.5 text-xs text-white/60">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="line-clamp-2">{stay.address.full}</span>
                  </p>
                  <p className="mt-2 text-xs text-cyan-200">{stay.classLabels.join(" / ") || "合法旅宿"}</p>

                  <Button
                    type="button"
                    onClick={() => handleOpenMapExplore(stay)}
                    className={`mt-3 w-full ${isV1 ? "rounded-md" : "rounded-full"} bg-[#00d6ff] font-semibold text-[#042028] hover:bg-[#20deff]`}
                  >
                    地圖探索
                  </Button>

                  <button
                    type="button"
                    onClick={() => setExpandedCardId((id) => (id === stay.id ? null : stay.id))}
                    className={`mt-2 flex w-full items-center justify-between gap-2 border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-black/35 ${isV1 ? "rounded-md" : "rounded-xl"}`}
                    aria-expanded={expanded}
                  >
                    <span>{expanded ? "收合詳細資訊" : "詳細資訊"}</span>
                    {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                  </button>

                  {expanded ? (
                    <div className="mt-3 space-y-3 border-t border-white/10 pt-3 text-xs text-white/75">
                      <p className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-200" />
                        <span>{stay.address.full}</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-cyan-200" />
                        <span>{stay.phones.join("、") || "電話待補"}</span>
                      </p>
                      <p>
                        <span className="text-white/50">星級評等：</span>
                        {stay.starRating ? `${stay.starRating} 星` : "未提供"}
                      </p>
                      {stay.description ? (
                        <p className="leading-relaxed text-white/70">{stay.description}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
