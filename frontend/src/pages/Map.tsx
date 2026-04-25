import { useEffect, useMemo, useRef, useState } from "react";
import type { Exhibition } from "@/data/mock";
import { getHomeRecommendations } from "@/lib/api";
import { isFavorited, toggleFavorite } from "@/lib/favorites";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useLocation, useSearchParams } from "react-router-dom";
import { SignInPrompt } from "@/components/SignInPrompt";
import { ActionToast } from "@/components/ActionToast";
import { Heart, MapPin, Clock3, Navigation, ArrowLeft, ExternalLink } from "lucide-react";

declare global {
  interface Window {
    google?: any;
    gm_authFailure?: () => void;
  }
}

const FALLBACK_CENTER = { lat: 25.0478, lng: 121.5319 };

const DARK_MAP_STYLES = [
  {
    featureType: "landscape",
    elementType: "all",
    stylers: [{ hue: "#6600ff" }, { saturation: -11 }, { visibility: "on" }],
  },
  {
    featureType: "poi",
    elementType: "all",
    stylers: [{ saturation: "33" }, { hue: "#6600ff" }, { lightness: "2" }, { visibility: "simplified" }],
  },
  {
    featureType: "poi.attraction",
    elementType: "all",
    stylers: [{ saturation: "-58" }, { lightness: "28" }],
  },
  {
    featureType: "poi.business",
    elementType: "all",
    stylers: [{ saturation: "-58" }, { lightness: "28" }],
  },
  {
    featureType: "poi.government",
    elementType: "all",
    stylers: [{ saturation: "-58" }, { lightness: "28" }],
  },
  {
    featureType: "poi.medical",
    elementType: "all",
    stylers: [{ saturation: "-58" }, { lightness: "28" }],
  },
  {
    featureType: "poi.park",
    elementType: "all",
    stylers: [{ visibility: "on" }, { saturation: "-58" }, { lightness: "28" }],
  },
  {
    featureType: "poi.place_of_worship",
    elementType: "all",
    stylers: [{ saturation: "-58" }, { lightness: "28" }],
  },
  {
    featureType: "poi.school",
    elementType: "all",
    stylers: [{ saturation: "-58" }, { lightness: "28" }],
  },
  {
    featureType: "poi.sports_complex",
    elementType: "all",
    stylers: [{ saturation: "-58" }, { lightness: "28" }],
  },
  {
    featureType: "road",
    elementType: "all",
    stylers: [{ hue: "#5e00ff" }, { saturation: -79 }],
  },
  {
    featureType: "road.arterial",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road.local",
    elementType: "all",
    stylers: [{ lightness: 30 }, { weight: 1.3 }],
  },
  {
    featureType: "transit",
    elementType: "all",
    stylers: [{ visibility: "simplified" }, { hue: "#5e00ff" }, { saturation: -16 }],
  },
  {
    featureType: "transit.line",
    elementType: "all",
    stylers: [{ saturation: -72 }],
  },
  {
    featureType: "water",
    elementType: "all",
    stylers: [{ saturation: -65 }, { hue: "#1900ff" }, { lightness: 8 }],
  },
];

type LatLng = { lat: number; lng: number };
type MarkerSeed = { item: Exhibition; coord: LatLng | null; geocodeQuery: string };

const CITY_COORDS: Record<string, LatLng> = {
  "台北市": { lat: 25.033, lng: 121.5654 },
  "新北市": { lat: 25.012, lng: 121.4657 },
  "基隆市": { lat: 25.1283, lng: 121.7419 },
  "桃園市": { lat: 24.9937, lng: 121.301 },
  "台中市": { lat: 24.1477, lng: 120.6736 },
  "台南市": { lat: 22.9997, lng: 120.227 },
  "高雄市": { lat: 22.6273, lng: 120.3014 },
};

