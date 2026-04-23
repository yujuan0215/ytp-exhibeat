import { useEffect, useMemo, useRef, useState } from "react";
import type { Exhibition } from "@/data/mock";
import { getHomeRecommendations } from "@/lib/api";
import { useTheme } from "@/lib/theme";

declare global {
  interface Window {
    google?: any;
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
  const { theme } = useTheme();
  const isV1 = theme === "v1";
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAP_ID;
  const styleMode = (import.meta.env.VITE_GOOGLE_MAP_STYLE_MODE ?? "local").trim().toLowerCase();
  const useCloudStyle = styleMode === "cloud" && !!mapId;

  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);

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
        coord:
          typeof item._meta?.latitude === "number" && typeof item._meta?.longitude === "number"
            ? { lat: item._meta.latitude, lng: item._meta.longitude }
            : null,
        geocodeQuery: `${item.location.replace("•", " ")} ${item.title} 台灣`,
      })),
    [exhibitions],
  );

  useEffect(() => {
    if (!mapRef.current || !apiKey || markerData.length === 0) return;

    let detached = false;
    let markers: any[] = [];

    loadGoogleMaps(apiKey)
      .then(async () => {
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
          ...(useCloudStyle
            ? { mapId }
            : {
                mapTypeId: "roadmap",
                styles: DARK_MAP_STYLES,
                backgroundColor: "#0b1220",
              }),
        });

        const infoWindow = new maps.InfoWindow();
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

          marker.addListener("click", () => {
            infoWindow.setContent(
              `<div style="max-width:240px;background:#111827;color:#e5e7eb;padding:10px 12px;border-radius:10px;line-height:1.45;">
                <strong style="display:block;color:#f5f3ff;margin-bottom:4px;">${safeTitle}</strong>
                <span style="display:block;color:#c4b5fd;">${safeLocation}</span>
                <span style="display:block;color:#cbd5e1;margin-top:2px;">${safeDate}</span>
                <a href="${eventUrl}" style="display:inline-block;margin-top:10px;color:#e9d5ff;text-decoration:none;border:1px solid #7c3aed;background:#581c87;padding:5px 9px;border-radius:999px;font-size:12px;">
                  造訪活動頁面
                </a>
              </div>`,
            );
            infoWindow.open({ anchor: marker, map });
          });

          bounds.extend(coord);
          return marker;
        });

        if (resolvedData.length > 1) map.fitBounds(bounds);
      })
      .catch((e) => {
        console.error(e);
        setError("Google Maps failed to initialize");
      });

    return () => {
      detached = true;
      markers.forEach((m) => m.setMap(null));
    };
  }, [apiKey, mapId, markerData, useCloudStyle]);

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
    <section className="px-8 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">地圖探索</h1>
        <p className="mt-2 text-sm text-white/60">{isV1 ? "沉浸式夜色地圖探索展演空間。" : "Dark mode Google Map with exhibition markers."}</p>
      </header>

      {loading && <p className="text-white/60">載入活動資料中…</p>}
      {error && <p className="text-rose-300">{error}</p>}

      <div className={`h-[620px] w-full overflow-hidden ${isV1 ? "rounded-md" : "rounded-3xl"} border border-white/10 bg-[#0b1220] shadow-xl`}>
        <div ref={mapRef} className="h-full w-full" />
      </div>
    </section>
  );
}
