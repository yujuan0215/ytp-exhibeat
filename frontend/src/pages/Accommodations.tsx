import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2,
  MapPin,
  Phone,
  Search,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedHeart } from "@/components/ui/AnimatedHeart";
import { listLegalStays, type LegalStay } from "@/lib/api";
import { getLocaleCopy, useLanguage } from "@/lib/language";
import { useTheme } from "@/lib/theme";
import {
  getStayFavoriteIds,
  STAY_FAVORITES_CHANGE_EVENT,
  toggleStayFavorite,
} from "@/lib/stayFavorites";

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_OPTIONS = [12, 24, 36, 60];
const API_PAGE_SIZE = 1000;
const STAY_PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&auto=format&fit=crop&q=80",
];

type StayClassFilter = "all" | "hotel" | "bnb" | "tourist" | "international";
type StayFeatureFilter = "all" | "image" | "website" | "budget";
type PageToken = number | "...";

const STAY_CLASS_FILTERS: Array<{ id: StayClassFilter; codes?: number[] }> = [
  { id: "all" },
  { id: "hotel", codes: [3] },
  { id: "bnb", codes: [4] },
  { id: "tourist", codes: [2] },
  { id: "international", codes: [1] },
];

const STAY_FEATURE_FILTERS: Array<{ id: StayFeatureFilter }> = [
  { id: "all" },
  { id: "image" },
  { id: "website" },
  { id: "budget" },
];

