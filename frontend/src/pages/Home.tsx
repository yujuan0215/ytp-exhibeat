import { useEffect, useState, useMemo } from "react";
import type { Exhibition } from "@/data/mock";
import { getHomeRecommendations } from "@/lib/api";
import { ExhibitionCard } from "@/components/ExhibitionCard";
import { Button } from "@/components/ui/button";
import { Sparkles, MapPin, Calendar, ChevronDown, Loader2, ChevronUp } from "lucide-react";

const PAGE_SIZE = 6;

// Filter definitions — each checks the raw exhibition fields
type FilterKey = "全部展演" | "雨天備案" | "夜間推薦" | "親子友善" | "限時免費";

const FILTER_PREDICATES: Record<FilterKey, (e: Exhibition) => boolean> = {
  "全部展演": () => true,
  "雨天備案": (e) => {
    const text = `${e.title} ${e.location} ${e.aiSummary} ${e.tags.join(" ")}`.toLowerCase();
    return text.includes("室內") || text.includes("博物館") || text.includes("美術館") || text.includes("科博") || text.includes("自然");
  },
  "夜間推薦": (e) => {
    const text = `${e.title} ${e.aiSummary} ${e.tags.join(" ")}`.toLowerCase();
    return text.includes("夜") || text.includes("光影") || text.includes("螢光") || text.includes("霓虹") || text.includes("燈");
  },
  "親子友善": (e) => {
    const text = `${e.title} ${e.aiSummary} ${e.tags.join(" ")}`.toLowerCase();
    return text.includes("親子") || text.includes("兒童") || text.includes("互動") || text.includes("科學") || text.includes("自然");
  },
  "限時免費": (e) => {
    const t = `${e.title} ${e.tags.join(" ")} ${e.aiSummary}`.toLowerCase();
    return e.price === "FREE" || t.includes("免費") || t.includes("免票");
  },
};

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

