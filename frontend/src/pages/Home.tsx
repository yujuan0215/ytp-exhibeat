import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import type { Exhibition } from "@/data/mock";
import { getHomeRecommendations, listTagStats, type TagStat } from "@/lib/api";
import { ExhibitionCard } from "@/components/ExhibitionCard";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, ChevronDown, Loader2, ChevronUp, Search } from "lucide-react";
import { useLanguage } from "@/lib/language";

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_OPTIONS = [12, 24, 36];
type PageToken = number | "...";
const ENABLE_IG_WIDGET = import.meta.env.VITE_ENABLE_IG_WIDGET === "true";
const IG_WIDGET_SCRIPT_SRC = "https://cdn.commoninja.com/sdk/latest/commonninja.js";
const IG_WIDGET_PID = "76c8d05c-85f6-4953-bb5b-f7e5cfd50c99";
const CUSTOM_TAG_STORAGE_KEY = "exhibeat_custom_tags_by_exhibition_v1";

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

type InstagramAccount = {
  handle: string;
  label: string;
  url: string;
  avatarLabel: string;
  description: string;
  widgetPid?: string;
};

function getInstagramAvatarUrl(handle: string) {
  // Unavatar aggregates public profile images and works for many social providers.
  return `https://unavatar.io/instagram/${encodeURIComponent(handle)}`;
}

const INSTAGRAM_ACCOUNTS: InstagramAccount[] = [
  {
    handle: "taipeitravel",
    label: "台北旅遊網",
    url: "https://www.instagram.com/taipeitravel/?hl=zh-tw",
    avatarLabel: "旅",
    description: "官方旅遊靈感，適合補足城市活動、景點與路線內容。",
    widgetPid: IG_WIDGET_PID,
  },
  {
    handle: "ryan_tobehonest",
    label: "Ryan To Be Honest",
    url: "https://www.instagram.com/ryan_tobehonest/",
    avatarLabel: "R",
    description: "個人視角的展覽、生活與城市觀察，可作為風格化內容來源。",
    widgetPid: IG_WIDGET_PID,
  },
  {
    handle: "tfam_museum",
    label: "台北市立美術館",
    url: "https://www.instagram.com/tfam_museum/",
    avatarLabel: "北",
    description: "美術館官方內容，適合呈現展覽更新與館方活動資訊。",
    widgetPid: IG_WIDGET_PID,
  },
  {
    handle: "wenwenmommy",
    label: "親子旅遊帳號",
    url: "https://www.instagram.com/wenwenmommy/",
    avatarLabel: "親",
    description: "親子友善活動與出遊視角，可補足家庭客群推薦。",
    widgetPid: IG_WIDGET_PID,
  },
  {
    handle: "duringmyjourney",
    label: "During My Journey",
    url: "https://www.instagram.com/duringmyjourney/",
    avatarLabel: "旅",
    description: "旅遊與城市探索內容，適合延伸展覽前後的行程靈感。",
    widgetPid: IG_WIDGET_PID,
  },
];

// Sort definitions — operate on filtered array
type SortKey = "relevancy" | "newest" | "oldest" | "ending_soon";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "relevancy", label: "相關度優先" },
  { key: "newest", label: "最新發布" },
  { key: "oldest", label: "最舊發布" },
  { key: "ending_soon", label: "即將結束" },
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

