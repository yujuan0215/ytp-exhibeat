import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Exhibition, Recommendation } from "@/data/mock";
import { getCollectionRecommendations, getMoreCollectionRecommendations } from "@/lib/api";
import { ExhibitionCard } from "@/components/ExhibitionCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap, Loader2, ChevronDown, Lock } from "lucide-react";
import { getFavorites } from "@/lib/favorites";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1549490349-8643362247b5?w=300&auto=format&fit=crop&q=60";
const DEFAULT_REF_COORD = { lat: 25.033, lng: 121.5654 }; // Taipei 101 area fallback

function getEndDateTimestamp(exhibition: Exhibition): number {
  if (exhibition._meta?.endDate) {
    const parsed = new Date(exhibition._meta.endDate).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  const raw = exhibition.dateStr ?? "";
  const parts = raw.split(/-|->|—/).map((v) => v.trim()).filter(Boolean);
  const candidate = parts[parts.length - 1];
  if (!candidate) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(candidate).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthKm * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

export function Collection() {
  const { theme } = useTheme();
  const isV1 = theme === "v1";
  const { user, status } = useAuth();
  const [collectionExhibitions, setCollectionExhibitions] = useState<Exhibition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allRecs, setAllRecs] = useState<Recommendation[]>([]);
  const [recsVisible, setRecsVisible] = useState(3);
  const [hasMoreRecs, setHasMoreRecs] = useState(true);
  const [sortMode, setSortMode] = useState<"date" | "distance">("date");
  const [referenceCoord, setReferenceCoord] = useState(DEFAULT_REF_COORD);

  useEffect(() => {
    setCollectionExhibitions(getFavorites());

    getCollectionRecommendations()
      .then(data => {
        setAllRecs(data.recommendations);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch collection recommendations", err);
        setLoading(false);
      });

    // Sync with favorites changes
    const handleSync = () => setCollectionExhibitions(getFavorites());
    window.addEventListener("favorites-changed", handleSync);
    return () => window.removeEventListener("favorites-changed", handleSync);
  }, []);

  useEffect(() => {
    if (sortMode !== "distance" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setReferenceCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        // Keep fallback coordinate when user blocks geolocation.
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 1000 * 60 * 5 },
    );
  }, [sortMode]);

  const handleLoadMoreRecs = async () => {
    if (recsVisible < allRecs.length) {
      // Show pre-loaded recs first
      setRecsVisible(v => Math.min(v + 3, allRecs.length));
      return;
    }
    // Fetch a new batch from the API
    setLoadingMore(true);
    try {
      const newRecs = await getMoreCollectionRecommendations();
      const combined = [...allRecs, ...newRecs.filter(r => !allRecs.find(e => e.id === r.id))];
      setAllRecs(combined);
      setRecsVisible(v => v + 3);
      if (combined.length <= recsVisible + 3) setHasMoreRecs(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const visibleRecs = allRecs.slice(0, recsVisible);
  const sortedCollection = useMemo(() => {
    const list = [...collectionExhibitions];
    if (sortMode === "distance") {
      return list.sort((a, b) => {
        const aLat = a._meta?.latitude;
        const aLng = a._meta?.longitude;
        const bLat = b._meta?.latitude;
        const bLng = b._meta?.longitude;
        const aHasCoord = typeof aLat === "number" && typeof aLng === "number";
        const bHasCoord = typeof bLat === "number" && typeof bLng === "number";
        if (!aHasCoord && !bHasCoord) return a.title.localeCompare(b.title, "zh-Hant");
        if (!aHasCoord) return 1;
        if (!bHasCoord) return -1;
        const aDistance = haversineKm(referenceCoord, { lat: aLat, lng: aLng });
        const bDistance = haversineKm(referenceCoord, { lat: bLat, lng: bLng });
        return aDistance - bDistance;
      });
    }
    return list.sort((a, b) => getEndDateTimestamp(a) - getEndDateTimestamp(b));
  }, [collectionExhibitions, referenceCoord, sortMode]);

  const endingSoon = collectionExhibitions.filter(e => {
    const end = new Date(e.dateStr.replace(/.*-> /, "").trim());
    const diff = (end.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  }).length;

  return (
    <div className="px-8 py-10 w-full flex flex-col lg:flex-row gap-10">
      
      {/* ── Main Content Area ── */}
      <div className="flex-1">
        <header className="flex flex-col md:flex-row items-baseline justify-between mb-8 gap-4">
          <div>
            <h2 className="text-secondary text-sm font-bold tracking-widest uppercase mb-2">Personal Gallery</h2>
            <h1 className="text-4xl font-extrabold text-white">我的收藏</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className={`hidden md:flex items-center gap-1 border border-white/10 bg-white/5 p-1 ${isV1 ? "rounded-md" : "rounded-full"}`}>
              <button
                type="button"
                onClick={() => setSortMode("date")}
                className={`px-3 py-1 text-sm font-medium transition-colors ${isV1 ? "rounded-sm" : "rounded-full"} ${
                  sortMode === "date" ? "bg-[#00d6ff] text-[#042028]" : "text-white/65 hover:text-white"
                }`}
              >
                按日期
              </button>
              <button
                type="button"
                onClick={() => setSortMode("distance")}
                className={`px-3 py-1 text-sm font-medium transition-colors ${isV1 ? "rounded-sm" : "rounded-full"} ${
                  sortMode === "distance" ? "bg-[#00d6ff] text-[#042028]" : "text-white/65 hover:text-white"
                }`}
              >
                按距離
              </button>
            </div>
            <Button variant="outline" size="sm" className={`${isV1 ? "rounded-md" : "rounded-full"} bg-surface-container-low border-transparent text-white hover:bg-white/10 flex items-center gap-2`}>
              <Zap className="w-4 h-4" /> 篩選
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[300px]">
          {status === "loading" ? (
            <div className="col-span-full flex justify-center items-center gap-3 h-60 text-white/50">
              <Loader2 className="w-5 h-5 animate-spin" /> 檢查登入狀態…
            </div>
          ) : !user ? (
            <div className={`col-span-full flex flex-col items-center justify-center text-center gap-4 py-16 ${isV1 ? "rounded-md" : "rounded-3xl"} bg-surface-container/50`}>
              <div className={`w-14 h-14 ${isV1 ? "rounded-md" : "rounded-full"} bg-primary/10 flex items-center justify-center`}>
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-white/80 font-semibold">登入後解鎖你的收藏</p>
                <p className="text-white/50 text-sm">收藏會同步到你的帳號，換裝置也能繼續追蹤。</p>
              </div>
              <div className="flex gap-3">
                <Link
                  to="/login"
                  state={{ from: "/collection" }}
                  className={`px-5 py-2 ${isV1 ? "rounded-md bg-primary hover:bg-primary/90" : "rounded-full btn-gradient-safe"} text-sm font-semibold transition-colors`}
                >
                  前往登入
                </Link>
                <Link
                  to="/register"
                  state={{ from: "/collection" }}
                  className={`px-5 py-2 ${isV1 ? "rounded-md" : "rounded-full"} border border-outline-variant/30 bg-surface-container-low hover:bg-surface-container-high text-sm font-semibold text-white/80 hover:text-white transition-colors`}
                >
                  建立帳號
                </Link>
              </div>
            </div>
          ) : loading ? (
            <div className="col-span-full flex justify-center items-center gap-3 h-60 text-white/50">
              <Loader2 className="w-5 h-5 animate-spin" /> 載入收藏中…
            </div>
          ) : sortedCollection.length > 0 ? (
            sortedCollection.map(exhibition => (
              <ExhibitionCard key={exhibition.id} exhibition={exhibition} isCollectionVariant={true} />
            ))
          ) : (
            <div className="col-span-full flex justify-center items-center h-60 text-white/50">
               無收藏資料
            </div>
          )}
        </div>
      </div>

      {/* ── Sidebar Area ── */}
      <aside className="w-full lg:w-80 flex flex-col gap-8">
        
        {/* Recommendations */}
        <div className={`bg-surface-container-low ${isV1 ? "rounded-md" : "rounded-3xl"} p-6`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">推薦給您</h3>
            <Sparkles className="w-6 h-6 text-purple-500" />
          </div>
          
          <div className="space-y-4">
            {loading ? (
              <div className="text-white/50 text-sm text-center py-4 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> 載入推薦…
              </div>
            ) : visibleRecs.length > 0 ? (
              visibleRecs.map(rec => (
                <div key={rec.id} className={`flex gap-4 items-center group cursor-pointer hover:bg-white/5 p-2 -mx-2 min-h-[82px] ${isV1 ? "rounded-md" : "rounded-xl"} transition-colors`}>
                  <img
                    src={rec.imageUrl}
                    alt={rec.title}
                    className={`w-16 h-16 ${isV1 ? "rounded-md" : "rounded-lg"} object-cover flex-shrink-0`}
                    onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_IMAGE; }}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] text-secondary font-medium tracking-wider mb-1 block truncate">
                      {rec.tag}
                    </span>
                    <h4 className="font-bold text-sm text-white mb-1 leading-tight group-hover:text-primary transition-colors line-clamp-2 min-h-[34px]">
                      {rec.title}
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-1">{rec.location}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-white/50 text-sm py-4">目前沒有推薦</div>
            )}
          </div>
          
          {hasMoreRecs && (
            <Button
              variant="outline"
              className={`w-full mt-6 ${isV1 ? "rounded-md" : "rounded-full"} border-primary/30 text-primary hover:bg-primary/10 hover:text-primary bg-transparent transition-colors gap-2`}
              onClick={handleLoadMoreRecs}
              disabled={loadingMore}
            >
              {loadingMore
                ? <><Loader2 className="w-4 h-4 animate-spin" /> 載入中…</>
                : <><ChevronDown className="w-4 h-4" /> 探索更多推薦</>
              }
            </Button>
          )}
          {!hasMoreRecs && (
            <p className="text-center text-white/30 text-xs mt-4">已顯示全部推薦</p>
          )}
        </div>

        {/* Stats */}
        <Card className={`bg-surface-container-low border-transparent ring-0 ${isV1 ? "rounded-md" : "rounded-3xl"} pt-2`}>
          <CardContent className="p-6">
            <h3 className="text-lg font-bold text-white mb-6">收藏統計</h3>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-4xl font-light text-primary mb-1">{collectionExhibitions.length}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-widest">收藏活動</p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-light text-secondary mb-1">{endingSoon}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-widest">即將結束</p>
              </div>
            </div>
          </CardContent>
        </Card>

      </aside>
    </div>
  );
}
