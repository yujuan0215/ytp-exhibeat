import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import type { Exhibition } from "@/data/mock";
import { getHomeRecommendations } from "@/lib/api";
import { ExhibitionCard } from "@/components/ExhibitionCard";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, ChevronDown, Loader2, ChevronUp, Search } from "lucide-react";
import { useDynamicTranslation } from "@/hooks/useDynamicTranslation";

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_OPTIONS = [12, 24, 36];
type PageToken = number | "...";

// Sort definitions — operate on filtered array
type SortKey = "relevancy" | "newest" | "oldest" | "ending_soon";
type HomeFilterKey = "all" | "free" | "family" | "digital" | "photo" | "museum";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "relevancy", label: "相關度優先" },
  { key: "newest", label: "最新發布" },
  { key: "oldest", label: "最舊發布" },
  { key: "ending_soon", label: "即將結束" },
];
const HOME_FILTERS: Array<{ key: HomeFilterKey; label: string }> = [
  { key: "all", label: "全部推薦" },
  { key: "free", label: "免費入場" },
  { key: "family", label: "親子友善" },
  { key: "digital", label: "數位/互動" },
  { key: "photo", label: "攝影影像" },
  { key: "museum", label: "美術館/博物館" },
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

function splitSearchTerms(query: string) {
  return normalizeSearchText(query).split(" ").filter(Boolean);
}

function matchKeywordSearch(exhibition: Exhibition, query: string) {
  const haystack = normalizeSearchText(
    [
      exhibition.title,
      exhibition.location,
      exhibition.aiSummary ?? "",
      exhibition.dateStr,
      ...(exhibition.tags ?? []),
    ].join(" "),
  );
  const terms = splitSearchTerms(query);
  if (!terms.length) return true;
  return terms.every((term) => haystack.includes(term));
}

function matchTagSearch(exhibition: Exhibition, query: string) {
  const raw = query.trim().replace(/^#+/, "");
  const keyword = normalizeSearchText(raw);
  if (!keyword) return true;
  const tags = (exhibition.tags ?? []).map((tag) => normalizeSearchText(String(tag).replace(/^#+/, "")));
  return tags.some((tag) => tag.includes(keyword));
}
function matchesHomeFilter(exhibition: Exhibition, filter: HomeFilterKey): boolean {
  if (filter === "all") return true;
  const haystack = [
    exhibition.title,
    exhibition.location,
    exhibition.aiSummary ?? "",
    exhibition.price ?? "",
    ...exhibition.tags,
  ].join(" ").toLowerCase();

  if (filter === "free") return exhibition._meta?.isFree === true || haystack.includes("free") || haystack.includes("免費");
  if (filter === "family") return /親子|兒童|孩子|family|child/.test(haystack);
  if (filter === "digital") return /數位|互動|沉浸|科技|光影|digital|interactive/.test(haystack);
  if (filter === "photo") return /攝影|影像|photo|film|image/.test(haystack);
  if (filter === "museum") return /美術館|博物館|museum|gallery/.test(haystack);
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

export function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [allExhibitions, setAllExhibitions] = useState<Exhibition[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(() => parseInitialPage(searchParams));
  const [pageSize, setPageSize] = useState(() => parseInitialPageSize(searchParams));
  const [pageInput, setPageInput] = useState(() => String(parseInitialPage(searchParams)));
  const [pageInputError, setPageInputError] = useState("");
  const [activeSort, setActiveSort] = useState<SortKey>("relevancy");
  const [activeFilter, setActiveFilter] = useState<HomeFilterKey>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOpen, setSortOpen] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const rawQuery = useMemo(() => new URLSearchParams(location.search).get("q") ?? "", [location.search]);
  const effectiveSearch = searchTerm.trim() || rawQuery.trim();
  const isTagSearch = effectiveSearch.startsWith("#");


  useEffect(() => {
    getHomeRecommendations({ limit: 120, offset: 0 })
      .then(data => {
        setAllExhibitions(data);
        setLoading(false);
      })
      .catch(err => { console.error(err); setLoading(false); });
  }, []);

  useEffect(() => { setCurrentPage(1); }, [activeSort, activeFilter, searchTerm]);

  const filtered = useMemo(() => {
    const searched = !effectiveSearch
      ? allExhibitions
      : allExhibitions.filter((exhibition) =>
          isTagSearch
            ? matchTagSearch(exhibition, effectiveSearch)
            : matchKeywordSearch(exhibition, effectiveSearch),
        );
    const matched = searched.filter((item) => matchesHomeFilter(item, activeFilter));
    return sortExhibitions(matched, activeSort);
  }, [activeFilter, activeSort, allExhibitions, effectiveSearch, isTagSearch]);

  const heroCandidates = useMemo(() => allExhibitions.slice(0, 3), [allExhibitions]);
  const hero = heroCandidates[heroIndex] ?? heroCandidates[0];
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const grid = filtered.slice(startIndex, startIndex + pageSize);
  const pageTokens = useMemo(() => buildPageTokens(totalPages, safeCurrentPage), [safeCurrentPage, totalPages]);
  const sharedHomeTexts = useMemo(
    () => [
      ...heroCandidates.map((item) => item.title),
      ...(hero ? [hero.aiSummary ?? "", hero.location] : []),
      ...grid.flatMap((item) => [item.title, item.location, item.aiSummary ?? ""]),
    ],
    [grid, hero, heroCandidates],
  );
  const translateHomeText = useDynamicTranslation(sharedHomeTexts, "home shared exhibition content");

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
            alt={hero ? translateHomeText(hero.title) : "ExhiBeat"}
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
            <span className="px-3 py-1 bg-[#ff6b98]/20 text-[#ff6b98] text-xs font-bold rounded-full border border-[#ff6b98]/30 backdrop-blur-md uppercase tracking-wider">
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
                <span data-dynamic-translate="true">{translateHomeText(hero.title)}</span>
              </h1>
              <p className="max-w-2xl text-lg text-white/70 mb-8 font-body leading-relaxed">
                <span data-dynamic-translate="true">{hero.aiSummary
                  ? translateHomeText(hero.aiSummary)
                  : "結合 AI 運算與沉浸式光影，這場展覽將重新定義你對這座城市的認知。系統根據你的喜好分析：極高機率會讓你流連忘返。"}</span>
              </p>
              <div className="flex items-center gap-6 mt-1 mb-8">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" /> {hero.dateStr.replace(" -> ", " — ")}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> <span data-dynamic-translate="true">{translateHomeText(hero.location)}</span>
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
                title={translateHomeText(item.title)}
              >
                <span className={`rounded-full transition-all ${isActive ? "w-1 h-12 bg-primary" : "w-1 h-8 bg-[#25252c] group-hover:bg-white/30"}`} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-8 py-12">
        <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="space-y-4">
            <div className="relative w-full md:max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                type="search"
                placeholder="搜尋展覽名稱、地點或需求（例：免費、親子、攝影）"
                className="h-11 w-full rounded-full border border-white/10 bg-[#1f1f26]/80 pl-9 pr-4 text-sm text-white shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {HOME_FILTERS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setActiveFilter(option.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    activeFilter === option.key
                      ? "bg-[#00d6ff] text-[#042028]"
                      : "bg-white/8 text-white/70 hover:bg-white/12 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

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
              translateText={translateHomeText}
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
              第 {safeCurrentPage} / {totalPages} 頁，每頁 {pageSize} 筆，本頁 {grid.length} 筆，共 {filtered.length} 項推薦
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