const VENUE_HINT_COORDS: Array<{ hint: string; coord: LatLng }> = [
  { hint: "華山", coord: { lat: 25.044, lng: 121.5299 } },
  { hint: "松山文創", coord: { lat: 25.0441, lng: 121.5604 } },
  { hint: "台北市立美術館", coord: { lat: 25.0722, lng: 121.5249 } },
  { hint: "光點台北", coord: { lat: 25.0525, lng: 121.5225 } },
];

function getApproxCoordinate(exhibition: Exhibition): LatLng {
  const city = exhibition.location.split("•")[1]?.trim();
  if (city && CITY_COORDS[city]) return CITY_COORDS[city];

  for (const { hint, coord } of VENUE_HINT_COORDS) {
    if (exhibition.location.includes(hint) || exhibition.title.includes(hint)) {
      return coord;
    }
  }

  return FALLBACK_CENTER;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildEventPageUrl(item: Exhibition): string {
  return `/exhibition/${encodeURIComponent(item.id)}`;
}

function getItemCoords(item: Exhibition): LatLng | null {
  const meta = item._meta as ({ latitude?: number; longitude?: number } | undefined);
  if (typeof meta?.latitude === "number" && typeof meta?.longitude === "number") {
    return { lat: meta.latitude, lng: meta.longitude };
  }
  return null;
}

function buildGoogleMapsUrl(item: Exhibition): string {
  const coord = getItemCoords(item);
  if (coord) {
    return `https://www.google.com/maps/search/?api=1&query=${coord.lat},${coord.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`;
}

function geocodeWithGoogle(geocoder: any, address: string): Promise<LatLng | null> {
  return new Promise((resolve) => {
    geocoder.geocode({ address }, (results: any[], status: string) => {
      if (status !== "OK" || !results?.length) {
        resolve(null);
        return;
      }
      const loc = results[0]?.geometry?.location;
      if (!loc) {
        resolve(null);
        return;
      }
      resolve({ lat: loc.lat(), lng: loc.lng() });
    });
  });
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps-loader="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsLoader = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });
}

export function Map() {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme } = useTheme();
  const isV1 = theme === "v1";
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAP_ID;
  const styleMode = (import.meta.env.VITE_GOOGLE_MAP_STYLE_MODE ?? "local").trim().toLowerCase();
  const useCloudStyle = styleMode === "cloud" && !!mapId;

  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "nearby" | "free" | "ending">("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [mapInitError, setMapInitError] = useState<string | null>(null);
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const markerLookupRef = useRef<Record<string, { marker: any; content: string }>>({});

  useEffect(() => {
    const styleId = "map-info-window-theme";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .gm-style .gm-style-iw-c {
        padding: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        border-radius: 12px !important;
      }
      .gm-style .gm-style-iw-d {
        overflow: hidden !important;
      }
      .gm-style .gm-style-iw-tc::after {
        background: #111827 !important;
      }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    getHomeRecommendations()
      .then((data) => setExhibitions(data))
      .catch((err) => {
        console.error(err);
        setError("Failed to load exhibitions");
      })
      .finally(() => setLoading(false));
  }, []);

  const markerData = useMemo(
    () =>
      exhibitions.map((item) => ({
        item,
        coord: getItemCoords(item),
        geocodeQuery: `${item.location.replace("•", " ")} ${item.title} 台灣`,
      })),
    [exhibitions],
  );

  const sidebarItems = useMemo(() => {
    const list = [...exhibitions];
    if (activeFilter === "free") {
      return list.filter((e) => e.price === "FREE" || e._meta?.isFree).slice(0, visibleCount);
    }
    if (activeFilter === "ending") {
      return list
        .filter((e) => !!e._meta?.endDate)
        .sort((a, b) => new Date(a._meta?.endDate || "").getTime() - new Date(b._meta?.endDate || "").getTime())
        .slice(0, visibleCount);
    }
    if (activeFilter === "nearby") {
      return list
        .filter((e) => Boolean(getItemCoords(e)))
        .slice(0, visibleCount);
    }
    return list.slice(0, visibleCount);
  }, [activeFilter, exhibitions, visibleCount]);

  const totalFilteredCount = useMemo(() => {
    const list = [...exhibitions];
    if (activeFilter === "free") return list.filter((e) => e.price === "FREE" || e._meta?.isFree).length;
    if (activeFilter === "ending") return list.filter((e) => !!e._meta?.endDate).length;
    if (activeFilter === "nearby") {
      return list.filter((e) => Boolean(getItemCoords(e))).length;
    }
    return list.length;
  }, [activeFilter, exhibitions]);

  const hasMore = sidebarItems.length < totalFilteredCount;
  const selectedItem = useMemo(
    () => (selectedEventId ? exhibitions.find((item) => item.id === selectedEventId) ?? null : null),
    [exhibitions, selectedEventId],
  );
  const selectedTicketPrice = selectedItem
    ? selectedItem.price === "FREE" || selectedItem._meta?.isFree
      ? "FREE"
      : String(selectedItem.price ?? "NT$450")
    : "";
  const selectedSummary =
    selectedItem?.aiSummary ||
    "這檔展演結合空間敘事與視覺節奏，適合先在地圖上掌握位置與檔期後，再安排現場參觀。";
  const queryEventId = searchParams.get("eventId");

  useEffect(() => {
    setVisibleCount(5);
  }, [activeFilter]);

  useEffect(() => {
    const syncFavorites = () => {
      setFavoriteIds(new Set(exhibitions.filter((e) => isFavorited(e.id)).map((e) => e.id)));
    };
    syncFavorites();
    window.addEventListener("favorites-changed", syncFavorites);
    return () => window.removeEventListener("favorites-changed", syncFavorites);
  }, [exhibitions]);

  const handleToggleFavorite = async (e: React.MouseEvent, exhibition: Exhibition) => {
    e.stopPropagation();
    if (!user) {
      setShowSignInPrompt(true);
      return;
    }
    const nowFavorited = await toggleFavorite(exhibition);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (nowFavorited) next.add(exhibition.id);
      else next.delete(exhibition.id);
      return next;
    });
    setToastMessage(nowFavorited ? "已加入收藏" : "已取消收藏");
    setShowToast(true);
  };

  useEffect(() => {
    if (!showToast) return;
    const timer = window.setTimeout(() => setShowToast(false), 1800);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  useEffect(() => {
    const prevHandler = window.gm_authFailure;
    window.gm_authFailure = () => {
      setMapInitError(
        "Google Maps authentication failed (gm_authFailure). Check API key referrer restrictions and billing.",
      );
      if (typeof prevHandler === "function") {
        prevHandler();
      }
    };
    return () => {
      window.gm_authFailure = prevHandler;
    };
  }, []);

  const focusEventOnMap = (eventId: string, syncQuery = true) => {
    const map = mapInstanceRef.current;
    const infoWindow = infoWindowRef.current;
    const entry = markerLookupRef.current[eventId];
    if (!map || !infoWindow || !entry) return;

    const pos = entry.marker.getPosition?.();
    if (pos) {
      map.panTo(pos);
      map.setZoom(Math.max(map.getZoom?.() ?? 11, 13));
    }
    infoWindow.setContent(entry.content);
    infoWindow.open({ anchor: entry.marker, map });
    setSelectedEventId(eventId);
    if (syncQuery) {
      const next = new URLSearchParams(searchParams);
      next.set("eventId", eventId);
      setSearchParams(next, { replace: true });
    }
  };

  useEffect(() => {
    // Even when there are zero exhibitions, initialize the base map so users
    // can still see the map canvas instead of a blank panel.
    if (!mapRef.current || !apiKey) return;

    let detached = false;
    let markers: any[] = [];

    loadGoogleMaps(apiKey)
      .then(async () => {
        setMapInitError(null);
        if (detached || !mapRef.current) return;

        const maps = window.google?.maps;
        if (!maps) throw new Error("Google Maps SDK not available");

        const geocoder = new maps.Geocoder();
        const resolvedData = await Promise.all(
          markerData.map(async (entry: MarkerSeed) => {
            if (entry.coord) return { item: entry.item, coord: entry.coord };

            const cacheKey = `geocode:${entry.geocodeQuery}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
              try {
                const parsed = JSON.parse(cached) as LatLng;
                if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
                  return { item: entry.item, coord: parsed };
                }
              } catch {
                // ignore invalid cache and re-geocode
              }
            }

            const geocoded = await geocodeWithGoogle(geocoder, entry.geocodeQuery);
            if (geocoded) {
              localStorage.setItem(cacheKey, JSON.stringify(geocoded));
              return { item: entry.item, coord: geocoded };
            }

            return { item: entry.item, coord: getApproxCoordinate(entry.item) };
          }),
        );
        if (detached || !mapRef.current) return;

        const map = new maps.Map(mapRef.current, {
          center: resolvedData[0]?.coord ?? FALLBACK_CENTER,
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
          ...(useCloudStyle
            ? { mapId }
            : {
                mapTypeId: "roadmap",
                styles: DARK_MAP_STYLES,
                backgroundColor: "#0b1220",
              }),
        });

        const infoWindow = new maps.InfoWindow();
        mapInstanceRef.current = map;
        infoWindowRef.current = infoWindow;
        markerLookupRef.current = {};
        const bounds = new maps.LatLngBounds();

        markers = resolvedData.map(({ item, coord }) => {
          const safeTitle = escapeHtml(item.title);
          const safeLocation = escapeHtml(item.location);
          const safeDate = escapeHtml(item.dateStr);
          const eventUrl = buildEventPageUrl(item);

          const marker = new maps.Marker({
            position: coord,
            map,
            title: item.title,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: "#a855f7",
              fillOpacity: 0.95,
              strokeColor: "#4c1d95",
              strokeWeight: 2,
            },
          });

          const popupContent = `<div style="max-width:240px;background:#111827;color:#e5e7eb;padding:10px 12px;border-radius:10px;line-height:1.45;">
                <strong style="display:block;color:#f5f3ff;margin-bottom:4px;">${safeTitle}</strong>
                <span style="display:block;color:#c4b5fd;">${safeLocation}</span>
                <span style="display:block;color:#cbd5e1;margin-top:2px;">${safeDate}</span>
                <a href="${eventUrl}" style="display:inline-block;margin-top:10px;color:#e9d5ff;text-decoration:none;border:1px solid #7c3aed;background:#581c87;padding:5px 9px;border-radius:999px;font-size:12px;">
                  造訪活動頁面
                </a>
              </div>`;

          markerLookupRef.current[item.id] = { marker, content: popupContent };
          marker.addListener("click", () => focusEventOnMap(item.id));

          bounds.extend(coord);
          return marker;
        });

        if (resolvedData.length > 1) map.fitBounds(bounds);
        setMapReadyVersion((prev) => prev + 1);
      })
      .catch((e) => {
        console.error(e);
        setError("Google Maps failed to initialize");
        setMapInitError(e instanceof Error ? e.message : "Unknown Google Maps initialization error");
      });

    return () => {
      detached = true;
      markers.forEach((m) => m.setMap(null));
      markerLookupRef.current = {};
      mapInstanceRef.current = null;
      infoWindowRef.current = null;
    };
  }, [apiKey, mapId, markerData, useCloudStyle]);

  useEffect(() => {
    if (!queryEventId) {
      setSelectedEventId(null);
      return;
    }
    const exists = exhibitions.some((item) => item.id === queryEventId);
    if (!exists) return;
    if (markerLookupRef.current[queryEventId]) {
      focusEventOnMap(queryEventId, false);
      return;
    }
    setSelectedEventId(queryEventId);
  }, [queryEventId, exhibitions, mapReadyVersion]);

  if (!apiKey) {
    return (
      <section className="px-8 py-10">
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-amber-200">
          Missing `VITE_GOOGLE_MAPS_API_KEY`. Add it in `frontend/.env.local` to enable the map.
        </div>
      </section>
    );
  }

  return (
    <section className="px-8 py-6 h-[calc(100vh-6.5rem)]">
      <div className={`grid h-full gap-0 overflow-hidden border border-white/10 bg-[#0b1220] shadow-2xl ${isV1 ? "rounded-md" : "rounded-3xl"} lg:grid-cols-[minmax(0,1fr)_380px]`}>
        <div className="relative h-full min-h-0 border-r border-white/10">
          <div ref={mapRef} className="absolute inset-0 h-full w-full" />
          {loading && (
            <div className="absolute left-5 top-5 rounded-md border border-white/10 bg-[#111827]/85 px-3 py-2 text-xs text-white/80">
              載入活動資料中…
            </div>
          )}
          {error && (
            <div className="absolute left-5 top-16 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}
          {mapInitError && (
            <div className="absolute left-5 top-28 max-w-[min(560px,calc(100%-2.5rem))] rounded-md border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {mapInitError}
            </div>
          )}
        </div>

        <aside className="h-full min-h-0 overflow-y-auto overscroll-contain bg-[#0f0f1a] p-6">
          {!selectedItem ? (
            <>
              <header className="mb-5">
                <h1 className="text-4xl font-bold text-white">台北展演地圖</h1>
                <p className="mt-2 text-sm text-white/60">
                  探索你附近的 {exhibitions.length} 個展覽活動
                </p>
              </header>

              <div className="mb-5 flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveFilter("all")}
                  className={`px-4 py-1.5 text-xs font-semibold ${activeFilter === "all" ? "bg-[#00d6ff] text-[#042028]" : "bg-white/10 text-white/70 hover:bg-white/15"} ${isV1 ? "rounded-md" : "rounded-full"}`}
                >
                  全部展覽
                </button>
                <button
                  onClick={() => setActiveFilter("nearby")}
                  className={`px-4 py-1.5 text-xs font-semibold ${activeFilter === "nearby" ? "bg-[#00d6ff] text-[#042028]" : "bg-white/10 text-white/70 hover:bg-white/15"} ${isV1 ? "rounded-md" : "rounded-full"}`}
                >
                  就近推薦
                </button>
                <button
                  onClick={() => setActiveFilter("free")}
                  className={`px-4 py-1.5 text-xs font-semibold ${activeFilter === "free" ? "bg-[#00d6ff] text-[#042028]" : "bg-white/10 text-white/70 hover:bg-white/15"} ${isV1 ? "rounded-md" : "rounded-full"}`}
                >
                  免費參展
                </button>
                <button
                  onClick={() => setActiveFilter("ending")}
                  className={`px-4 py-1.5 text-xs font-semibold ${activeFilter === "ending" ? "bg-[#00d6ff] text-[#042028]" : "bg-white/10 text-white/70 hover:bg-white/15"} ${isV1 ? "rounded-md" : "rounded-full"}`}
                >
                  即將結束
                </button>
              </div>

              <div className="space-y-3">
                {sidebarItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => focusEventOnMap(item.id)}
                    className={`w-full border p-3 text-left transition-colors ${
                      selectedEventId === item.id
                        ? "border-cyan-300/60 bg-[#1c1f35]"
                        : "border-white/5 bg-[#171725] hover:bg-[#1b1b2b]"
                    } ${isV1 ? "rounded-md" : "rounded-2xl"}`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        focusEventOnMap(item.id);
                      }
                    }}
                  >
                    <div className="flex gap-3">
                      <img src={item.imageUrl} alt={item.title} className={`h-20 w-24 object-cover ${isV1 ? "rounded-md" : "rounded-xl"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <p className="line-clamp-2 text-sm font-bold text-white">{item.title}</p>
                          <button
                            type="button"
                            onClick={(e) => void handleToggleFavorite(e, item)}
                            title={user ? (favoriteIds.has(item.id) ? "取消收藏" : "加入收藏") : "請先登入以使用收藏"}
                            className="p-1"
                          >
                            <Heart className={`h-4 w-4 transition-all ${favoriteIds.has(item.id) ? "fill-purple-500 text-purple-500" : "text-white/50 hover:text-white/80"}`} />
                          </button>
                        </div>
                        <p className="mb-1 flex items-center gap-1 text-[11px] text-white/60">
                          <MapPin className="h-3 w-3" /> {item.location}
                        </p>
                        <p className="flex items-center gap-1 text-[11px] text-white/50">
                          <Clock3 className="h-3 w-3" /> {item.dateStr.replace(" -> ", " — ")}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setVisibleCount((v) => Math.min(v + 5, totalFilteredCount))}
                disabled={!hasMore}
                className={`mt-5 flex w-full items-center justify-center gap-2 bg-[#df8eff] py-3 font-semibold text-[#2f0f42] hover:bg-[#d680f6] disabled:cursor-not-allowed disabled:opacity-60 ${isV1 ? "rounded-md" : "rounded-full"}`}
              >
                <Navigation className="h-4 w-4" /> 探索更多展覽
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="relative">
                <img
                  src={selectedItem.imageUrl}
                  alt={selectedItem.title}
                  className="h-48 w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.delete("eventId");
                    setSearchParams(next, { replace: true });
                    setSelectedEventId(null);
                  }}
                  className={`absolute left-3 top-3 inline-flex items-center gap-1.5 border border-white/20 bg-black/45 px-3 py-1.5 text-xs text-white/90 hover:bg-black/60 ${isV1 ? "rounded-md" : "rounded-full"}`}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-2xl font-bold leading-tight text-white">{selectedItem.title}</h2>
                  <button
                    type="button"
                    onClick={(e) => void handleToggleFavorite(e, selectedItem)}
                    title={user ? (favoriteIds.has(selectedItem.id) ? "取消收藏" : "加入收藏") : "請先登入以使用收藏"}
                    className="shrink-0 p-1.5"
                  >
                    <Heart className={`h-5 w-5 transition-all ${favoriteIds.has(selectedItem.id) ? "fill-purple-500 text-purple-500" : "text-white/55 hover:text-white/85"}`} />
                  </button>
                </div>
                <p className="text-sm leading-relaxed text-white/72">{selectedSummary}</p>
              </div>

              <div className="space-y-2 border-y border-white/10 py-4">
                <p className="flex items-center gap-2 text-sm text-white/80">
                  <MapPin className="h-4 w-4 text-cyan-200" /> {selectedItem.location}
                </p>
                <p className="flex items-center gap-2 text-sm text-white/75">
                  <Clock3 className="h-4 w-4 text-cyan-200" /> {selectedItem.dateStr.replace(" -> ", " — ")}
                </p>
                <p className="text-sm text-white/85">
                  <span className="mr-2 text-white/50">票價</span>
                  <span className="font-semibold text-[#df8eff]">{selectedTicketPrice}</span>
                </p>
              </div>

              <a
                href={buildGoogleMapsUrl(selectedItem)}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center justify-center gap-2 border border-cyan-300/30 bg-cyan-400/15 px-4 py-2.5 font-semibold text-cyan-100 hover:bg-cyan-400/20 ${isV1 ? "rounded-md" : "rounded-full"}`}
              >
                <MapPin className="h-4 w-4" /> 在 Google Maps 開啟位置
              </a>

              <a
                href={buildEventPageUrl(selectedItem)}
                className={`inline-flex items-center justify-center gap-2 bg-[#df8eff] px-4 py-2.5 font-semibold text-[#2f0f42] hover:bg-[#d680f6] ${isV1 ? "rounded-md" : "rounded-full"}`}
              >
                <ExternalLink className="h-4 w-4" /> 查看完整活動頁
              </a>
            </div>
          )}
        </aside>
      </div>
      <SignInPrompt
        open={showSignInPrompt}
        from={location.pathname + location.search}
        title="收藏活動前請先登入"
        description="登入後就能把展覽加入你的收藏清單，隨時回來查看。"
        onClose={() => setShowSignInPrompt(false)}
      />
      <ActionToast open={showToast} message={toastMessage} />
    </section>
  );
}
