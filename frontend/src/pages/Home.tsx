import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Exhibition } from "@/data/mock";
import { getHomeRecommendations } from "@/lib/api";
import { ExhibitionCard } from "@/components/ExhibitionCard";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, ChevronDown, Loader2, ChevronUp, ArrowRight } from "lucide-react";

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
      <section className="relative w-full h-[716px] overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={hero?.imageUrl ?? "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1200&auto=format&fit=crop&q=80"}
            alt={hero?.title ?? "ExhiBeat"}
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
              <h1 className="text-6xl md:text-8xl font-headline font-extrabold tracking-tighter mb-6 leading-[0.9] text-white">
                異次元
                <br />
                <span className="text-primary italic">台北之光</span>
              </h1>
              <p className="max-w-2xl text-lg text-white/70 mb-8 font-body leading-relaxed">
                {hero.aiSummary || "結合 AI 運算與沉浸式光影，這場展覽將重新定義你對這座城市的認知。系統根據你的喜好分析：極高機率會讓你流連忘返。"}
              </p>
              <div className="flex items-center gap-6 mt-1 mb-8">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" /> {hero.dateStr.replace(" -> ", " — ")}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> {hero.location}
                </span>
              </div>
              <div className="flex gap-4">
                <Button size="lg" className="btn-gradient-safe rounded-full px-8 py-4 font-bold text-lg transition-all active:scale-95">
                  立即預訂
                </Button>
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
              <div className="flex gap-4">
                <Button size="lg" className="btn-gradient-safe rounded-full px-8 py-4 font-bold text-lg">
                  立即預訂
                </Button>
                <Button size="lg" variant="outline" className="bg-[#25252c]/70 text-white px-8 py-4 rounded-full font-bold text-lg border-white/10">
                  查看詳情
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="absolute right-8 bottom-16 flex flex-col gap-4">
          <div className="w-1 h-12 bg-primary rounded-full" />
          <div className="w-1 h-8 bg-[#25252c] rounded-full" />
          <div className="w-1 h-8 bg-[#25252c] rounded-full" />
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-8 py-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
        <div className="flex flex-wrap gap-3">
          {(["全部展演", "雨天備案", "夜間推薦", "親子友善", "限時免費"] as FilterKey[]).map(filter => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-5 py-2 rounded-full text-sm border transition-all duration-200 ${
                activeFilter === filter
                  ? "bg-secondary text-[#003a42] font-bold shadow-[0_0_12px_rgba(0,227,253,0.2)] border-transparent"
                  : "bg-[#131318] border-[#48474d]/40 text-white/70 hover:text-white"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
          <button
            onClick={() => setSortOpen(o => !o)}
            className="flex items-center gap-2 text-sm text-white/65 hover:text-white transition-colors"
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
            <ExhibitionCard key={exhibition.id} exhibition={exhibition} />
          ))
        ) : (
          <div className="col-span-full flex flex-col justify-center items-center h-60 gap-3 text-white/50">
            <span className="text-4xl opacity-30">🔍</span>
            <span>此篩選條件暫無符合展演</span>
          </div>
        )}
        </section>

        {!loading && hasMore && (
          <div className="mt-16 text-center">
            <Button
              variant="outline"
              className="px-10 py-4 border border-[#48474d]/30 rounded-full font-bold text-white/65 hover:border-primary hover:text-primary transition-all bg-transparent gap-2"
              onClick={() => setVisible(v => v + PAGE_SIZE)}
            >
              探索更多精彩展演 <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
        {!loading && !hasMore && filtered.length > 0 && (
          <p className="mt-12 text-center text-white/30 text-sm">已顯示全部 {filtered.length} 項推薦</p>
        )}
      </section>
    </div>
  );
}
