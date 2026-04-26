import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import type { Exhibition } from "@/data/mock";
import { getHomeRecommendations, listTagStats, type TagStat } from "@/lib/api";
import { ExhibitionCard } from "@/components/ExhibitionCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { MapPin, Calendar, ChevronDown, Loader2, ChevronUp, Search } from "lucide-react";
import { getLocaleCopy, useLanguage } from "@/lib/language";

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_OPTIONS = [12, 24, 36];
type PageToken = number | "...";
const CUSTOM_TAG_STORAGE_KEY = "exhibeat_custom_tags_by_exhibition_v1";
const ACCOUNT_PHOTO_PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <defs>
    <linearGradient id="bg" x1="24" y1="20" x2="232" y2="236" gradientUnits="userSpaceOnUse">
      <stop stop-color="#22D3EE"/>
      <stop offset="0.45" stop-color="#A78BFA"/>
      <stop offset="1" stop-color="#F472B6"/>
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(188 62) rotate(132.5) scale(150)">
      <stop stop-color="#FFFFFF" stop-opacity="0.65"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="256" height="256" rx="128" fill="#090B17"/>
  <circle cx="128" cy="128" r="120" fill="url(#bg)"/>
  <circle cx="128" cy="128" r="120" fill="url(#glow)"/>
  <circle cx="128" cy="102" r="44" fill="#FFFFFF" fill-opacity="0.9"/>
  <path d="M52 212C63 168 92 146 128 146C164 146 193 168 204 212" fill="#FFFFFF" fill-opacity="0.9"/>
</svg>
`)}`;

function normalizeHashtag(value: string): string {
  const stripped = String(value ?? "").trim().replace(/^#+/, "").replace(/\s+/g, "");
  if (!stripped) return "";
  return `#${stripped}`;
}

function loadCustomTagCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CUSTOM_TAG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const counts: Record<string, number> = {};
    Object.values(parsed).forEach((value) => {
      if (!Array.isArray(value)) return;
      const deduped = new Set<string>();
      value.forEach((item) => {
        const normalized = normalizeHashtag(String(item ?? ""));
        if (normalized) deduped.add(normalized);
      });
      deduped.forEach((tag) => {
        counts[tag] = (counts[tag] ?? 0) + 1;
      });
    });
    return counts;
  } catch {
    return {};
  }
}

type InstaPickAccount = {
  handle: string;
  accountName: string;
  accountPhoto: string;
  accountLink: string;
  embedPostUrls: string[];
};

const INSTA_PICK_ACCOUNTS: InstaPickAccount[] = [
  {
    handle: "room_exhibition",
    accountName: "room_exhibition",
    accountPhoto:
      "https://scontent-tpe1-1.cdninstagram.com/v/t51.2885-19/412757992_1042052320398635_7916946111700928068_n.jpg?stp=cp0_dst-jpg_s110x80_tt6&_nc_cat=111&ccb=7-5&_nc_sid=bf7eb4&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLnd3dy42MDkuQzMifQ%3D%3D&_nc_ohc=yp4Yih_P_WIQ7kNvwH62Pj2&_nc_oc=AdpZJaKOqVSpEOkXOd0x9EGzkIbk-jEwU9K4yW_kFGgeP1eXCHKcAqR32lXuzb1clKSNYfPpe4hUqB2T6obBL2sd&_nc_zt=24&_nc_ht=scontent-tpe1-1.cdninstagram.com&_nc_ss=7b6a8&oh=00_Af3EJdPibqx2ZHtIg77vDa6YCV22wbJkp6KNjUSo-eEZFw&oe=69F29D74",
    accountLink: "https://www.instagram.com/room_exhibition/",
    embedPostUrls: [
      "https://www.instagram.com/p/DXZQcowFF8d/",
      "https://www.instagram.com/p/DW30CX5FDNA/",
    ],
  },
  {
    handle: "taipeitravel",
    accountName: "taipeitravel",
    accountPhoto: "https://unavatar.io/instagram/taipeitravel",
    accountLink: "https://www.instagram.com/taipeitravel/?hl=zh-tw",
    embedPostUrls: [
      "https://www.instagram.com/p/DXf0pHfCaD6/",
      "https://www.instagram.com/p/DXYSnadEh0m/",
      "https://www.instagram.com/p/DW8O7NqlTno/",
    ],
  },
  {
    handle: "ryan_tobehonest",
    accountName: "ryan_tobehonest",
    accountPhoto: "https://unavatar.io/instagram/ryan_tobehonest",
    accountLink: "https://www.instagram.com/ryan_tobehonest/",
    embedPostUrls: [
      "https://www.instagram.com/reel/DS_vRQ_gV78/",
      "https://www.instagram.com/reel/DQBvTNtAZcp/",
    ],
  },
  {
    handle: "duringmyjourney",
    accountName: "duringmyjourney",
    accountPhoto: "https://unavatar.io/instagram/duringmyjourney",
    accountLink: "https://www.instagram.com/duringmyjourney/",
    embedPostUrls: ["https://www.instagram.com/p/DXg2jp9CRN0/"],
  },
];