export function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { locale } = useLanguage();
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
  const [activeInstagramHandle, setActiveInstagramHandle] = useState(INSTAGRAM_ACCOUNTS[0].handle);
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
  const activeInstagramAccount =
    INSTAGRAM_ACCOUNTS.find((account) => account.handle === activeInstagramHandle) ?? INSTAGRAM_ACCOUNTS[0];
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
    if (!ENABLE_IG_WIDGET) return;
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${IG_WIDGET_SCRIPT_SRC}"]`);
    if (existingScript) return;

    const script = document.createElement("script");
    script.src = IG_WIDGET_SCRIPT_SRC;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

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
      setPageInputError("請輸入頁碼。");
      return;
    }
    const parsed = Number(pageInput);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      setPageInputError("頁碼必須是整數。");
      return;
    }
    if (parsed < 1 || parsed > totalPages) {
      setPageInputError(`頁碼需介於 1 到 ${totalPages}。`);
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
              AI 靈魂推薦
            </span>
            <span className="text-white/65 text-sm font-medium">台北・今日熱門</span>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 text-white/70 mb-4">
              <Loader2 className="w-5 h-5 animate-spin" /><span>載入 AI 推薦中…</span>
            </div>
          ) : hero ? (
            <>
              <h1 className="text-5xl md:text-7xl font-headline font-extrabold tracking-tighter mb-6 leading-[1.03] text-white max-w-4xl">
                <span>{hero.title}</span>
              </h1>
              <p className="max-w-2xl text-lg text-white/70 mb-8 font-body leading-relaxed">
                <span>{hero.aiSummary
                  ? hero.aiSummary
                  : "結合 AI 運算與沉浸式光影，這場展覽將重新定義你對這座城市的認知。系統根據你的喜好分析：極高機率會讓你流連忘返。"}</span>
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
                    查看詳情
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-6xl font-black text-white/40 mb-4">無推薦資料</h1>
              <Button size="lg" variant="outline" className="bg-[#25252c]/70 text-white px-8 py-4 rounded-full font-bold text-lg border-white/10">
                查看詳情
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
                aria-label={`切換到推薦展演 ${idx + 1}`}
                title={item.title}
              >
                <span className={`rounded-full transition-all ${isActive ? "w-1 h-12 bg-primary" : "w-1 h-8 bg-[#25252c] group-hover:bg-white/30"}`} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-8 py-12">
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
              placeholder="搜尋展覽、藝術家...（#標籤）"
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
                  <div className="px-3 py-2.5 text-sm text-white/45">無符合標籤</div>
                )}
              </div>
            )}
          </form>
          <button
            onClick={() => setSortOpen(o => !o)}
            className="flex items-center gap-2 justify-self-start text-sm text-white/65 hover:text-white transition-colors lg:justify-self-end"
          >
            <span className="opacity-80">≡</span>
            {SORT_OPTIONS.find(s => s.key === activeSort)?.label ?? "排序"}
            {sortOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

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
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {ENABLE_IG_WIDGET && (
          <section className="mb-10 rounded-[2rem] border border-white/10 bg-[#1f1f26]/60 p-5 shadow-2xl shadow-black/20 md:p-7">
            <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/80">Social Picks</p>
                <h2 className="text-2xl font-bold text-white">Instagram 靈感帳號</h2>
              </div>
              <p className="max-w-xl text-sm text-white/50">
                先選上方帳號，再看下方完整貼文區；目前三個帳號先共用同一個 widget 測試排版。
              </p>
            </div>

            <div className="mb-8 rounded-[1.75rem] border border-white/10 bg-black/20 px-4 py-6">
              <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12">
                {INSTAGRAM_ACCOUNTS.slice(0, 3).map((account) => {
                  const isActive = account.handle === activeInstagramAccount.handle;
                  return (
                    <button
                      key={account.handle}
                      type="button"
                      onClick={() => setActiveInstagramHandle(account.handle)}
                      aria-pressed={isActive}
                      className="group flex flex-col items-center gap-3"
                    >
                      <span
                        className={`flex h-20 w-20 items-center justify-center rounded-full border text-xl font-black transition-all md:h-24 md:w-24 ${
                          isActive
                            ? "border-cyan-300 bg-cyan-300 text-[#04141a] shadow-lg shadow-cyan-400/20"
                            : "border-white/15 bg-white/8 text-white group-hover:border-white/35 group-hover:bg-white/12"
                        }`}
                      >
                        <img
                          src={getInstagramAvatarUrl(account.handle)}
                          alt={`@${account.handle} avatar`}
                          className="h-full w-full rounded-full object-cover"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                            const fallback = event.currentTarget.nextElementSibling as HTMLSpanElement | null;
                            if (fallback) fallback.style.display = "flex";
                          }}
                        />
                        <span className="hidden h-full w-full items-center justify-center rounded-full">
                          {account.avatarLabel}
                        </span>
                      </span>
                      <span className={isActive ? "text-sm font-semibold text-white" : "text-sm text-white/55"}>
                        @{account.handle}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-4 md:p-6">
              <div
                key={`${activeInstagramAccount.handle}-${activeInstagramAccount.widgetPid ?? IG_WIDGET_PID}`}
                className={`commonninja_component pid-${activeInstagramAccount.widgetPid ?? IG_WIDGET_PID}`}
              />
            </div>
          </section>
        )}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 min-h-[300px]">
        {loading ? (
          <div className="col-span-full flex justify-center items-center gap-3 h-60 text-white/50">
            <Loader2 className="w-6 h-6 animate-spin" /> 載入推薦活動中…
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
            <span>此篩選條件暫無符合展演</span>
          </div>
        )}
        </section>

        {!loading && filtered.length > 0 && (
          <div className="mt-12 flex flex-col items-center gap-3">
            <p className="text-center text-white/45 text-sm">
              共 {filtered.length} 筆
            </p>
            <div className="flex items-center gap-2 text-xs text-white/70">
              <label htmlFor="home-page-size">每頁顯示</label>
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
                    {size} 筆
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
                上一頁
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
                    title={`第 ${token} 頁（${pageStart}-${pageEnd} 筆）`}
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
                下一頁
              </Button>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs text-white/70">
              <span>跳到第</span>
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
              <span>頁</span>
              <Button
                type="button"
                onClick={jumpToPage}
                className="rounded-full bg-white/10 px-4 text-white hover:bg-white/15"
              >
                前往
              </Button>
              <Button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                className="rounded-full bg-white/10 px-4 text-white hover:bg-white/15"
              >
                最後一頁
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