const copyByLocale = {
  "zh-TW": {
    searchKeyword: "官網",
    uncategorizedTown: "未分類",
    classFilterLabels: {
      all: "全部類型",
      hotel: "旅館",
      bnb: "民宿",
      tourist: "觀光旅館",
      international: "國際觀光旅館",
    } as Record<StayClassFilter, string>,
    featureFilterLabels: {
      all: "全部條件",
      image: "有圖片",
      website: "有官網/連結",
      budget: "平價參考",
    } as Record<StayFeatureFilter, string>,
    externalLabels: {
      website: "官方網站",
      reservation: "訂房連結",
      reservationSecondary: "訂房連結 2",
      related: "相關連結",
      relatedSecondary: "相關連結 2",
      social: "社群頁面",
      socialSecondary: "社群頁面 2",
      tourismData: "觀光署資料頁",
      searchWebsite: "搜尋官網",
    },
    pageTitle: "找住宿",
    searchPlaceholder: "搜尋飯店名稱或地點（例：大安、中山、Hotel）",
    classFilterTitle: "旅宿類型",
    featureFilterTitle: "需求條件",
    townFilterTitle: "熱門行政區",
    allTowns: "全部區域",
    statsLine: (params: { page: number; totalPages: number; pageSize: number; pageCount: number; total: number; loaded: number }) =>
      `第 ${params.page} / ${params.totalPages} 頁，每頁 ${params.pageSize} 筆，本頁 ${params.pageCount} 筆，共 ${params.total} 筆符合條件住宿${
        params.loaded ? `（已載入資料庫 ${params.loaded} 筆台北旅宿）` : ""
      }`,
    loadingStays: "載入住宿資料中…",
    emptyState: "找不到符合關鍵字的住宿，請改用其他名稱或地點。",
    removeFavorite: "取消收藏",
    addFavorite: "加入收藏",
    cardDescriptionFallback: "展開可查看地址、電話與更多資訊。",
    legalStay: "合法旅宿",
    mapExplore: "地圖探索",
    collapseDetails: "收合詳細資訊",
    details: "詳細資訊",
    phonePending: "電話待補",
    starRatingLabel: "星級評等：",
    starUnit: "星",
    notProvided: "未提供",
    pageSizeLabel: "每頁顯示",
    recordsUnit: "筆",
    prevPage: "上一頁",
    nextPage: "下一頁",
    pageTitleWithRange: (params: { page: number; start: number; end: number }) => `第 ${params.page} 頁（${params.start}-${params.end} 筆）`,
    jumpToPagePrefix: "跳到第",
    pageUnit: "頁",
    go: "前往",
    lastPage: "最後一頁",
    pageInputRequired: "請輸入頁碼。",
    pageInputIntegerOnly: "頁碼必須是整數。",
    pageInputOutOfRange: (totalPages: number) => `頁碼需介於 1 到 ${totalPages}。`,
  },
  en: {
    searchKeyword: "official website",
    uncategorizedTown: "Uncategorized",
    classFilterLabels: {
      all: "All types",
      hotel: "Hotel",
      bnb: "B&B",
      tourist: "Tourist hotel",
      international: "International tourist hotel",
    } as Record<StayClassFilter, string>,
    featureFilterLabels: {
      all: "All features",
      image: "Has image",
      website: "Has official site/link",
      budget: "Budget-friendly",
    } as Record<StayFeatureFilter, string>,
    externalLabels: {
      website: "Official website",
      reservation: "Booking link",
      reservationSecondary: "Booking link 2",
      related: "Related link",
      relatedSecondary: "Related link 2",
      social: "Social page",
      socialSecondary: "Social page 2",
      tourismData: "Tourism data page",
      searchWebsite: "Search official site",
    },
    pageTitle: "Find Stays",
    searchPlaceholder: "Search hotel names or areas (e.g., Daan, Zhongshan, Hotel)",
    classFilterTitle: "Stay type",
    featureFilterTitle: "Filter conditions",
    townFilterTitle: "Popular districts",
    allTowns: "All districts",
    statsLine: (params: { page: number; totalPages: number; pageSize: number; pageCount: number; total: number; loaded: number }) =>
      `Page ${params.page} / ${params.totalPages}, ${params.pageSize} per page, ${params.pageCount} on this page, ${params.total} matching stays${
        params.loaded ? ` (${params.loaded} Taipei stays loaded)` : ""
      }`,
    loadingStays: "Loading stays...",
    emptyState: "No stays match your keywords. Try a different name or area.",
    removeFavorite: "Remove favorite",
    addFavorite: "Add favorite",
    cardDescriptionFallback: "Expand to see address, phone, and more details.",
    legalStay: "Legal stay",
    mapExplore: "Explore on map",
    collapseDetails: "Collapse details",
    details: "Details",
    phonePending: "Phone unavailable",
    starRatingLabel: "Star rating: ",
    starUnit: "star",
    notProvided: "Not provided",
    pageSizeLabel: "Per page",
    recordsUnit: "items",
    prevPage: "Previous",
    nextPage: "Next",
    pageTitleWithRange: (params: { page: number; start: number; end: number }) => `Page ${params.page} (${params.start}-${params.end})`,
    jumpToPagePrefix: "Go to page",
    pageUnit: "",
    go: "Go",
    lastPage: "Last",
    pageInputRequired: "Please enter a page number.",
    pageInputIntegerOnly: "Page number must be an integer.",
    pageInputOutOfRange: (totalPages: number) => `Page number must be between 1 and ${totalPages}.`,
  },
} as const;

