import { useEffect, useMemo, useRef, useState } from "react";
import type { Exhibition } from "@/data/mock";
import { getHomeRecommendations } from "@/lib/api";

declare global {
  interface Window {
    google?: typeof google;
  }
}

const FALLBACK_CENTER = { lat: 25.0478, lng: 121.5319 };

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#111827" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#111827" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#374151" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111827" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0c4a6e" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#7dd3fc" }] },
];

type LatLng = { lat: number; lng: number };

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
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAP_ID;

  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);

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
        coord: getApproxCoordinate(item),
      })),
    [exhibitions],
  );

  useEffect(() => {
    if (!mapRef.current || !apiKey || markerData.length === 0) return;

    let detached = false;
    let markers: google.maps.Marker[] = [];

    loadGoogleMaps(apiKey)
      .then(() => {
        if (detached || !mapRef.current) return;

        const map = new google.maps.Map(mapRef.current, {
          center: markerData[0]?.coord ?? FALLBACK_CENTER,
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          ...(mapId ? { mapId } : { styles: DARK_MAP_STYLES }),
        });

        const infoWindow = new google.maps.InfoWindow();
        const bounds = new google.maps.LatLngBounds();

        markers = markerData.map(({ item, coord }) => {
          const marker = new google.maps.Marker({
            position: coord,
            map,
            title: item.title,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#22d3ee",
              fillOpacity: 0.95,
              strokeColor: "#0e7490",
              strokeWeight: 2,
            },
          });

          marker.addListener("click", () => {
            infoWindow.setContent(
              `<div style="max-width:220px;">
                <strong>${item.title}</strong><br/>
                <span>${item.location}</span><br/>
                <span>${item.dateStr}</span>
              </div>`,
            );
            infoWindow.open({ anchor: marker, map });
          });

          bounds.extend(coord);
          return marker;
        });

        if (markerData.length > 1) map.fitBounds(bounds);
      })
      .catch((e) => {
        console.error(e);
        setError("Google Maps failed to initialize");
      });

    return () => {
      detached = true;
      markers.forEach((m) => m.setMap(null));
    };
  }, [apiKey, mapId, markerData]);

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
        <p className="mt-2 text-sm text-white/60">Dark mode Google Map with exhibition markers.</p>
      </header>

      {loading && <p className="text-white/60">載入活動資料中…</p>}
      {error && <p className="text-rose-300">{error}</p>}

      <div className="h-[620px] w-full overflow-hidden rounded-3xl border border-white/10 bg-[#0b1220] shadow-xl">
        <div ref={mapRef} className="h-full w-full" />
      </div>
    </section>
  );
}
