import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Exhibition } from "@/data/mock";
import { getHomeRecommendations, listLegalStays, listTagStats, type TagStat } from "@/lib/api";
import { isFavorited, toggleFavorite } from "@/lib/favorites";
import { useAuth } from "@/lib/auth";
import { getLocaleCopy, useLanguage } from "@/lib/language";
import { useTheme } from "@/lib/theme";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SignInPrompt } from "@/components/SignInPrompt";
import { ActionToast } from "@/components/ActionToast";
import { MapPin, Clock3, Navigation, ArrowLeft, ExternalLink, Search, Settings2, X } from "lucide-react";
import type { LegalStay } from "@/lib/api";
import { AddToTripListMenu } from "@/components/collection/AddToTripListMenu";
import { AnimatedHeart } from "@/components/ui/AnimatedHeart";

declare global {
  interface Window {
    google?: any;
    gm_authFailure?: () => void;
  }
}

const FALLBACK_CENTER = { lat: 25.0478, lng: 121.5319 };
const TAIPEI_CITY_BOUNDS = {
  north: 25.2202,
  south: 24.9605,
  east: 121.6751,
  west: 121.4297,
};
const MIN_STAY_ZOOM = 12;
const MIN_EVENT_ZOOM = 10;
const STAY_PAGE_SIZE = 250;
const MAX_VISIBLE_STAY_MARKERS = 80;
const MAX_VISIBLE_EVENT_MARKERS = 220;

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
type MapSelection = { kind: "event" | "stay"; id: string } | null;

const MAP_COPY = {
  "zh-TW": {
    toast: {
      addedToFavorites: "已加入收藏",
      removedFromFavorites: "已取消收藏",
    },
    errors: {
      loadExhibitions: "載入展覽資料失敗",
      mapsAuthFailure: "Google Maps 驗證失敗（gm_authFailure）。請檢查 API 金鑰來源限制與計費設定。",
      mapsInitFailed: "Google Maps 初始化失敗",
      mapsInitUnknown: "未知的 Google Maps 初始化錯誤",
      staysUnavailable: "住宿資料暫時無法取得",
    },
    defaults: {
      ticketPrice: "NT$450",
      selectedSummary:
        "這檔展演結合空間敘事與視覺節奏，適合先在地圖上掌握位置與檔期後，再安排現場參觀。",
      legalStayClass: "合法旅宿",
      phonePending: "電話待補",
      stayDescription: "點選地圖上的旅宿，可快速查看住宿資訊與位置。",
      imageSourceFallback: "資料來源網站",
      starRatingMissing: "未提供",
      contactPending: "待補",
      freePrice: "FREE",
    },
    mapPopup: {
      visitEventPage: "造訪活動頁面",
      openInGoogleMaps: "在 Google Maps 開啟",
    },
    page: {
      missingApiKey: "缺少 `VITE_GOOGLE_MAPS_API_KEY`。請在 `frontend/.env.local` 設定後啟用地圖。",
      loadingData: "載入活動資料中…",
      searchPlaceholder: "搜尋展覽名稱或地點（#標籤）",
      clearSearch: "清除搜尋",
      hideStays: "隱藏住宿",
      showStays: "顯示住宿",
      noMatchingTags: "無符合標籤",
      noSearchResults: "找不到符合關鍵字的展覽",
      exploreMore: "探索更多展覽",
      backToChat: "返回聊天",
      backToList: "返回列表",
      legalStayHeading: "合法旅宿",
      stayDetail: "查看旅宿詳情",
      ratingLabel: "星級評等：",
      starUnit: " 星",
      stayTypeLabel: "旅宿類型",
      contactPhoneLabel: "聯絡電話",
      imageSourceLabel: "圖片來源：",
      openLocationInGoogleMaps: "在 Google Maps 開啟位置",
      eventHeading: "展演活動",
      eventDetail: "查看活動詳情",
      ticketPriceLabel: "票價",
      favoriteAdd: "加入收藏",
      favoriteRemove: "取消收藏",
      favoriteNeedSignIn: "請先登入以使用收藏",
      favoriteButtonAria: "切換收藏狀態",
      signInPromptTitle: "收藏活動前請先登入",
      signInPromptDescription: "登入後就能把展覽加入你的收藏清單，隨時回來查看。",
    },
  },
  en: {
    toast: {
      addedToFavorites: "Added to favorites",
      removedFromFavorites: "Removed from favorites",
    },
    errors: {
      loadExhibitions: "Failed to load exhibitions",
      mapsAuthFailure:
        "Google Maps authentication failed (gm_authFailure). Check API key referrer restrictions and billing.",
      mapsInitFailed: "Google Maps failed to initialize",
      mapsInitUnknown: "Unknown Google Maps initialization error",
      staysUnavailable: "Accommodations are temporarily unavailable",
    },
    defaults: {
      ticketPrice: "NT$450",
      selectedSummary:
        "This exhibition blends spatial storytelling with visual rhythm. Check the map and schedule first, then plan your visit.",
      legalStayClass: "Licensed stay",
      phonePending: "Phone unavailable",
      stayDescription: "Select a stay marker on the map to quickly view lodging details and location.",
      imageSourceFallback: "Source website",
      starRatingMissing: "Not provided",
      contactPending: "Unavailable",
      freePrice: "FREE",
    },
    mapPopup: {
      visitEventPage: "Visit event page",
      openInGoogleMaps: "Open in Google Maps",
    },
    page: {
      missingApiKey: "Missing `VITE_GOOGLE_MAPS_API_KEY`. Add it in `frontend/.env.local` to enable the map.",
      loadingData: "Loading exhibition data…",
      searchPlaceholder: "Search exhibitions or locations (#tags)",
      clearSearch: "Clear search",
      hideStays: "Hide stays",
      showStays: "Show stays",
      noMatchingTags: "No matching tags",
      noSearchResults: "No exhibitions match your search",
      exploreMore: "Explore more exhibitions",
      backToChat: "Back to chat",
      backToList: "Back to list",
      legalStayHeading: "Licensed stay",
      stayDetail: "View stay details",
      ratingLabel: "Star rating: ",
      starUnit: " star",
      stayTypeLabel: "Stay type",
      contactPhoneLabel: "Contact phone",
      imageSourceLabel: "Image source: ",
      openLocationInGoogleMaps: "Open location in Google Maps",
      eventHeading: "Exhibition event",
      eventDetail: "View event details",
      ticketPriceLabel: "Ticket price",
      favoriteAdd: "Add to favorites",
      favoriteRemove: "Remove from favorites",
      favoriteNeedSignIn: "Sign in to use favorites",
      favoriteButtonAria: "Toggle favorite",
      signInPromptTitle: "Sign in before saving favorites",
      signInPromptDescription: "After signing in, you can save exhibitions to your favorites and revisit them anytime.",
    },
  },
} as const;

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