function getStayPlaceholderImage(stay: LegalStay): string {
  const seed = Array.from(stay.id || stay.name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return STAY_PLACEHOLDER_IMAGES[seed % STAY_PLACEHOLDER_IMAGES.length];
}

function getStayImageUrl(stay: LegalStay): string {
  return stay.primaryImageUrl || stay.images?.[0]?.url || getStayPlaceholderImage(stay);
}

function normalizeExternalUrl(url: string): string {
  const value = url.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  return `https://${value}`;
}

function buildStaySearchUrl(stay: LegalStay, searchKeyword: string): string {
  const query = [stay.name, stay.address.full, searchKeyword].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function getStayExternalLinks(
  stay: LegalStay,
  labels: {
    website: string;
    reservation: string;
    reservationSecondary: string;
    related: string;
    relatedSecondary: string;
    social: string;
    socialSecondary: string;
    tourismData: string;
    searchWebsite: string;
  },
  searchKeyword: string,
): Array<{ label: string; url: string; tone?: "primary" | "muted" }> {
  const links: Array<{ label: string; url: string; tone?: "primary" | "muted" }> = [];
  const seen = new Set<string>();
  const addLink = (label: string, rawUrl: string, tone: "primary" | "muted" = "muted") => {
    const url = normalizeExternalUrl(rawUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push({ label, url, tone });
  };

  addLink(labels.website, stay.urls.website, "primary");
  stay.urls.reservation.slice(0, 2).forEach((url, index) => addLink(index === 0 ? labels.reservation : labels.reservationSecondary, url));
  stay.urls.sameAs.slice(0, 2).forEach((url, index) => addLink(index === 0 ? labels.related : labels.relatedSecondary, url));
  stay.urls.socialMedia.slice(0, 2).forEach((url, index) => addLink(index === 0 ? labels.social : labels.socialSecondary, url));
  addLink(labels.tourismData, stay.mediaDetailUrl);
  addLink(labels.searchWebsite, buildStaySearchUrl(stay, searchKeyword), "primary");

  return links;
}

function matchesClassFilter(stay: LegalStay, filter: StayClassFilter): boolean {
  if (filter === "all") return true;
  const option = STAY_CLASS_FILTERS.find((item) => item.id === filter);
  return option?.codes?.some((code) => stay.classCodes.includes(code)) ?? true;
}

function matchesFeatureFilter(stay: LegalStay, filter: StayFeatureFilter): boolean {
  if (filter === "all") return true;
  if (filter === "image") return Boolean(stay.primaryImageUrl || stay.images?.length);
  if (filter === "website") {
    return Boolean(
      stay.urls.website ||
      stay.urls.reservation.length ||
      stay.urls.sameAs.length ||
      stay.urls.socialMedia.length,
    );
  }
  if (filter === "budget") {
    const lowest = stay.priceRange.lowest;
    return lowest > 0 && lowest <= 2500;
  }
  return true;
}

function buildPageTokens(totalPages: number, currentPage: number): PageToken[] {
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const normalized = Array.from(pages).filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const tokens: PageToken[] = [];

  for (let i = 0; i < normalized.length; i += 1) {
    const page = normalized[i];
    const prev = normalized[i - 1];
    if (prev && page - prev > 1) tokens.push("...");
    tokens.push(page);
  }
  return tokens;
}

function parseInitialPage(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get("page"));
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.trunc(raw);
}

function parseInitialPageSize(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get("pageSize"));
  if (!Number.isFinite(raw)) return DEFAULT_PAGE_SIZE;
  const pageSize = Math.trunc(raw);
  return PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE;
}

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
  const { locale } = useLanguage();
  const { theme } = useTheme();
  const copy = useMemo(() => getLocaleCopy(locale, copyByLocale), [locale]);
  const isV1 = theme === "v1";
  const [stays, setStays] = useState<LegalStay[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") ?? "");
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [favoriteStayIds, setFavoriteStayIds] = useState<Set<string>>(new Set());
  const [selectedClass, setSelectedClass] = useState<StayClassFilter>("all");
  const [selectedFeature, setSelectedFeature] = useState<StayFeatureFilter>("all");
  const [selectedTown, setSelectedTown] = useState("all");
  const [currentPage, setCurrentPage] = useState(() => parseInitialPage(searchParams));
  const [pageSize, setPageSize] = useState(() => parseInitialPageSize(searchParams));
  const [pageInput, setPageInput] = useState(() => String(parseInitialPage(searchParams)));
  const [pageInputError, setPageInputError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const stayLocale = locale === "zh-TW" ? "zh-TW" : "en";
    async function loadTaipeiStays() {
      const first = await listLegalStays({
        city: "Taipei City",
        locale: stayLocale,
        lang: stayLocale,
        limit: API_PAGE_SIZE,
        offset: 0,
      });
      let combined = first.stays;
      let offset = first.stays.length;
      while (offset < first.total && offset < 3000) {
        const next = await listLegalStays({
          city: "Taipei City",
          locale: stayLocale,
          lang: stayLocale,
          limit: API_PAGE_SIZE,
          offset,
        });
        combined = [...combined, ...next.stays];
        offset += next.stays.length;
        if (next.stays.length === 0) break;
      }
      return combined;
    }

    loadTaipeiStays()
      .then((loadedStays) => {
        if (cancelled) return;
        setStays(loadedStays);
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
  }, [locale]);

  useEffect(() => {
    const sync = () => setFavoriteStayIds(new Set(getStayFavoriteIds()));
    sync();
    window.addEventListener(STAY_FAVORITES_CHANGE_EVENT, sync);
    return () => window.removeEventListener(STAY_FAVORITES_CHANGE_EVENT, sync);
  }, []);

  const townOptions = useMemo(() => {
    const counts = new Map<string, number>();
    stays.forEach((stay) => {
      const town = stay.address.town || copy.uncategorizedTown;
      counts.set(town, (counts.get(town) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"))
      .slice(0, 12)
      .map(([town, count]) => ({ town, count }));
  }, [copy.uncategorizedTown, stays]);

  const visibleStays = useMemo(() => {
    return stays.filter((stay) => {
      const townMatches = selectedTown === "all" || stay.address.town === selectedTown;
      return (
        matchesSearch(stay, searchTerm) &&
        matchesClassFilter(stay, selectedClass) &&
        matchesFeatureFilter(stay, selectedFeature) &&
        townMatches
      );
    });
  }, [selectedClass, selectedFeature, selectedTown, stays, searchTerm]);
  const totalPages = Math.max(1, Math.ceil(visibleStays.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const pagedStays = visibleStays.slice(startIndex, startIndex + pageSize);
  const pageTokens = useMemo(() => buildPageTokens(totalPages, safeCurrentPage), [safeCurrentPage, totalPages]);

  useEffect(() => {
    if (expandedCardId && !visibleStays.some((s) => s.id === expandedCardId)) {
      setExpandedCardId(null);
    }
  }, [expandedCardId, visibleStays]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedClass, selectedFeature, selectedTown]);

  useEffect(() => {
    setPageInput(String(safeCurrentPage));
    setPageInputError("");
  }, [safeCurrentPage]);

  const jumpToPage = () => {
    if (!pageInput.trim()) {
      setPageInputError(copy.pageInputRequired);
      return;
    }
    const parsed = Number(pageInput);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      setPageInputError(copy.pageInputIntegerOnly);
      return;
    }
    if (parsed < 1 || parsed > totalPages) {
      setPageInputError(copy.pageInputOutOfRange(totalPages));
      return;
    }
    const nextPage = parsed;
    setCurrentPage(nextPage);
    setPageInput(String(nextPage));
    setPageInputError("");
  };

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (searchTerm.trim()) next.set("q", searchTerm.trim());
    else next.delete("q");
    next.set("page", String(safeCurrentPage));
    next.set("pageSize", String(pageSize));

    const currentString = searchParams.toString();
    const nextString = next.toString();
    if (nextString !== currentString) {
      setSearchParams(next, { replace: true });
    }
  }, [pageSize, safeCurrentPage, searchParams, searchTerm, setSearchParams]);
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
          <h1 className="text-4xl font-bold text-white">{copy.pageTitle}</h1>
        </header>

        <div className="relative w-full md:max-w-lg">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <input
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            type="search"
            placeholder={copy.searchPlaceholder}
            className={`h-11 w-full border border-white/10 bg-[#1f1f26]/80 pl-9 pr-4 text-sm text-white shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${isV1 ? "rounded-md" : "rounded-full"}`}
          />
        </div>

        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-white/50">{copy.classFilterTitle}</span>
            {STAY_CLASS_FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedClass(option.id)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${isV1 ? "rounded-md" : "rounded-full"} ${
                  selectedClass === option.id
                    ? "bg-[#00d6ff] text-[#042028]"
                    : "bg-white/8 text-white/70 hover:bg-white/12 hover:text-white"
                }`}
              >
                {copy.classFilterLabels[option.id]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-white/50">{copy.featureFilterTitle}</span>
            {STAY_FEATURE_FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedFeature(option.id)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${isV1 ? "rounded-md" : "rounded-full"} ${
                  selectedFeature === option.id
                    ? "bg-purple-400 text-[#21102d]"
                    : "bg-white/8 text-white/70 hover:bg-white/12 hover:text-white"
                }`}
              >
                {copy.featureFilterLabels[option.id]}
              </button>
            ))}
          </div>

          {townOptions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold text-white/50">{copy.townFilterTitle}</span>
              <button
                type="button"
                onClick={() => setSelectedTown("all")}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${isV1 ? "rounded-md" : "rounded-full"} ${
                  selectedTown === "all"
                    ? "bg-white text-[#171725]"
                    : "bg-white/8 text-white/70 hover:bg-white/12 hover:text-white"
                }`}
              >
                {copy.allTowns}
              </button>
              {townOptions.map(({ town, count }) => (
                <button
                  key={town}
                  type="button"
                  onClick={() => setSelectedTown(town)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${isV1 ? "rounded-md" : "rounded-full"} ${
                    selectedTown === town
                      ? "bg-white text-[#171725]"
                      : "bg-white/8 text-white/70 hover:bg-white/12 hover:text-white"
                  }`}
                >
                  {town} <span className="opacity-60">{count}</span>
                </button>
              ))}
            </div>
          ) : null}

          <p className="text-xs text-white/45">
            {copy.statsLine({
              page: safeCurrentPage,
              totalPages,
              pageSize,
              pageCount: pagedStays.length,
              total: visibleStays.length,
              loaded: stays.length,
            })}
          </p>
        </div>

        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center gap-3 text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" /> {copy.loadingStays}
          </div>
        ) : visibleStays.length === 0 ? (
          <div className={`border border-white/10 py-16 text-center text-white/55 ${isV1 ? "rounded-md" : "rounded-2xl"}`}>
            {copy.emptyState}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pagedStays.map((stay) => {
              const expanded = expandedCardId === stay.id;
              const stayImageUrl = getStayImageUrl(stay);
              const placeholderImageUrl = getStayPlaceholderImage(stay);
              const externalLinks = getStayExternalLinks(stay, copy.externalLabels, copy.searchKeyword);
              return (
                <div
                  key={stay.id}
                  className={`overflow-hidden border border-white/10 bg-[#171725] text-left transition-colors hover:border-cyan-300/35 hover:bg-[#1b1b2b] ${isV1 ? "rounded-md" : "rounded-2xl"}`}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-white/5">
                    <img
                      src={stayImageUrl}
                      alt={stay.name}
                      className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                      onError={(event) => {
                        const img = event.currentTarget;
                        if (img.src !== placeholderImageUrl) {
                          img.src = placeholderImageUrl;
                        }
                      }}
                    />
                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#171725] to-transparent" />
                    <button
                      type="button"
                      onClick={() => handleToggleFavorite(stay.id)}
                      className={`absolute right-3 top-3 z-10 p-2 ${isV1 ? "rounded-md" : "rounded-full"} bg-black/35 backdrop-blur-md hover:bg-black/55`}
                      title={favoriteStayIds.has(stay.id) ? copy.removeFavorite : copy.addFavorite}
                    >
                      <AnimatedHeart
                        checked={favoriteStayIds.has(stay.id)}
                        size={20}
                        className="text-white"
                        title={favoriteStayIds.has(stay.id) ? copy.removeFavorite : copy.addFavorite}
                      />
                    </button>
                  </div>
                  <div className="p-4">
                    <h2 className="line-clamp-2 min-h-[2.5rem] text-base font-bold text-white">{stay.name}</h2>
                    <p className="mt-2 line-clamp-2 text-xs text-white/65">
                      {stay.description || copy.cardDescriptionFallback}
                    </p>
                    <p className="mt-3 flex items-start gap-1.5 text-xs text-white/60">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="line-clamp-2">{stay.address.full}</span>
                    </p>
                    <p className="mt-2 text-xs text-cyan-200">{stay.classLabels.join(" / ") || copy.legalStay}</p>

                    <Button
                      type="button"
                      onClick={() => handleOpenMapExplore(stay)}
                      className={`mt-3 w-full ${isV1 ? "rounded-md" : "rounded-full"} bg-[#00d6ff] font-semibold text-[#042028] hover:bg-[#20deff]`}
                    >
                      {copy.mapExplore}
                    </Button>

                    <button
                      type="button"
                      onClick={() => setExpandedCardId((id) => (id === stay.id ? null : stay.id))}
                      className={`mt-2 flex w-full items-center justify-between gap-2 border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-black/35 ${isV1 ? "rounded-md" : "rounded-xl"}`}
                      aria-expanded={expanded}
                    >
                      <span>{expanded ? copy.collapseDetails : copy.details}</span>
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
                          <span>{stay.phones.join("、") || copy.phonePending}</span>
                        </p>
                        <p>
                          <span className="text-white/50">{copy.starRatingLabel}</span>
                          {stay.starRating ? `${stay.starRating} ${copy.starUnit}` : copy.notProvided}
                        </p>
                        {stay.description ? (
                          <p className="leading-relaxed text-white/70">{stay.description}</p>
                        ) : null}
                        {externalLinks.length > 0 ? (
                          <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                            {externalLinks.map((link) => (
                              <a
                                key={`${stay.id}-${link.label}-${link.url}`}
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                className={`inline-flex items-center justify-center gap-1.5 border px-3 py-2 text-xs font-semibold transition-colors ${
                                  link.tone === "primary"
                                    ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25"
                                    : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10"
                                } ${isV1 ? "rounded-md" : "rounded-full"}`}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {link.label}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!loading && visibleStays.length > 0 ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-white/70">
              <label htmlFor="stay-page-size">{copy.pageSizeLabel}</label>
              <select
                id="stay-page-size"
                value={pageSize}
                onChange={(event) => {
                  const nextPageSize = Number(event.target.value) || DEFAULT_PAGE_SIZE;
                  setPageSize(nextPageSize);
                  setCurrentPage(1);
                }}
                className={`border border-white/15 bg-[#1f1f26]/90 px-2 py-1 text-xs text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${isV1 ? "rounded-md" : "rounded-lg"}`}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} {copy.recordsUnit}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safeCurrentPage === 1}
                className={`px-4 ${isV1 ? "rounded-md" : "rounded-full"} bg-white/8 text-white hover:bg-white/15 disabled:opacity-40`}
              >
                {copy.prevPage}
              </Button>
              {pageTokens.map((token, index) => {
                if (token === "...") {
                  return (
                    <span key={`ellipsis-${index}`} className="px-1 text-xs text-white/45">
                      ...
                    </span>
                  );
                }
                const pageStart = (token - 1) * pageSize + 1;
                const pageEnd = Math.min(token * pageSize, visibleStays.length);
                const active = token === safeCurrentPage;
                return (
                  <button
                    key={token}
                    type="button"
                    onClick={() => setCurrentPage(token)}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${isV1 ? "rounded-md" : "rounded-full"} ${
                      active
                        ? "bg-[#00d6ff] text-[#042028]"
                        : "bg-white/8 text-white/70 hover:bg-white/12 hover:text-white"
                    }`}
                    title={copy.pageTitleWithRange({ page: token, start: pageStart, end: pageEnd })}
                  >
                    {token}
                  </button>
                );
              })}
              <Button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safeCurrentPage === totalPages}
                className={`px-4 ${isV1 ? "rounded-md" : "rounded-full"} bg-white/8 text-white hover:bg-white/15 disabled:opacity-40`}
              >
                {copy.nextPage}
              </Button>
            </div>

            <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs text-white/70">
              <span>{copy.jumpToPagePrefix}</span>
              <input
                value={pageInput}
                onChange={(event) => {
                  setPageInput(event.target.value.replace(/[^\d]/g, ""));
                  if (pageInputError) setPageInputError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") jumpToPage();
                }}
                inputMode="numeric"
                className={`w-16 border border-white/15 bg-[#1f1f26]/90 px-2 py-1 text-center text-xs text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${isV1 ? "rounded-md" : "rounded-lg"}`}
              />
              <span>{copy.pageUnit}</span>
              <Button
                type="button"
                onClick={jumpToPage}
                className={`px-4 ${isV1 ? "rounded-md" : "rounded-full"} bg-white/10 text-white hover:bg-white/15`}
              >
                {copy.go}
              </Button>
              <Button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                className={`px-4 ${isV1 ? "rounded-md" : "rounded-full"} bg-white/10 text-white hover:bg-white/15`}
              >
                {copy.lastPage}
              </Button>
            </div>
            {pageInputError ? (
              <p className="text-xs text-rose-300">{pageInputError}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