export function Home() {
  const [allExhibitions, setAllExhibitions] = useState<Exhibition[]>([]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("全部展演");
  const [activeSort, setActiveSort] = useState<SortKey>("relevancy");
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    getHomeRecommendations()
      .then(data => { setAllExhibitions(data); setLoading(false); })
      .catch(err => { console.error(err); setLoading(false); });
  }, []);

  // Reset visible count when filter/sort changes
  useEffect(() => { setVisible(PAGE_SIZE); }, [activeFilter, activeSort]);

  const filtered = useMemo(() => {
    const pred = FILTER_PREDICATES[activeFilter];
    return sortExhibitions(allExhibitions.filter(pred), activeSort);
  }, [allExhibitions, activeFilter, activeSort]);

  const hero = allExhibitions[0]; // Always top recommendation regardless of filter
  const grid = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  return (
    <div className="w-full pb-20">
      {/* ── Hero Section ── */}
      <section className="relative w-full h-[600px] rounded-bl-[4rem] rounded-br-[4rem] overflow-hidden mb-12">
        <div className="absolute inset-0">
          <img
            src={hero?.imageUrl ?? "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1200&auto=format&fit=crop&q=80"}
            alt={hero?.title ?? "ExhiBeat"}
            className="w-full h-full object-cover transition-all duration-700"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "https://images.unsplash.com/photo-1549490349-8643362247b5?w=1200&auto=format&fit=crop&q=80";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-transparent" />
        </div>

        <div className="relative h-full flex flex-col justify-center px-8 md:px-16 max-w-4xl">
          <div className="flex gap-3 mb-6">
            <span className="px-3 py-1 rounded-full bg-pink-500/20 text-pink-400 text-xs font-bold ring-1 ring-pink-500/50 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> AI 精選推薦
            </span>
            {hero && (
              <span className="px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-bold">
                {hero.location.split("•")[1]?.trim() ?? "台灣"}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-3 text-white/60">
              <Loader2 className="w-5 h-5 animate-spin" /><span>載入 AI 推薦中…</span>
            </div>
          ) : hero ? (
            <>
              <h1 className="text-5xl md:text-7xl font-black text-white mb-4 leading-tight tracking-tight">
                {hero.title.length > 20 ? (
                  <>
                    {hero.title.slice(0, hero.title.indexOf("：") > 0 ? hero.title.indexOf("：") : 12)}
                    <br />
                    <span className="inline-block py-2 drop-shadow-[0_0_15px_rgba(192,132,252,0.5)]">
                      <span 
                        className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-300"
                        style={{ WebkitBackgroundClip: 'text' }}
                      >
                        {hero.title.slice(hero.title.indexOf("：") > 0 ? hero.title.indexOf("：") : 12)}
                      </span>
                    </span>
                  </>
                ) : (
                  <span className="inline-block py-2 drop-shadow-[0_0_15px_rgba(192,132,252,0.5)]">
                    <span 
                      className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-300"
                      style={{ WebkitBackgroundClip: 'text' }}
                    >
                      {hero.title}
                    </span>
                  </span>
                )}
              </h1>
              {hero.aiSummary && (
                <p className="text-base text-white/75 max-w-xl mb-4 leading-relaxed">{hero.aiSummary}</p>
              )}
              <div className="flex flex-wrap gap-4 text-white/60 text-sm mb-8">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" /> {hero.dateStr.replace(" -> ", " — ")}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> {hero.location}
                </span>
              </div>
              <div className="flex gap-4">
                <Button size="lg" className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-full px-8 text-base">
                  立即預訂
                </Button>
                <Button size="lg" variant="outline" className="rounded-full px-8 text-base border-white/20 bg-black/20 backdrop-blur hover:bg-white/10 hover:text-white text-white">
                  查看詳情
                </Button>
              </div>
            </>
          ) : (
            <h1 className="text-6xl font-black text-white/40">無推薦資料</h1>
          )}
        </div>
      </section>

      {/* ── Filter & Sort Bar ── */}
      <section className="px-8 mb-8 flex flex-wrap items-center justify-between gap-4">
        {/* Filter tabs */}
        <div className="flex flex-wrap gap-3">
          {(["全部展演", "雨天備案", "夜間推薦", "親子友善", "限時免費"] as FilterKey[]).map(filter => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-6 py-2 rounded-full font-semibold text-sm transition-all duration-200 ${
                activeFilter === filter
                  ? "bg-[#0cf] text-black shadow-[0_0_12px_rgba(0,204,255,0.4)]"
                  : "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <div className="relative">
          <button
            onClick={() => setSortOpen(o => !o)}
            className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10"
          >
            <span className="opacity-60">≡</span>
            {SORT_OPTIONS.find(s => s.key === activeSort)?.label ?? "排序"}
            {sortOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-full mt-2 w-44 bg-[#1a1625] border border-white/10 rounded-2xl shadow-xl z-30 overflow-hidden">
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
      </section>

      {/* ── Exhibition Grid ── */}
      <section className="px-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 min-h-[300px]">
        {loading ? (
          <div className="col-span-full flex justify-center items-center gap-3 h-60 text-white/50">
            <Loader2 className="w-6 h-6 animate-spin" /> 載入推薦活動中…
          </div>
        ) : grid.length > 0 ? (
          grid.map(exhibition => (
            <ExhibitionCard key={exhibition.id} exhibition={exhibition} />
          ))
        ) : (
          <div className="col-span-full flex flex-col justify-center items-center h-60 gap-3 text-white/50">
            <span className="text-4xl opacity-30">🔍</span>
            <span>此篩選條件暫無符合展演</span>
          </div>
        )}
      </section>

      {/* ── Load More ── */}
      {!loading && hasMore && (
        <div className="mt-12 flex justify-center">
          <Button
            variant="outline"
            className="rounded-full px-8 border-white/20 text-white hover:bg-white/10 bg-transparent gap-2"
            onClick={() => setVisible(v => v + PAGE_SIZE)}
          >
            <ChevronDown className="w-4 h-4" /> 探索更多精彩展演
          </Button>
        </div>
      )}
      {!loading && !hasMore && filtered.length > 0 && (
        <p className="mt-12 text-center text-white/30 text-sm">已顯示全部 {filtered.length} 項推薦</p>
      )}
    </div>
  );
}