function isTaipeiCoord(coord: LatLng): boolean {
  return (
    coord.lat <= TAIPEI_CITY_BOUNDS.north &&
    coord.lat >= TAIPEI_CITY_BOUNDS.south &&
    coord.lng <= TAIPEI_CITY_BOUNDS.east &&
    coord.lng >= TAIPEI_CITY_BOUNDS.west
  );
}

function isTaipeiExhibition(item: Exhibition): boolean {
  const locationText = `${item.location} ${item.title}`.toLowerCase().replaceAll("台", "臺");
  const rawCity = item.location.split("•")[1]?.trim().replaceAll("台", "臺").toLowerCase();
  if (rawCity) {
    // Some records contain district suffixes or extra notes, e.g. "臺北市中正區".
    if (rawCity.includes("臺北市") || rawCity.includes("taipei city") || rawCity.includes("taipei")) {
      return true;
    }
    return false;
  }
  if (locationText.includes("臺北市") || locationText.includes("taipei city") || locationText.includes("taipei")) {
    return true;
  }
  const coord = getItemCoords(item);
  if (coord) return isTaipeiCoord(coord);
  // Last-resort approximation for records with incomplete city fields.
  return isTaipeiCoord(getApproxCoordinate(item));
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

function buildStayGoogleMapsUrl(stay: LegalStay): string {
  const address = stay.address.full?.trim();
  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${stay.location.lat},${stay.location.lng}`;
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

function buildMarkerIcon(maps: any, kind: "event" | "stay", selected = false) {
  const isStay = kind === "stay";
  const fillColor = isStay ? "#00d6ff" : "#a855f7";
  const strokeColor = isStay ? "#bff6ff" : "#e9d5ff";
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: selected ? (isStay ? 10 : 11) : isStay ? 8 : 9,
    fillColor,
    fillOpacity: 0.98,
    strokeColor,
    strokeWeight: selected ? 4 : 2,
  };
}

function normalizeHashtag(value: string): string {
  const stripped = String(value ?? "").trim().replace(/^#+/, "").replace(/\s+/g, "");
  if (!stripped) return "";
  return `#${stripped}`;
}

function normalizeSearchText(value: string) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function parseSearchTokens(query: string): { keywordTerms: string[]; tagTerms: string[] } {
  const normalized = normalizeSearchText(query);
  if (!normalized) {
    return { keywordTerms: [], tagTerms: [] };
  }
  const tagTerms = Array.from(normalized.matchAll(/#([^\s#]+)/g))
    .map((match) => match[1]?.trim())
    .filter(Boolean) as string[];
  const keywordTerms = normalized
    .replace(/#[^\s#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  return { keywordTerms, tagTerms };
}

function matchMixedSearch(
  exhibition: Exhibition,
  tokens: { keywordTerms: string[]; tagTerms: string[] },
) {
  const haystack = normalizeSearchText(
    [
      exhibition.title,
      exhibition.location,
      exhibition.aiSummary ?? "",
      exhibition.dateStr,
      ...(exhibition.tags ?? []),
    ].join(" "),
  );
  const normalizedTags = (exhibition.tags ?? []).map((tag) =>
    normalizeSearchText(String(tag).replace(/^#+/, "")),
  );
  const keywordMatched = tokens.keywordTerms.every((term) => haystack.includes(term));
  const tagMatched = tokens.tagTerms.every((term) => normalizedTags.some((tag) => tag.includes(term)));
  return keywordMatched && tagMatched;
}

function getActiveHashtagFragment(input: string): string {
  const trimmedRight = String(input ?? "").replace(/\s+$/, "");
  const match = trimmedRight.match(/(?:^|\s)#([^\s#]*)$/);
  return match?.[1]?.toLowerCase() ?? "";
}

function hasActiveHashtagToken(input: string): boolean {
  const trimmedRight = String(input ?? "").replace(/\s+$/, "");
  return /(?:^|\s)#[^\s#]*$/.test(trimmedRight);
}

function replaceActiveHashtag(input: string, nextTag: string): string {
  const normalizedTag = normalizeHashtag(nextTag);
  const trimmedRight = String(input ?? "").replace(/\s+$/, "");
  if (!normalizedTag) return trimmedRight;
  const match = trimmedRight.match(/(?:^|\s)#[^\s#]*$/);
  if (!match) {
    return `${trimmedRight}${trimmedRight ? " " : ""}${normalizedTag}`.trim();
  }
  const start = match.index ?? 0;
  const prefix = trimmedRight.slice(0, start);
  const joiner = prefix && !/\s$/.test(prefix) ? " " : "";
  return `${prefix}${joiner}${normalizedTag}`.trim();
}

export function Map() {
  const { user } = useAuth();
  const { locale } = useLanguage();
  const copy = useMemo(() => getLocaleCopy(locale, MAP_COPY), [locale]);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme } = useTheme();
  const isV1 = theme === "v1";
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAP_ID;
  const styleMode = (import.meta.env.VITE_GOOGLE_MAP_STYLE_MODE ?? "local").trim().toLowerCase();
  const useCloudStyle = styleMode === "cloud" && !!mapId;

  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [legalStays, setLegalStays] = useState<LegalStay[]>([]);
  const [loadedTaipeiStays, setLoadedTaipeiStays] = useState<LegalStay[]>([]);
  const [mapViewport, setMapViewport] = useState<{
    north: number;
    south: number;
    east: number;
    west: number;
    zoom: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [availableTagStats, setAvailableTagStats] = useState<TagStat[]>([]);
  const [isSearchPanelExpanded, setIsSearchPanelExpanded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showHotels, setShowHotels] = useState(true);
  const [selection, setSelection] = useState<MapSelection>(null);
  const [selectedStay, setSelectedStay] = useState<LegalStay | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [mapInitError, setMapInitError] = useState<string | null>(null);
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const [eventPoints, setEventPoints] = useState<Array<{ item: Exhibition; coord: LatLng }>>([]);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const transientStayMarkerRef = useRef<any>(null);
  const markerLookupRef = useRef<
    Record<string, { marker: any; content: string; selection: MapSelection; stayData?: LegalStay }>
  >({});
  const eventMarkerKeysRef = useRef<string[]>([]);
  const stayMarkerKeysRef = useRef<string[]>([]);
  const visibleEventIdsRef = useRef<Set<string>>(new Set());
  const visibleStayIdsRef = useRef<Set<string>>(new Set());
  const taipeiStayCacheRef = useRef<LegalStay[]>([]);
  const taipeiStayOffsetRef = useRef(0);
  const taipeiStayHasMoreRef = useRef(true);
  const taipeiStayLoadingRef = useRef(false);
  const latestViewportRef = useRef<NonNullable<typeof mapViewport> | null>(null);
  const handledStayQueryIdRef = useRef<string | null>(null);
  const handledExplicitStayFocusRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLFormElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const stayToggleId = useId();
  const prefillState = (location.state as { prefillStay?: LegalStay; prefillEvent?: Exhibition } | null) ?? null;
  const prefillStay = prefillState?.prefillStay ?? null;
  const prefillEvent = prefillState?.prefillEvent ?? null;

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
  }, [prefillEvent]);

  useEffect(() => {
    getHomeRecommendations({ limit: 5000, offset: 0 })
      .then((exhibitionsData) => {
        setExhibitions(() => {
          if (prefillEvent?.id && !exhibitionsData.some((item) => item.id === prefillEvent.id)) {
            return [prefillEvent, ...exhibitionsData];
          }
          return exhibitionsData;
        });
        setError(null);
      })
      .catch((err) => {
        console.error(err);
        setExhibitions([]);
        setError(copy.errors.loadExhibitions);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!prefillEvent?.id) return;
    setExhibitions((prev) => {
      if (prev.some((item) => item.id === prefillEvent.id)) return prev;
      return [prefillEvent, ...prev];
    });
  }, [prefillEvent]);

  const taipeiExhibitions = useMemo(
    () => exhibitions.filter(isTaipeiExhibition),
    [exhibitions],
  );

  const markerData = useMemo(
    () =>
      taipeiExhibitions.map((item) => ({
        item,
        coord: getItemCoords(item),
        geocodeQuery: `${item.location.replace("•", " ")} 台北市 台灣`,
      })),
    [taipeiExhibitions],
  );

  const effectiveSearch = searchQuery.trim();
  const searchTokens = useMemo(() => parseSearchTokens(effectiveSearch), [effectiveSearch]);
  const searchedTaipeiExhibitions = useMemo(
    () =>
      !effectiveSearch
        ? taipeiExhibitions
        : taipeiExhibitions.filter((exhibition) => matchMixedSearch(exhibition, searchTokens)),
    [effectiveSearch, searchTokens, taipeiExhibitions],
  );
  const filteredSidebarItems = useMemo(
    () => searchedTaipeiExhibitions.slice(0, visibleCount),
    [searchedTaipeiExhibitions, visibleCount],
  );
  const totalFilteredCount = searchedTaipeiExhibitions.length;
  const hasMore = filteredSidebarItems.length < totalFilteredCount;
  const selectedEventId = selection?.kind === "event" ? selection.id : null;
  const selectedItem = useMemo(
    () => (selectedEventId ? taipeiExhibitions.find((item) => item.id === selectedEventId) ?? null : null),
    [taipeiExhibitions, selectedEventId],
  );
  const selectedStayIdState = selectedStay?.id ?? null;
  const selectedTicketPrice = selectedItem
    ? selectedItem.price === "FREE" || selectedItem._meta?.isFree
      ? copy.defaults.freePrice
      : String(selectedItem.price ?? copy.defaults.ticketPrice)
    : "";
  const selectedSummary =
    selectedItem?.aiSummary ||
    copy.defaults.selectedSummary;
  const queryEventId = searchParams.get("eventId");
  const queryStayId = searchParams.get("stayId");
  const queryReturnTo = searchParams.get("returnTo");
  const showExpandedPanel = isSearchPanelExpanded || Boolean(selectedItem) || Boolean(selectedStay);

  function isTaipeiStay(stay: LegalStay): boolean {
    const city = stay.address.city.trim().toLowerCase().replace("台", "臺");
    return city === "臺北市" || city === "taipei city" || city === "taipei";
  }

  function isInViewport(stay: LegalStay, viewport: NonNullable<typeof mapViewport>): boolean {
    const lat = stay.location.lat;
    const lng = stay.location.lng;
    const inLat = lat <= viewport.north && lat >= viewport.south;
    const inLng = lng <= viewport.east && lng >= viewport.west;
    return inLat && inLng;
  }

  function pickStableVisibleEvents(
    points: Array<{ item: Exhibition; coord: LatLng }>,
    viewport: NonNullable<typeof mapViewport>,
  ): Array<{ item: Exhibition; coord: LatLng }> {
    const inViewport = points.filter(({ coord }) => {
      const inLat = coord.lat <= viewport.north && coord.lat >= viewport.south;
      const inLng = coord.lng <= viewport.east && coord.lng >= viewport.west;
      return inLat && inLng;
    });
    const idToPoint = new globalThis.Map(inViewport.map((p) => [p.item.id, p]));
    const kept: Array<{ item: Exhibition; coord: LatLng }> = [];
    visibleEventIdsRef.current.forEach((id) => {
      const point = idToPoint.get(id);
      if (point) kept.push(point);
    });
    if (kept.length >= MAX_VISIBLE_EVENT_MARKERS) {
      const next = kept.slice(0, MAX_VISIBLE_EVENT_MARKERS);
      visibleEventIdsRef.current = new Set(next.map((p) => p.item.id));
      return next;
    }
    const centerLat = (viewport.north + viewport.south) / 2;
    const centerLng = (viewport.east + viewport.west) / 2;
    const keptIds = new Set(kept.map((p) => p.item.id));
    const additions = inViewport
      .filter((p) => !keptIds.has(p.item.id))
      .sort((a, b) => {
        const aDist =
          (a.coord.lat - centerLat) * (a.coord.lat - centerLat) +
          (a.coord.lng - centerLng) * (a.coord.lng - centerLng);
        const bDist =
          (b.coord.lat - centerLat) * (b.coord.lat - centerLat) +
          (b.coord.lng - centerLng) * (b.coord.lng - centerLng);
        return aDist - bDist;
      })
      .slice(0, MAX_VISIBLE_EVENT_MARKERS - kept.length);
    const next = [...kept, ...additions];
    visibleEventIdsRef.current = new Set(next.map((p) => p.item.id));
    return next;
  }

  function pickStableVisibleStays(stays: LegalStay[], viewport: NonNullable<typeof mapViewport>): LegalStay[] {
    const inViewport = stays.filter((stay) => isInViewport(stay, viewport));
    const idToStay = new globalThis.Map(inViewport.map((stay) => [stay.id, stay]));
    const kept: LegalStay[] = [];
    visibleStayIdsRef.current.forEach((id) => {
      const stay = idToStay.get(id);
      if (stay) kept.push(stay);
    });
    if (kept.length >= MAX_VISIBLE_STAY_MARKERS) {
      const next = kept.slice(0, MAX_VISIBLE_STAY_MARKERS);
      visibleStayIdsRef.current = new Set(next.map((stay) => stay.id));
      return next;
    }
    const centerLat = (viewport.north + viewport.south) / 2;
    const centerLng = (viewport.east + viewport.west) / 2;
    const keptIds = new Set(kept.map((stay) => stay.id));
    const additions = inViewport
      .filter((stay) => !keptIds.has(stay.id))
      .sort((a, b) => {
        const aDist =
          (a.location.lat - centerLat) * (a.location.lat - centerLat) +
          (a.location.lng - centerLng) * (a.location.lng - centerLng);
        const bDist =
          (b.location.lat - centerLat) * (b.location.lat - centerLat) +
          (b.location.lng - centerLng) * (b.location.lng - centerLng);
        return aDist - bDist;
      })
      .slice(0, MAX_VISIBLE_STAY_MARKERS - kept.length);
    const next = [...kept, ...additions];
    visibleStayIdsRef.current = new Set(next.map((stay) => stay.id));
    return next;
  }

  const activeTagQuery = useMemo(() => getActiveHashtagFragment(searchQuery), [searchQuery]);
  const tagSuggestionActive = useMemo(() => hasActiveHashtagToken(searchQuery), [searchQuery]);
  const mergedTagStats = useMemo(() => {
    const merged = new globalThis.Map<string, number>();
    availableTagStats.forEach((row) => {
      const tag = normalizeHashtag(row.tag);
      if (!tag) return;
      merged.set(tag, Math.max(0, Math.floor(Number(row.count) || 0)));
    });
    return Array.from(merged.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-Hant"));
  }, [availableTagStats]);
  const searchSuggestions = useMemo(() => {
    if (!tagSuggestionActive) return [] as Array<{ tag: string; count: number }>;
    const rows: Array<{ tag: string; count: number }> = [];
    for (const row of mergedTagStats) {
      const cleanTag = row.tag.replace(/^#+/, "").toLowerCase();
      if (activeTagQuery && !cleanTag.startsWith(activeTagQuery)) continue;
      rows.push(row);
    }
    return rows.slice(0, 30);
  }, [activeTagQuery, mergedTagStats, tagSuggestionActive]);

  useEffect(() => {
    listTagStats()
      .then((data) => {
        setAvailableTagStats(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        console.warn("Failed to load search suggestions", error);
        setAvailableTagStats([]);
      });
  }, []);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) {
        setSearchSuggestionsOpen(false);
      }
    };
    if (!searchSuggestionsOpen) return;
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [searchSuggestionsOpen]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    const onDocClick = (event: MouseEvent) => {
      if (!settingsMenuRef.current?.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [isSettingsOpen]);

  useEffect(() => {
    setVisibleCount(5);
  }, [effectiveSearch]);

  useEffect(() => {
    if (selectedItem || selectedStay || effectiveSearch) {
      setIsSearchPanelExpanded(true);
    }
  }, [effectiveSearch, selectedItem, selectedStay]);

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
    setToastMessage(nowFavorited ? copy.toast.addedToFavorites : copy.toast.removedFromFavorites);
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
      setMapInitError(copy.errors.mapsAuthFailure);
      if (typeof prevHandler === "function") {
        prevHandler();
      }
    };
    return () => {
      window.gm_authFailure = prevHandler;
    };
  }, []);

  const focusMarkerOnMap = (lookupKey: string, syncEventQuery = true, recenter = true) => {
    const map = mapInstanceRef.current;
    const infoWindow = infoWindowRef.current;
    const entry = markerLookupRef.current[lookupKey];
    if (!map || !infoWindow || !entry) return;

    // A URL-driven transient stay marker should disappear once users switch focus
    // to another marker from the live map dataset.
    if (transientStayMarkerRef.current) {
      transientStayMarkerRef.current.setMap(null);
      transientStayMarkerRef.current = null;
    }

    const pos = entry.marker.getPosition?.();
    if (recenter && pos) {
      map.panTo(pos);
      map.setZoom(Math.max(map.getZoom?.() ?? 11, 13));
    }
    infoWindow.setContent(entry.content);
    infoWindow.open({ anchor: entry.marker, map });
    setSelection(entry.selection);
    if (entry.selection?.kind === "stay" && entry.stayData) {
      setSelectedStay(entry.stayData);
    } else if (entry.selection?.kind === "event") {
      setSelectedStay(null);
    }
    const next = new URLSearchParams(searchParams);
    const clearStayQuery = () => {
      next.delete("stayId");
      next.delete("stayLat");
      next.delete("stayLng");
      next.delete("stayName");
      next.delete("stayAddress");
      next.delete("returnTo");
    };
    if (entry.selection?.kind === "event" && entry.selection.id) {
      if (syncEventQuery) {
        clearStayQuery();
        next.set("eventId", entry.selection.id);
        setSearchParams(next, { replace: true });
      }
    } else if (next.has("eventId")) {
      next.delete("eventId");
      setSearchParams(next, { replace: true });
    }
  };

  const focusEventFromSidebar = (item: Exhibition) => {
    const lookupKey = `event:${item.id}`;
    if (markerLookupRef.current[lookupKey]) {
      focusMarkerOnMap(lookupKey);
      return;
    }
    const map = mapInstanceRef.current;
    const coord = eventPoints.find((entry) => entry.item.id === item.id)?.coord;
    if (map && coord) {
      map.panTo(coord);
      map.setZoom(Math.max(map.getZoom?.() ?? 11, MIN_EVENT_ZOOM));
    }
    const next = new URLSearchParams(searchParams);
    next.delete("stayId");
    next.delete("stayLat");
    next.delete("stayLng");
    next.delete("stayName");
    next.delete("stayAddress");
    next.delete("returnTo");
    next.set("eventId", item.id);
    setSearchParams(next, { replace: true });
    setSelection({ kind: "event", id: item.id });
    setSelectedStay(null);

    // Make list-click behave like marker-click even when the marker is created
    // asynchronously after viewport reconciliation.
    let attempts = 0;
    const tryFocusAfterRender = () => {
      const markerExists = Boolean(markerLookupRef.current[lookupKey]);
      if (markerExists) {
        focusMarkerOnMap(lookupKey, false, false);
        return;
      }
      attempts += 1;
      if (attempts < 12) {
        window.requestAnimationFrame(tryFocusAfterRender);
      }
    };
    window.requestAnimationFrame(tryFocusAfterRender);
  };

  const applySearchQuery = (value: string) => {
    const next = value.trim();
    setSearchQuery(next);
    setSearchSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
    if (next) {
      // New search should always return to the result list view.
      setSelection(null);
      setSelectedStay(null);
      const params = new URLSearchParams(searchParams);
      params.delete("eventId");
      params.delete("stayId");
      params.delete("stayLat");
      params.delete("stayLng");
      params.delete("stayName");
      params.delete("stayAddress");
      params.delete("returnTo");
      setSearchParams(params, { replace: true });
      setIsSearchPanelExpanded(true);
    }
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedSuggestion =
      activeSuggestionIndex >= 0 ? searchSuggestions[activeSuggestionIndex]?.tag : null;
    const nextQuery = selectedSuggestion ? replaceActiveHashtag(searchQuery, selectedSuggestion) : searchQuery;
    applySearchQuery(nextQuery);
  };

  const handleSuggestionClick = (suggestion: { tag: string; count: number }) => {
    const nextQuery = replaceActiveHashtag(searchQuery, suggestion.tag);
    applySearchQuery(nextQuery);
  };

  useEffect(() => {
    // Even when there are zero exhibitions, initialize the base map so users
    // can still see the map canvas instead of a blank panel.
    // Wait for initial data request to settle first; otherwise the map mounts
    // once with empty data and then re-mounts again after exhibitions arrive,
    // which causes noticeable jumpiness on stay deep-links.
    if (loading) return;
    if (!mapRef.current || !apiKey) return;

    let detached = false;
    let idleListener: any = null;
    let mapClickListener: any = null;

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
        setEventPoints(resolvedData);
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

        const infoWindow = new maps.InfoWindow({ disableAutoPan: true });
        mapInstanceRef.current = map;
        infoWindowRef.current = infoWindow;
        markerLookupRef.current = {};
        const taipeiBounds = new maps.LatLngBounds(
          new maps.LatLng(TAIPEI_CITY_BOUNDS.south, TAIPEI_CITY_BOUNDS.west),
          new maps.LatLng(TAIPEI_CITY_BOUNDS.north, TAIPEI_CITY_BOUNDS.east),
        );
        map.fitBounds(taipeiBounds);
        idleListener = map.addListener("idle", () => {
          const b = map.getBounds?.();
          if (!b) return;
          const ne = b.getNorthEast?.();
          const sw = b.getSouthWest?.();
          if (!ne || !sw) return;
          setMapViewport({
            north: ne.lat(),
            east: ne.lng(),
            south: sw.lat(),
            west: sw.lng(),
            zoom: map.getZoom?.() ?? 0,
          });
        });
        mapClickListener = map.addListener("click", () => {
          if (transientStayMarkerRef.current) {
            transientStayMarkerRef.current.setMap(null);
            transientStayMarkerRef.current = null;
          }
        });
        setMapReadyVersion((prev) => prev + 1);
      })
      .catch((e) => {
        console.error(e);
        setError(copy.errors.mapsInitFailed);
        setMapInitError(copy.errors.mapsInitFailed);
      });

    return () => {
      detached = true;
      if (idleListener) idleListener.remove?.();
      if (mapClickListener) mapClickListener.remove?.();
      if (transientStayMarkerRef.current) {
        transientStayMarkerRef.current.setMap(null);
        transientStayMarkerRef.current = null;
      }
      eventMarkerKeysRef.current = [];
      visibleEventIdsRef.current = new Set();
      visibleStayIdsRef.current = new Set();
      markerLookupRef.current = {};
      mapInstanceRef.current = null;
      infoWindowRef.current = null;
    };
  }, [apiKey, loading, mapId, markerData, useCloudStyle]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const maps = window.google?.maps;
    if (!map || !maps || !eventPoints.length) return;

    const shouldLimit = eventPoints.length > MAX_VISIBLE_EVENT_MARKERS;
    const visiblePoints = !mapViewport
      ? shouldLimit
        ? eventPoints.slice(0, MAX_VISIBLE_EVENT_MARKERS)
        : eventPoints
      : shouldLimit
        ? pickStableVisibleEvents(eventPoints, mapViewport)
        : eventPoints;
    const pinnedEventId = queryEventId ?? (selection?.kind === "event" ? selection.id : null);
    if (pinnedEventId) {
      const pinned = eventPoints.find((point) => point.item.id === pinnedEventId);
      if (pinned && !visiblePoints.some((point) => point.item.id === pinnedEventId)) {
        visiblePoints.unshift(pinned);
        if (visiblePoints.length > MAX_VISIBLE_EVENT_MARKERS) {
          visiblePoints.pop();
        }
      }
    }
    if (!mapViewport || !shouldLimit) {
      visibleEventIdsRef.current = new Set(visiblePoints.map((point) => point.item.id));
    }
    const nextEventKeys = new Set(visiblePoints.map(({ item }) => `event:${item.id}`));

    // Remove only markers that fell out of the visible marker set.
    for (const key of eventMarkerKeysRef.current) {
      if (nextEventKeys.has(key)) continue;
      const entry = markerLookupRef.current[key];
      if (entry?.marker) entry.marker.setMap(null);
      delete markerLookupRef.current[key];
    }

    visiblePoints.forEach(({ item, coord }) => {
      const lookupKey = `event:${item.id}`;
      if (markerLookupRef.current[lookupKey]) {
        return;
      }
      const safeTitle = escapeHtml(item.title);
      const safeLocation = escapeHtml(item.location);
      const safeDate = escapeHtml(item.dateStr);
      const eventUrl = buildEventPageUrl(item);

      const marker = new maps.Marker({
        position: coord,
        map,
        title: item.title,
        icon: buildMarkerIcon(maps, "event", false),
      });

      const popupContent = `<div style="max-width:240px;background:#111827;color:#e5e7eb;padding:10px 12px;border-radius:10px;line-height:1.45;">
            <strong style="display:block;color:#f5f3ff;margin-bottom:4px;">${safeTitle}</strong>
            <span style="display:block;color:#c4b5fd;">${safeLocation}</span>
            <span style="display:block;color:#cbd5e1;margin-top:2px;">${safeDate}</span>
            <a href="${eventUrl}" style="display:inline-block;margin-top:10px;color:#e9d5ff;text-decoration:none;border:1px solid #7c3aed;background:#581c87;padding:5px 9px;border-radius:999px;font-size:12px;">
              ${copy.mapPopup.visitEventPage}
            </a>
          </div>`;

      markerLookupRef.current[lookupKey] = {
        marker,
        content: popupContent,
        selection: { kind: "event", id: item.id },
      };
      marker.addListener("click", () => focusMarkerOnMap(lookupKey));
    });
    eventMarkerKeysRef.current = Array.from(nextEventKeys);
  }, [eventPoints, mapViewport, queryEventId, selection]);

  useEffect(() => {
    // Reset cached stays when locale changes so hotel fields follow language selection.
    taipeiStayCacheRef.current = [];
    taipeiStayOffsetRef.current = 0;
    taipeiStayHasMoreRef.current = true;
    setLoadedTaipeiStays([]);
    setLegalStays([]);
  }, [locale]);

  useEffect(() => {
    if (!showHotels || !mapViewport || mapViewport.zoom < MIN_STAY_ZOOM) {
      latestViewportRef.current = null;
      visibleStayIdsRef.current = new Set();
      setLegalStays([]);
      return;
    }
    latestViewportRef.current = mapViewport;

    const cachedVisible = pickStableVisibleStays(taipeiStayCacheRef.current, mapViewport);
    const nextVisible = [...cachedVisible];
    if (selectedStayIdState) {
      const pinned =
        taipeiStayCacheRef.current.find((stay) => stay.id === selectedStayIdState) ??
        loadedTaipeiStays.find((stay) => stay.id === selectedStayIdState) ??
        null;
      if (pinned && !nextVisible.some((stay) => stay.id === pinned.id)) {
        nextVisible.unshift(pinned);
      }
    }
    setLegalStays(nextVisible.slice(0, MAX_VISIBLE_STAY_MARKERS));

    if (cachedVisible.length >= MAX_VISIBLE_STAY_MARKERS) return;
    if (!taipeiStayHasMoreRef.current || taipeiStayLoadingRef.current) return;

    taipeiStayLoadingRef.current = true;
    const stayLocale = locale === "zh-TW" ? "zh-TW" : "en";
    listLegalStays({
      city: "Taipei City",
      locale: stayLocale,
      lang: stayLocale,
      limit: STAY_PAGE_SIZE,
      offset: taipeiStayOffsetRef.current,
    })
      .then((result) => {
        const normalized = result.stays.filter(isTaipeiStay);
        const seen = new Set(taipeiStayCacheRef.current.map((stay) => stay.id));
        const additions = normalized.filter((stay) => !seen.has(stay.id));
        taipeiStayCacheRef.current = [...taipeiStayCacheRef.current, ...additions];
        setLoadedTaipeiStays(taipeiStayCacheRef.current);
        taipeiStayOffsetRef.current += result.stays.length;
        taipeiStayHasMoreRef.current =
          taipeiStayOffsetRef.current < result.total && result.stays.length > 0;

        const latestViewport = latestViewportRef.current;
        if (!latestViewport || latestViewport.zoom < MIN_STAY_ZOOM) return;
        const visibleAfterLoad = pickStableVisibleStays(taipeiStayCacheRef.current, latestViewport);
        const nextVisibleAfterLoad = [...visibleAfterLoad];
        if (selectedStayIdState) {
          const pinned = taipeiStayCacheRef.current.find((stay) => stay.id === selectedStayIdState) ?? null;
          if (pinned && !nextVisibleAfterLoad.some((stay) => stay.id === pinned.id)) {
            nextVisibleAfterLoad.unshift(pinned);
          }
        }
        setLegalStays(nextVisibleAfterLoad.slice(0, MAX_VISIBLE_STAY_MARKERS));
      })
      .catch((err) => {
        console.error(err);
        setError((prev) => prev ?? copy.errors.staysUnavailable);
      })
      .finally(() => {
        taipeiStayLoadingRef.current = false;
      });
  }, [loadedTaipeiStays, locale, mapViewport, selectedStayIdState, showHotels]);

  useEffect(() => {
    if (showHotels) return;
    setLegalStays([]);
    setSelectedStay(null);
    setSelection((prev) => (prev?.kind === "stay" ? null : prev));
    const next = new URLSearchParams(searchParams);
    next.delete("stayId");
    next.delete("stayLat");
    next.delete("stayLng");
    next.delete("stayName");
    next.delete("stayAddress");
    next.delete("returnTo");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, showHotels]);


  useEffect(() => {
    const map = mapInstanceRef.current;
    const maps = window.google?.maps;
    if (!map || !maps) return;
    const nextStayKeys = new Set(legalStays.map((stay) => `stay:${stay.id}`));

    // Remove only markers that are no longer in the computed visible stays.
    for (const key of stayMarkerKeysRef.current) {
      if (nextStayKeys.has(key)) continue;
      const entry = markerLookupRef.current[key];
      if (entry?.marker) entry.marker.setMap(null);
      delete markerLookupRef.current[key];
    }

    legalStays.forEach((stay) => {
      const coord = { lat: stay.location.lat, lng: stay.location.lng };
      const lookupKey = `stay:${stay.id}`;
      if (markerLookupRef.current[lookupKey]) {
        return;
      }
      const safeName = escapeHtml(stay.name);
      const safeAddress = escapeHtml(stay.address.full);
      const safeClass = escapeHtml(stay.classLabels.join(" / ") || copy.defaults.legalStayClass);
      const safePhone = escapeHtml(stay.phones[0] || copy.defaults.phonePending);
      const mapUrl =
        stay.urls.map[0] || buildStayGoogleMapsUrl(stay);

      const marker = new maps.Marker({
        position: coord,
        map,
        title: stay.name,
        icon: buildMarkerIcon(maps, "stay", false),
      });

      const popupContent = `<div style="max-width:260px;background:#111827;color:#e5e7eb;padding:10px 12px;border-radius:10px;line-height:1.45;">
            <strong style="display:block;color:#d8f8ff;margin-bottom:4px;">${safeName}</strong>
            <span style="display:block;color:#9be7f8;">${safeClass}</span>
            <span style="display:block;color:#cbd5e1;margin-top:2px;">${safeAddress}</span>
            <span style="display:block;color:#94a3b8;margin-top:2px;">${safePhone}</span>
            <a href="${mapUrl}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:10px;color:#cffafe;text-decoration:none;border:1px solid #0891b2;background:#155e75;padding:5px 9px;border-radius:999px;font-size:12px;">
              ${copy.mapPopup.openInGoogleMaps}
            </a>
          </div>`;

      markerLookupRef.current[lookupKey] = {
        marker,
        content: popupContent,
        selection: { kind: "stay", id: stay.id },
        stayData: stay,
      };
      marker.addListener("click", () => focusMarkerOnMap(lookupKey));
    });
    stayMarkerKeysRef.current = Array.from(nextStayKeys);

    // Unlike event markers (created once), stay markers are viewport-driven and
    // get recreated on pan/zoom. Re-anchor the popup to the new marker instance
    // so it doesn't disappear right after first click.
    if (selection?.kind === "stay") {
      const selectedKey = `stay:${selection.id}`;
      const selectedEntry = markerLookupRef.current[selectedKey];
      const infoWindow = infoWindowRef.current;
      if (selectedEntry && infoWindow) {
        infoWindow.setOptions?.({ disableAutoPan: true });
        infoWindow.setContent(selectedEntry.content);
        infoWindow.open({ anchor: selectedEntry.marker, map });
      }
    }
  }, [legalStays]);

  useEffect(() => {
    const maps = window.google?.maps;
    if (!maps) return;

    Object.entries(markerLookupRef.current).forEach(([lookupKey, entry]) => {
      const markerKind: "event" | "stay" = lookupKey.startsWith("stay:") ? "stay" : "event";
      const isSelected =
        selection?.kind === markerKind &&
        lookupKey === `${markerKind === "stay" ? "stay" : "event"}:${selection.id}`;
      entry.marker.setIcon(buildMarkerIcon(maps, markerKind, isSelected));
      entry.marker.setZIndex(isSelected ? 1000 : undefined);
    });
  }, [selection, mapReadyVersion, legalStays]);

  useEffect(() => {
    if (!queryEventId) {
      setSelection((prev) => (prev?.kind === "event" ? null : prev));
      return;
    }
    const exists = taipeiExhibitions.some((item) => item.id === queryEventId);
    if (!exists) return;
    if (markerLookupRef.current[`event:${queryEventId}`]) {
      focusMarkerOnMap(`event:${queryEventId}`, false, false);
      return;
    }
    const map = mapInstanceRef.current;
    const coord = eventPoints.find((entry) => entry.item.id === queryEventId)?.coord;
    if (map && coord) {
      map.panTo(coord);
      map.setZoom(Math.max(map.getZoom?.() ?? 11, MIN_EVENT_ZOOM));
    }
    setSelection({ kind: "event", id: queryEventId });
  }, [eventPoints, queryEventId, taipeiExhibitions, mapReadyVersion]);

  useEffect(() => {
    if (!prefillStay) return;
    setSelectedStay(prefillStay);
    setSelection({ kind: "stay", id: prefillStay.id });
  }, [prefillStay]);

  useEffect(() => {
    if (!queryStayId) {
      handledStayQueryIdRef.current = null;
      return;
    }
    if (handledStayQueryIdRef.current === queryStayId) return;
    if (markerLookupRef.current[`stay:${queryStayId}`]) {
      focusMarkerOnMap(`stay:${queryStayId}`, false);
      handledStayQueryIdRef.current = queryStayId;
    }
  }, [queryStayId, mapReadyVersion, legalStays]);

  useEffect(() => {
    handledExplicitStayFocusRef.current = null;
  }, [queryStayId]);

  if (!apiKey) {
    return (
      <section className="px-8 py-10">
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-amber-200">
          {copy.page.missingApiKey}
        </div>
      </section>
    );
  }

  return (
    <section className="h-full w-full overflow-hidden">
      <div className="relative h-full w-full overflow-hidden bg-[#0b1220]">
        <div ref={mapRef} className="absolute inset-0 h-full w-full" />
        {loading && (
          <div className="absolute left-5 top-5 rounded-md border border-white/10 bg-[#111827]/85 px-3 py-2 text-xs text-white/80">
            {copy.page.loadingData}
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

        {/* Single search bar: same screen position whether the left panel is open or not */}
        <form
          onSubmit={handleSearchSubmit}
          ref={searchRef}
          className="pointer-events-auto absolute left-0 top-0 z-30 w-[380px] max-w-[92vw] px-4 pt-4"
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/45" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                const value = event.target.value;
                setSearchQuery(value);
                setActiveSuggestionIndex(-1);
                setSearchSuggestionsOpen(hasActiveHashtagToken(value));
                if (value.trim()) setIsSearchPanelExpanded(true);
              }}
              onFocus={() => {
                setSearchSuggestionsOpen(hasActiveHashtagToken(searchQuery));
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearchSuggestionsOpen(false);
                  setActiveSuggestionIndex(-1);
                  return;
                }
                if (!searchSuggestionsOpen || searchSuggestions.length === 0) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveSuggestionIndex((prev) => (prev + 1) % searchSuggestions.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveSuggestionIndex((prev) =>
                    prev <= 0 ? searchSuggestions.length - 1 : prev - 1,
                  );
                }
              }}
              placeholder={copy.page.searchPlaceholder}
              className="h-12 w-full rounded-full border border-white/10 bg-[#1f1f26]/95 pl-11 pr-12 text-base text-white shadow-xl focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {searchQuery ? (
              <button
                type="button"
                aria-label={copy.page.clearSearch}
                onClick={() => {
                  setSearchQuery("");
                  setSearchSuggestionsOpen(false);
                  setActiveSuggestionIndex(-1);
                }}
                className="absolute right-3 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[#60a5fa] transition hover:bg-white/10 hover:text-[#93c5fd]"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {searchSuggestionsOpen && (
            <div className="absolute left-0 right-0 mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-[#1a1625] shadow-xl">
              {searchSuggestions.length > 0 ? (
                searchSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.tag}-${index}`}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    onMouseEnter={() => setActiveSuggestionIndex(index)}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors ${
                      index === activeSuggestionIndex
                        ? "bg-white/10 text-white"
                        : "text-white/80 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span>{suggestion.tag}</span>
                    <span className="text-xs text-white/50">{suggestion.count}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2.5 text-sm text-white/45">{copy.page.noMatchingTags}</div>
              )}
            </div>
          )}
        </form>
        <div ref={settingsMenuRef} className="pointer-events-auto absolute right-4 top-4 z-30">
          <button
            type="button"
            onClick={() => setIsSettingsOpen((prev) => !prev)}
            aria-label="Map settings"
            aria-expanded={isSettingsOpen}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white text-slate-800 shadow-xl transition hover:bg-white/95"
          >
            <Settings2 className="h-5 w-5" />
          </button>
          {isSettingsOpen ? (
            <div className="absolute right-0 mt-2 w-60 rounded-xl border border-white/10 bg-[#1a1625] p-3 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-white/90">隱藏/顯示住宿</span>
                <div className="flex items-center gap-2">
                  <input
                    id={stayToggleId}
                    type="checkbox"
                    className="stay-toggle-input"
                    checked={showHotels}
                    onChange={(event) => setShowHotels(event.target.checked)}
                  />
                  <label
                    htmlFor={stayToggleId}
                    className="stay-toggleSwitch"
                    title={showHotels ? "隱藏住宿" : "顯示住宿"}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {showExpandedPanel ? (
        <aside
          className="absolute bottom-0 left-0 top-0 z-10 flex w-[380px] max-w-[92vw] flex-col overflow-hidden border border-white/10 bg-[#0f0f1a] px-6 pb-6 pt-[4.75rem] shadow-2xl"
        >
          {!selectedItem && !selectedStay ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-3 pr-1">
                {filteredSidebarItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => focusEventFromSidebar(item)}
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
                        focusEventFromSidebar(item);
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
                            title={
                              user
                                ? favoriteIds.has(item.id)
                                  ? copy.page.favoriteRemove
                                  : copy.page.favoriteAdd
                                : copy.page.favoriteNeedSignIn
                            }
                            aria-label={copy.page.favoriteButtonAria}
                            className="p-1"
                          >
                            <AnimatedHeart
                              checked={favoriteIds.has(item.id)}
                              size={16}
                              className="text-white"
                              title={
                                user
                                  ? favoriteIds.has(item.id)
                                    ? copy.page.favoriteRemove
                                    : copy.page.favoriteAdd
                                  : copy.page.favoriteNeedSignIn
                              }
                            />
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
                {filteredSidebarItems.length === 0 ? (
                  <div className={`border border-white/10 bg-[#171725] p-4 text-center text-sm text-white/55 ${isV1 ? "rounded-md" : "rounded-xl"}`}>
                    {copy.page.noSearchResults}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setVisibleCount((v) => Math.min(v + 5, totalFilteredCount))}
                disabled={!hasMore}
                className={`mt-5 flex w-full items-center justify-center gap-2 bg-[#df8eff] py-3 font-semibold text-[#2f0f42] hover:bg-[#d680f6] disabled:cursor-not-allowed disabled:opacity-60 ${isV1 ? "rounded-md" : "rounded-full"}`}
              >
                <Navigation className="h-4 w-4" /> {copy.page.exploreMore}
              </button>
            </>
          ) : selectedStay ? (
            <div className="min-h-0 flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain pr-1">
              {queryReturnTo ? (
                <button
                  type="button"
                  onClick={() => navigate(queryReturnTo)}
                  className={`inline-flex w-fit items-center gap-1.5 border border-cyan-300/35 bg-cyan-400/15 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/25 ${isV1 ? "rounded-md" : "rounded-full"}`}
                >
                  {copy.page.backToChat}
                </button>
              ) : null}
              <div className="relative border border-white/10 bg-[#111827]">
                {selectedStay.primaryImageUrl ? (
                  <img
                    src={selectedStay.primaryImageUrl}
                    alt={selectedStay.name}
                    className="h-48 w-full object-cover"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.delete("eventId");
                    setSearchParams(next, { replace: true });
                    setSelectedStay(null);
                    setSelection(null);
                  }}
                  className={`absolute left-3 top-3 inline-flex items-center gap-1.5 border border-white/20 bg-black/45 px-3 py-1.5 text-xs text-white/90 hover:bg-black/60 ${isV1 ? "rounded-md" : "rounded-full"}`}
                  aria-label={copy.page.backToList}
                  title={copy.page.backToList}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <div className="absolute right-3 top-3 z-10" onClick={(e) => e.stopPropagation()}>
                  <AddToTripListMenu kind="stay" stay={selectedStay} align="end" />
                </div>
                <div className="p-5 pt-8">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-300/90">{copy.page.legalStayHeading}</p>
                  <h2 className="text-2xl font-bold leading-tight text-white">{selectedStay.name}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/72">{selectedStay.description || copy.defaults.stayDescription}</p>
                  {selectedStay.urls.website ? (
                    <a
                      href={selectedStay.urls.website}
                      target="_blank"
                      rel="noreferrer"
                      className={`mt-4 inline-flex items-center gap-2 bg-[#00d6ff] px-4 py-2 text-sm font-semibold text-[#042028] hover:bg-[#20deff] ${isV1 ? "rounded-md" : "rounded-full"}`}
                    >
                      <ExternalLink className="h-4 w-4" /> {copy.page.stayDetail}
                    </a>
                  ) : null}
                  {selectedStay.primaryImageUrl ? (
                    <p className="mt-2 text-[11px] text-white/45">
                      {`${copy.page.imageSourceLabel}${selectedStay.imageSourcePolicy?.attribution || copy.defaults.imageSourceFallback}`}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2 border-y border-white/10 py-4">
                <p className="flex items-center gap-2 text-sm text-white/80">
                  <MapPin className="h-4 w-4 text-cyan-200" /> {selectedStay.address.full}
                </p>
                <p className="flex items-center gap-2 text-sm text-white/75">
                  <Clock3 className="h-4 w-4 text-cyan-200" /> {copy.page.ratingLabel}
                  {selectedStay.starRating ? `${selectedStay.starRating}${copy.page.starUnit}` : copy.defaults.starRatingMissing}
                </p>
                <p className="text-sm text-white/85">
                  <span className="mr-2 text-white/50">{copy.page.stayTypeLabel}</span>
                  <span className="font-semibold text-[#00d6ff]">{selectedStay.classLabels.join(" / ") || copy.defaults.legalStayClass}</span>
                </p>
                <p className="text-sm text-white/85">
                  <span className="mr-2 text-white/50">{copy.page.contactPhoneLabel}</span>
                  <span>{selectedStay.phones.join("、") || copy.defaults.contactPending}</span>
                </p>
              </div>

              <a
                href={selectedStay.urls.map[0] || buildStayGoogleMapsUrl(selectedStay)}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center justify-center gap-2 border border-cyan-300/30 bg-cyan-400/15 px-4 py-2.5 font-semibold text-cyan-100 hover:bg-cyan-400/20 ${isV1 ? "rounded-md" : "rounded-full"}`}
              >
                <MapPin className="h-4 w-4" /> {copy.page.openLocationInGoogleMaps}
              </a>
            </div>
          ) : selectedItem ? (
            <div className="min-h-0 flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain pr-1">
              {queryReturnTo ? (
                <button
                  type="button"
                  onClick={() => navigate(queryReturnTo)}
                  className={`inline-flex w-fit items-center gap-1.5 border border-cyan-300/35 bg-cyan-400/15 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/25 ${isV1 ? "rounded-md" : "rounded-full"}`}
                >
                  {copy.page.backToChat}
                </button>
              ) : null}
              <div className="relative border border-white/10 bg-[#111827]">
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
                    setSelectedStay(null);
                    setSelection(null);
                  }}
                  className={`absolute left-3 top-3 inline-flex items-center gap-1.5 border border-white/20 bg-black/45 px-3 py-1.5 text-xs text-white/90 hover:bg-black/60 ${isV1 ? "rounded-md" : "rounded-full"}`}
                  aria-label={copy.page.backToList}
                  title={copy.page.backToList}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <div className="absolute right-3 top-3 z-10" onClick={(e) => e.stopPropagation()}>
                  <AddToTripListMenu kind="event" exhibition={selectedItem} align="end" />
                </div>
                <div className="p-5 pt-8">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#df8eff]">{copy.page.eventHeading}</p>
                  <h2 className="text-2xl font-bold leading-tight text-white">{selectedItem.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/72">{selectedSummary}</p>
                  <a
                    href={buildEventPageUrl(selectedItem)}
                    className={`mt-4 inline-flex items-center gap-2 bg-[#df8eff] px-4 py-2 text-sm font-semibold text-[#2f0f42] hover:bg-[#d680f6] ${isV1 ? "rounded-md" : "rounded-full"}`}
                  >
                    <ExternalLink className="h-4 w-4" /> {copy.page.eventDetail}
                  </a>
                </div>
              </div>

              <div className="space-y-2 border-y border-white/10 py-4">
                <p className="flex items-center gap-2 text-sm text-white/80">
                  <MapPin className="h-4 w-4 text-cyan-200" /> {selectedItem.location}
                </p>
                <p className="flex items-center gap-2 text-sm text-white/75">
                  <Clock3 className="h-4 w-4 text-cyan-200" /> {selectedItem.dateStr.replace(" -> ", " — ")}
                </p>
                <p className="text-sm text-white/85">
                  <span className="mr-2 text-white/50">{copy.page.ticketPriceLabel}</span>
                  <span className="font-semibold text-[#df8eff]">{selectedTicketPrice}</span>
                </p>
              </div>

              <a
                href={buildGoogleMapsUrl(selectedItem)}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center justify-center gap-2 border border-cyan-300/30 bg-cyan-400/15 px-4 py-2.5 font-semibold text-cyan-100 hover:bg-cyan-400/20 ${isV1 ? "rounded-md" : "rounded-full"}`}
              >
                <MapPin className="h-4 w-4" /> {copy.page.openLocationInGoogleMaps}
              </a>
            </div>
          ) : null}
        </aside>
        ) : null}
      </div>
      <SignInPrompt
        open={showSignInPrompt}
        from={location.pathname + location.search}
        title={copy.page.signInPromptTitle}
        description={copy.page.signInPromptDescription}
        onClose={() => setShowSignInPrompt(false)}
      />
      <ActionToast open={showToast} message={toastMessage} />
    </section>
  );
}