// Sort definitions — operate on filtered array
type SortKey = "relevancy" | "newest" | "oldest" | "ending_soon";
const SORT_OPTIONS: Array<{ key: SortKey }> = [
  { key: "relevancy" },
  { key: "newest" },
  { key: "oldest" },
  { key: "ending_soon" },
];

function parseBackendDate(str: string): number {
  if (!str) return 0;
  // Handle "YYYY/MM/DD HH:MM:SS" or "YYYY-MM-DD"
  return new Date(str.replace(/\//g, "-")).getTime();
}

function sortExhibitions(list: Exhibition[], key: SortKey): Exhibition[] {
  const copy = [...list];
  switch (key) {
    case "newest":
      return copy.sort((a, b) => {
        const dateA = parseBackendDate(a._meta?.editModifyDate || a.dateStr.split(" -> ")[0]);
        const dateB = parseBackendDate(b._meta?.editModifyDate || b.dateStr.split(" -> ")[0]);
        return dateB - dateA;
      });
    case "oldest":
      return copy.sort((a, b) => {
        const dateA = parseBackendDate(a._meta?.editModifyDate || a.dateStr.split(" -> ")[0]);
        const dateB = parseBackendDate(b._meta?.editModifyDate || b.dateStr.split(" -> ")[0]);
        return dateA - dateB;
      });
    case "ending_soon":
      return copy.sort((a, b) => {
        const dateA = parseBackendDate(a._meta?.endDate || a.dateStr.split(" -> ")[1]);
        const dateB = parseBackendDate(b._meta?.endDate || b.dateStr.split(" -> ")[1]);
        // Filter out those that already ended if needed, but here we just sort
        return dateA - dateB;
      });
    default:
      return copy; // original API order = relevancy (scored)
  }
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
  const start = (match.index ?? 0);
  const prefix = trimmedRight.slice(0, start);
  const joiner = prefix && !/\s$/.test(prefix) ? " " : "";
  return `${prefix}${joiner}${normalizedTag}`.trim();
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

function parseInitialHomeTab(searchParams: URLSearchParams): "discover" | "insta-picks" {
  return searchParams.get("tab") === "insta-picks" ? "insta-picks" : "discover";
}

export function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { locale } = useLanguage();
  const copy = getLocaleCopy(locale, {
    "zh-TW": {
      sortLabels: { relevancy: "相關度優先", newest: "最新發布", oldest: "最舊發布", endingSoon: "即將結束" },
      pageInputRequired: "請輸入頁碼。",
      pageInputInteger: "頁碼必須是整數。",
      pageInputRange: (total: number) => `頁碼需介於 1 到 ${total}。`,
      aiSoulPick: "AI 靈魂推薦",
      todayHot: "台北・今日熱門",
      loadingAi: "載入 AI 推薦中…",
      fallbackSummary: "結合 AI 運算與沉浸式光影，這場展覽將重新定義你對這座城市的認知。系統根據你的喜好分析：極高機率會讓你流連忘返。",
      viewDetail: "查看詳情",
      noRecommendation: "無推薦資料",
      switchHero: "切換到推薦展演",
      searchPlaceholder: "搜尋展覽、藝術家...（#標籤）",
      noTagMatch: "無符合標籤",
      sort: "排序",
      instagramTitle: "Instagram 靈感帳號",
      instagramTips: "先選上方帳號，再看下方完整貼文區；目前三個帳號先共用同一個 widget 測試排版。",
      socialPicksTitle: "社群精選",
      socialPicksSubtitle: "從熱門社群藝文帳號獲取旅遊靈感",
      goToInstagram: "前往 IG",
      socialPickEmptyHint: "點擊上方帳號頭像後，這裡才會顯示該帳號的 Instagram 貼文",
      loadingRecommendations: "載入推薦活動中…",
      noMatchedResult: "此篩選條件暫無符合展演",
      totalItems: (count: number) => `共 ${count} 筆`,
      pageSizeItems: (count: number) => `${count} 筆`,
      pageButtonTitle: (page: number, start: number, end: number) => `第 ${page} 頁（${start}-${end} 筆）`,
      pageSize: "每頁顯示",
      previousPage: "上一頁",
      nextPage: "下一頁",
      jumpTo: "跳到第",
      pageUnit: "頁",
      go: "前往",
      lastPage: "最後一頁",
    },
    en: {
      sortLabels: { relevancy: "Most Relevant", newest: "Newest", oldest: "Oldest", endingSoon: "Ending Soon" },
      pageInputRequired: "Please enter a page number.",
      pageInputInteger: "Page number must be an integer.",
      pageInputRange: (total: number) => `Page number must be between 1 and ${total}.`,
      aiSoulPick: "AI Soul Pick",
      todayHot: "Taipei - Trending Today",
      loadingAi: "Loading AI recommendation…",
      fallbackSummary: "Blending AI insights with immersive visuals, this exhibition may redefine how you see the city. Based on your preferences, the system predicts a very high chance you'll love it.",
      viewDetail: "View Details",
      noRecommendation: "No recommendation data",
      switchHero: "Switch to recommended event",
      searchPlaceholder: "Search exhibitions, artists... (#tag)",
      noTagMatch: "No matching tags",
      sort: "Sort",
      instagramTitle: "Instagram Picks",
      instagramTips: "Select an account above, then view the full post widget below. The first three currently share one widget for layout testing.",
      socialPicksTitle: "Social Picks",
      socialPicksSubtitle: "Get travel inspiration from popular art and culture social accounts.",
      goToInstagram: "Go to IG",
      socialPickEmptyHint: "Click an account avatar above to load that account's Instagram posts here.",
      loadingRecommendations: "Loading recommended activities…",
      noMatchedResult: "No exhibitions match these filters",
      totalItems: (count: number) => `${count} items total`,
      pageSizeItems: (count: number) => `${count} items`,
      pageButtonTitle: (page: number, start: number, end: number) => `Page ${page} (${start}-${end})`,
      pageSize: "Per page",
      previousPage: "Previous",
      nextPage: "Next",
      jumpTo: "Go to page",
      pageUnit: "page",
      go: "Go",
      lastPage: "Last page",
    },
    fr: {
      sortLabels: { relevancy: "Pertinence", newest: "Plus récent", oldest: "Plus ancien", endingSoon: "Se termine bientôt" },
      pageInputRequired: "Veuillez saisir un numéro de page",
      pageInputInteger: "Le numéro de page doit être un entier",
      pageInputRange: (total: number) => `Le numéro de page doit être compris entre 1 et ${total}.`,
      aiSoulPick: "Sélection IA",
      todayHot: "Tendances du jour",
      loadingAi: "Chargement des recommandations IA…",
      fallbackSummary: "Cette exposition combine technologie, art et expérience immersive.",
      viewDetail: "Voir les détails",
      noRecommendation: "Aucune recommandation",
      switchHero: "Changer de recommandation",
      searchPlaceholder: "Rechercher des expositions, artistes… (#tag)",
      noTagMatch: "Aucun tag correspondant",
      sort: "Trier",
      instagramTitle: "Comptes Instagram",
      instagramTips: "Choisissez un compte puis consultez le flux ci-dessous.",
      socialPicksTitle: "Sélection sociale",
      socialPicksSubtitle: "Trouvez de l'inspiration voyage via des comptes culturels populaires.",
      goToInstagram: "Aller sur IG",
      socialPickEmptyHint: "Cliquez sur un avatar ci-dessus pour afficher les publications Instagram du compte.",
      loadingRecommendations: "Chargement des recommandations…",
      noMatchedResult: "Aucun résultat correspondant",
      totalItems: (count: number) => `${count} éléments au total`,
      pageSizeItems: (count: number) => `${count} éléments`,
      pageButtonTitle: (page: number, start: number, end: number) => `Page ${page} (${start}-${end})`,
      pageSize: "Éléments par page",
      previousPage: "Page précédente",
      nextPage: "Page suivante",
      jumpTo: "Aller à",
      pageUnit: "page",
      go: "Aller",
      lastPage: "Dernière page",
    },
  });
  const [allExhibitions, setAllExhibitions] = useState<Exhibition[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(() => parseInitialPage(searchParams));
  const [pageSize, setPageSize] = useState(() => parseInitialPageSize(searchParams));
  const [pageInput, setPageInput] = useState(() => String(parseInitialPage(searchParams)));
  const [pageInputError, setPageInputError] = useState("");
  const [activeSort, setActiveSort] = useState<SortKey>("relevancy");
  const [sortOpen, setSortOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [availableTagStats, setAvailableTagStats] = useState<TagStat[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [activeInstagramHandle, setActiveInstagramHandle] = useState<string | null>(null);
  const [activeHomeTab, setActiveHomeTab] = useState<"discover" | "insta-picks">(() =>
    parseInitialHomeTab(searchParams),
  );
  const searchRef = useRef<HTMLFormElement | null>(null);
  const rawQuery = useMemo(() => new URLSearchParams(location.search).get("q") ?? "", [location.search]);
  const effectiveSearch = rawQuery.trim();
  const searchTokens = useMemo(() => parseSearchTokens(effectiveSearch), [effectiveSearch]);


  useEffect(() => {
    setLoading(true);
    getHomeRecommendations({ limit: 5000, offset: 0, locale })
      .then(data => {
        setAllExhibitions(data);
        setLoading(false);
      })
      .catch(err => { console.error(err); setLoading(false); });
  }, [locale]);

  useEffect(() => { setCurrentPage(1); }, [activeSort, rawQuery]);

  useEffect(() => {
    setSearchQuery(rawQuery);
    setActiveSuggestionIndex(-1);
  }, [rawQuery]);

  useEffect(() => {
    setActiveHomeTab(parseInitialHomeTab(new URLSearchParams(location.search)));
  }, [location.search]);

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

  const filtered = useMemo(() => {
    const searched = !effectiveSearch
      ? allExhibitions
      : allExhibitions.filter((exhibition) => matchMixedSearch(exhibition, searchTokens));
    return sortExhibitions(searched, activeSort);
  }, [activeSort, allExhibitions, effectiveSearch, searchTokens]);

  const heroCandidates = useMemo(() => allExhibitions.slice(0, 3), [allExhibitions]);
  const hero = heroCandidates[heroIndex] ?? heroCandidates[0];
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const grid = filtered.slice(startIndex, startIndex + pageSize);
  const pageTokens = useMemo(() => buildPageTokens(totalPages, safeCurrentPage), [safeCurrentPage, totalPages]);
  const activeInstaPickAccount =
    INSTA_PICK_ACCOUNTS.find((account) => account.handle === activeInstagramHandle) ?? null;
  const activeTagQuery = useMemo(() => getActiveHashtagFragment(searchQuery), [searchQuery]);
  const tagSuggestionActive = useMemo(() => hasActiveHashtagToken(searchQuery), [searchQuery]);
  const mergedTagStats = useMemo(() => {
    const merged = new Map<string, number>();
    availableTagStats.forEach((row) => {
      const tag = normalizeHashtag(row.tag);
      if (!tag) return;
      merged.set(tag, Math.max(0, Math.floor(Number(row.count) || 0)));
    });
    const customCounts = loadCustomTagCounts();
    Object.entries(customCounts).forEach(([tag, count]) => {
      const normalized = normalizeHashtag(tag);
      if (!normalized) return;
      merged.set(normalized, (merged.get(normalized) ?? 0) + Math.max(0, count));
    });
    return Array.from(merged.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag, "zh-Hant"));
  }, [availableTagStats, rawQuery]);
  const searchSuggestions = useMemo(() => {
    if (!tagSuggestionActive) return [] as Array<{ tag: string; count: number }>;
    const rows: Array<{ tag: string; count: number }> = [];
    for (const row of mergedTagStats) {
      const cleanTag = row.tag.replace(/^#+/, "").toLowerCase();
      if (activeTagQuery && !cleanTag.startsWith(activeTagQuery)) continue;
      rows.push(row);
    }
    return rows.slice(0, 30);
  }, [activeTagQuery, tagSuggestionActive, mergedTagStats]);

  useEffect(() => {
    const scriptSrc = "https://www.instagram.com/embed.js";
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptSrc}"]`);
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = scriptSrc;
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (activeHomeTab !== "insta-picks") return;
    const processEmbeds = () => {
      const instgrm = (window as Window & { instgrm?: { Embeds?: { process: () => void } } }).instgrm;
      instgrm?.Embeds?.process?.();
    };
    processEmbeds();
    const timer = window.setTimeout(processEmbeds, 200);
    return () => window.clearTimeout(timer);
  }, [activeHomeTab, activeInstagramHandle]);

  useEffect(() => {
    if (heroCandidates.length === 0) {
      setHeroIndex(0);
      return;
    }
    setHeroIndex((idx) => (idx >= heroCandidates.length ? 0 : idx));
  }, [heroCandidates.length]);

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
      setPageInputError(copy.pageInputInteger);
      return;
    }
    if (parsed < 1 || parsed > totalPages) {
      setPageInputError(copy.pageInputRange(totalPages));
      return;
    }
    const nextPage = parsed;
    setCurrentPage(nextPage);
    setPageInput(String(nextPage));
    setPageInputError("");
  };

  const applySearchQuery = (value: string) => {
    const q = value.trim();
    const next = new URLSearchParams(searchParams);
    if (q) next.set("q", q);
    else next.delete("q");
    next.delete("page");
    setSearchParams(next, { replace: true });
    setSearchSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedSuggestion =
      activeSuggestionIndex >= 0 ? searchSuggestions[activeSuggestionIndex]?.tag : null;
    const nextQuery = selectedSuggestion ? replaceActiveHashtag(searchQuery, selectedSuggestion) : searchQuery;
    setSearchQuery(nextQuery);
    applySearchQuery(nextQuery);
  };

  const handleSuggestionClick = (suggestion: { tag: string; count: number }) => {
    const nextQuery = replaceActiveHashtag(searchQuery, suggestion.tag);
    setSearchQuery(nextQuery);
    applySearchQuery(nextQuery);
  };

  const handleHomeTabChange = (value: string) => {
    const nextTab = value === "insta-picks" ? "insta-picks" : "discover";
    setActiveHomeTab(nextTab);
    const next = new URLSearchParams(searchParams);
    if (nextTab === "insta-picks") {
      next.set("tab", "insta-picks");
    } else {
      next.delete("tab");
    }
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(safeCurrentPage));
    next.set("pageSize", String(pageSize));
    const currentString = searchParams.toString();
    const nextString = next.toString();
    if (nextString !== currentString) {
      setSearchParams(next, { replace: true });
    }
  }, [pageSize, safeCurrentPage, searchParams, setSearchParams]);

  useEffect(() => {
    if (heroCandidates.length <= 1) return;
    const timer = window.setInterval(() => {
      setHeroIndex((idx) => (idx + 1) % heroCandidates.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [heroCandidates.length]);

  return (
    <div className="w-full pb-20">
      {activeHomeTab === "discover" && (
      <section className="relative w-full h-[716px] overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={hero?.imageUrl ?? "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1200&auto=format&fit=crop&q=80"}
            alt={hero ? hero.title : "ExhiBeat"}
            className="w-full h-full object-cover opacity-60 transition-all duration-700"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "https://images.unsplash.com/photo-1549490349-8643362247b5?w=1200&auto=format&fit=crop&q=80";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>

        <div className="relative z-10 h-full max-w-7xl mx-auto px-8 flex flex-col justify-end pb-16">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 bg-[#00d6ff] text-[#042028] text-xs font-bold rounded-full uppercase tracking-wider">
              {copy.aiSoulPick}
            </span>
            <span className="text-white/65 text-sm font-medium">{copy.todayHot}</span>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 text-white/70 mb-4">
              <Loader2 className="w-5 h-5 animate-spin" /><span>{copy.loadingAi}</span>
            </div>
          ) : hero ? (
            <>
              <h1 className="line-clamp-3 text-4xl md:text-7xl font-headline font-extrabold tracking-tighter mb-5 leading-[1.03] text-white max-w-4xl">
                <span>{hero.title}</span>
              </h1>
              <p className="line-clamp-6 max-w-2xl text-base md:text-lg text-white/70 mb-6 font-body leading-relaxed">
                <span>{hero.aiSummary
                  ? hero.aiSummary
                  : copy.fallbackSummary}</span>
              </p>
              <div className="flex items-center gap-6 mt-1 mb-8">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" /> {hero.dateStr.replace(" -> ", " — ")}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> <span>{hero.location}</span>
                </span>
              </div>
              <div className="flex gap-4">
                <Link to={hero ? `/exhibition/${encodeURIComponent(hero.id)}` : "#"} state={{ exhibition: hero }}>
                  <Button size="lg" variant="outline" className="bg-[#25252c]/70 backdrop-blur-md text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-[#2c2b33] transition-all border-white/10">
                    {copy.viewDetail}
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-6xl font-black text-white/40 mb-4">{copy.noRecommendation}</h1>
              <Button size="lg" variant="outline" className="bg-[#25252c]/70 text-white px-8 py-4 rounded-full font-bold text-lg border-white/10">
                {copy.viewDetail}
              </Button>
            </>
          )}
        </div>

        <div className="absolute right-8 bottom-16 z-30 flex flex-col gap-3 pointer-events-auto">
          {heroCandidates.map((item, idx) => {
            const isActive = idx === heroIndex;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setHeroIndex(idx)}
                className="group flex items-center justify-center w-6 h-12 rounded-md"
                aria-label={`${copy.switchHero} ${idx + 1}`}
                title={item.title}
              >
                <span className={`rounded-full transition-all ${isActive ? "w-1 h-12 bg-primary" : "w-1 h-8 bg-[#25252c] group-hover:bg-white/30"}`} />
              </button>
            );
          })}
        </div>
      </section>
      )}

      <section className="max-w-7xl mx-auto px-8 py-12">
        {activeHomeTab === "discover" && (
        <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <form className="relative w-full md:max-w-xl" onSubmit={handleSearchSubmit} ref={searchRef}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                const value = event.target.value;
                setSearchQuery(value);
                setActiveSuggestionIndex(-1);
                setSearchSuggestionsOpen(hasActiveHashtagToken(value));
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
              placeholder={copy.searchPlaceholder}
              className="h-11 w-full rounded-full border border-white/10 bg-[#1f1f26]/80 pl-9 pr-4 text-sm text-white shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {searchSuggestionsOpen && (
              <div className="absolute left-0 right-0 mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-[#1a1625] shadow-xl z-30">
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
                  <div className="px-3 py-2.5 text-sm text-white/45">{copy.noTagMatch}</div>
                )}
              </div>
            )}
          </form>
          <button
            onClick={() => setSortOpen(o => !o)}
            className="flex items-center gap-2 justify-self-start text-sm text-white/65 hover:text-white transition-colors lg:justify-self-end"
          >
            <span className="opacity-80">≡</span>
            {(
              activeSort === "relevancy"
                ? copy.sortLabels.relevancy
                : activeSort === "newest"
                  ? copy.sortLabels.newest
                  : activeSort === "oldest"
                    ? copy.sortLabels.oldest
                    : copy.sortLabels.endingSoon
            ) ?? copy.sort}
            {sortOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
        )}

        {activeHomeTab === "discover" && (
        <div className="relative">
          {sortOpen && (
            <div className="absolute right-0 -top-2 w-44 bg-[#1a1625] border border-white/10 rounded-xl shadow-xl z-30 overflow-hidden">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => { setActiveSort(opt.key); setSortOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    activeSort === opt.key
                      ? "text-[#0cf] bg-white/5"
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {opt.key === "relevancy"
                    ? copy.sortLabels.relevancy
                    : opt.key === "newest"
                      ? copy.sortLabels.newest
                      : opt.key === "oldest"
                        ? copy.sortLabels.oldest
                        : copy.sortLabels.endingSoon}
                </button>
              ))}
            </div>
          )}
        </div>
        )}
        <Tabs
          value={activeHomeTab}
          onValueChange={handleHomeTabChange}
          className="mb-8 w-full"
        >
          <TabsContent value="discover" className="mt-0">
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 min-h-[300px]">
        {loading ? (
          <div className="col-span-full flex justify-center items-center gap-3 h-60 text-white/50">
            <Loader2 className="w-6 h-6 animate-spin" /> {copy.loadingRecommendations}
          </div>
        ) : grid.length > 0 ? (
          grid.map(exhibition => (
            <ExhibitionCard
              key={exhibition.id}
              exhibition={exhibition}
            />
          ))
        ) : (
          <div className="col-span-full flex flex-col justify-center items-center h-60 gap-3 text-white/50">
            <span className="text-4xl opacity-30">🔍</span>
            <span>{copy.noMatchedResult}</span>
          </div>
        )}
            </section>
          </TabsContent>

          <TabsContent value="insta-picks" className="mt-0">
            <section className="py-2">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white">{copy.socialPicksTitle}</h2>
              </div>
              <p className="mb-4 text-sm text-white/70">{copy.socialPicksSubtitle}</p>

              <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
                  {INSTA_PICK_ACCOUNTS.map((account) => {
                    const isActive = account.handle === activeInstagramHandle;
                    return (
                      <button
                        key={account.handle}
                        type="button"
                        onClick={() => setActiveInstagramHandle(account.handle)}
                        aria-pressed={isActive}
                        className="group flex flex-col items-center gap-3 p-2 transition-colors"
                      >
                        <span
                          className={`flex size-20 aspect-square items-center justify-center overflow-hidden rounded-full [clip-path:circle(50%)] text-xl font-black transition-all md:size-24 ${
                            isActive
                              ? "ring-2 ring-cyan-300 text-[#04141a] bg-white/10"
                              : "text-white bg-white/5 group-hover:opacity-90"
                          }`}
                        >
                          <img
                            src={account.accountPhoto}
                            alt={`@${account.handle} avatar`}
                            className="h-full w-full rounded-full object-cover"
                            loading="eager"
                            referrerPolicy="no-referrer"
                            decoding="async"
                            onError={(event) => {
                              if (!event.currentTarget.dataset.placeholderTried) {
                                event.currentTarget.dataset.placeholderTried = "1";
                                event.currentTarget.src = ACCOUNT_PHOTO_PLACEHOLDER;
                                return;
                              }
                              event.currentTarget.style.display = "none";
                              const fallback = event.currentTarget.nextElementSibling as HTMLSpanElement | null;
                              if (fallback) fallback.style.display = "flex";
                            }}
                          />
                          <span className="hidden h-full w-full items-center justify-center rounded-full">
                            {account.accountName.slice(0, 1).toUpperCase()}
                          </span>
                        </span>
                        <span className={isActive ? "text-sm font-semibold text-white" : "text-sm text-white/55"}>
                          @{account.accountName}
                        </span>
                      </button>
                    );
                  })}
              </div>

              {activeInstaPickAccount ? (
                <div className="mx-auto max-w-xl space-y-4">
                  <div className="mb-1 flex items-center justify-between gap-2 px-1">
                    <p className="text-sm text-white/70">@{activeInstaPickAccount.accountName}</p>
                    <a
                      href={activeInstaPickAccount.accountLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-cyan-200 transition-colors hover:text-cyan-100"
                    >
                      {copy.goToInstagram}
                    </a>
                  </div>
                  {activeInstaPickAccount.embedPostUrls.map((postUrl) => (
                    <blockquote
                      key={postUrl}
                      className="instagram-media mx-auto w-full max-w-[540px]"
                      data-instgrm-captioned
                      data-instgrm-permalink={`${postUrl}?utm_source=ig_embed&utm_campaign=loading`}
                      data-instgrm-version="14"
                    />
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-white/60">
                  {copy.socialPickEmptyHint}
                </div>
              )}
            </section>
          </TabsContent>
        </Tabs>

        {activeHomeTab === "discover" && !loading && filtered.length > 0 && (
          <div className="mt-12 flex flex-col items-center gap-3">
            <p className="text-center text-white/45 text-sm">
              {copy.totalItems(filtered.length)}
            </p>
            <div className="flex items-center gap-2 text-xs text-white/70">
              <label htmlFor="home-page-size">{copy.pageSize}</label>
              <select
                id="home-page-size"
                value={pageSize}
                onChange={(event) => {
                  const nextPageSize = Number(event.target.value) || DEFAULT_PAGE_SIZE;
                  setPageSize(nextPageSize);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-white/15 bg-[#1f1f26]/90 px-2 py-1 text-xs text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {copy.pageSizeItems(size)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safeCurrentPage === 1}
                className="rounded-full bg-white/8 px-4 text-white hover:bg-white/15 disabled:opacity-40"
              >
                {copy.previousPage}
              </Button>
              {pageTokens.map((token, index) => {
                if (token === "...") {
                  return (
                    <span key={`home-ellipsis-${index}`} className="px-1 text-xs text-white/45">
                      ...
                    </span>
                  );
                }
                const pageStart = (token - 1) * pageSize + 1;
                const pageEnd = Math.min(token * pageSize, filtered.length);
                const active = token === safeCurrentPage;
                return (
                  <button
                    key={token}
                    type="button"
                    onClick={() => setCurrentPage(token)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-[#00d6ff] text-[#042028]"
                        : "bg-white/8 text-white/70 hover:bg-white/12 hover:text-white"
                    }`}
                    title={copy.pageButtonTitle(token, pageStart, pageEnd)}
                  >
                    {token}
                  </button>
                );
              })}
              <Button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safeCurrentPage === totalPages}
                className="rounded-full bg-white/8 px-4 text-white hover:bg-white/15 disabled:opacity-40"
              >
                {copy.nextPage}
              </Button>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs text-white/70">
              <span>{copy.jumpTo}</span>
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
                className="w-16 rounded-lg border border-white/15 bg-[#1f1f26]/90 px-2 py-1 text-center text-xs text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <span>{copy.pageUnit}</span>
              <Button
                type="button"
                onClick={jumpToPage}
                className="rounded-full bg-white/10 px-4 text-white hover:bg-white/15"
              >
                {copy.go}
              </Button>
              <Button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                className="rounded-full bg-white/10 px-4 text-white hover:bg-white/15"
              >
                {copy.lastPage}
              </Button>
            </div>
            {pageInputError ? (
              <p className="text-xs text-rose-300">{pageInputError}</p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
