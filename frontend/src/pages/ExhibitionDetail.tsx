import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Calendar,
  Clock3,
  Heart,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  Star,
  Sparkles,
  Ticket,
} from "lucide-react";
import type { Exhibition } from "@/data/mock";
import { getCollectionRecommendations, getHomeRecommendations } from "@/lib/api";
import { getFavorites, isFavorited, toggleFavorite } from "@/lib/favorites";
import { useAuth } from "@/lib/auth";

const FALLBACK_HERO = "https://images.unsplash.com/photo-1549490349-8643362247b5?w=1200&auto=format&fit=crop&q=80";
const SHOT_IMAGES = [
  "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=420&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1582653291997-079a1c04e5a1?w=420&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1605723517503-3cadb5818a0b?w=420&auto=format&fit=crop&q=80",
];

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  return dateStr.replace(" -> ", " — ");
}

export function ExhibitionDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const stateExhibition = (location.state as { exhibition?: Exhibition } | null)?.exhibition;

  const [exhibition, setExhibition] = useState<Exhibition | null>(stateExhibition ?? null);
  const [loading, setLoading] = useState(!stateExhibition);
  const [error, setError] = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [suggestions, setSuggestions] = useState<Exhibition[]>([]);

  useEffect(() => {
    setFavorited(id ? isFavorited(id) : false);
    const handleSync = () => setFavorited(id ? isFavorited(id) : false);
    window.addEventListener("favorites-changed", handleSync);
    return () => window.removeEventListener("favorites-changed", handleSync);
  }, [id]);

  useEffect(() => {
    if (exhibition || !id) return;
    const decoded = decodeURIComponent(id);

    const fromFavorites = getFavorites().find((e) => e.id === decoded);
    if (fromFavorites) {
      setExhibition(fromFavorites);
      setLoading(false);
      return;
    }

    getHomeRecommendations()
      .then((list) => {
        const match = list.find((e) => e.id === decoded);
        if (match) {
          setExhibition(match);
        } else {
          setError("找不到這筆展覽，可能已下架或連結失效。");
        }
      })
      .catch((err) => {
        console.error(err);
        setError("載入展覽資料失敗，請稍後再試。");
      })
      .finally(() => setLoading(false));
  }, [id, exhibition]);

  useEffect(() => {
    getHomeRecommendations()
      .then((list) => {
        if (!id) {
          setSuggestions(list.slice(0, 2));
          return;
        }
        const currentId = decodeURIComponent(id);
        setSuggestions(list.filter((e) => e.id !== currentId).slice(0, 2));
      })
      .catch(() => {
        getCollectionRecommendations()
          .then((data) => {
            const mapped = (data.collectionExhibitions ?? []) as Exhibition[];
            setSuggestions(mapped.slice(0, 2));
          })
          .catch(() => setSuggestions([]));
      });
  }, [id]);

  const heroImage = exhibition?.imageUrl || FALLBACK_HERO;
  const locationParts = useMemo(() => {
    if (!exhibition) return { venue: "", city: "" };
    const [venue, city] = exhibition.location.split("•").map((s) => s.trim());
    return { venue: venue ?? "", city: city ?? "" };
  }, [exhibition]);

  const handleToggleFavorite = async () => {
    if (!exhibition) return;
    if (!user) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    const next = await toggleFavorite(exhibition);
    setFavorited(next);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-white/60 gap-3">
        <Loader2 className="w-5 h-5 animate-spin" /> 載入展覽詳情中…
      </div>
    );
  }

  if (error || !exhibition) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-white/60">{error ?? "找不到這筆展覽"}</p>
        <Link to="/" className="px-5 py-2 rounded-full bg-purple-500/80 hover:bg-purple-500 text-white text-sm font-semibold transition-colors">
          回首頁
        </Link>
      </div>
    );
  }

  const isFree = exhibition.price === "FREE" || exhibition._meta?.isFree;
  const numericPrice = isFree
    ? "FREE"
    : typeof exhibition.price === "string" && exhibition.price
      ? exhibition.price
      : "NT$450";
  const venue = locationParts.venue || exhibition.location;
  const likes = Math.max(120, (exhibition.title.length * 13) % 300 + 120);

  return (
    <div className="w-full pb-24 bg-background">
      <section className="relative h-[665px] w-full overflow-hidden">
        <img
          src={heroImage}
          alt={exhibition.title}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = FALLBACK_HERO;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

        <button
          onClick={() => navigate(-1)}
          className="absolute top-5 left-6 flex items-center gap-1.5 text-sm text-white/85 hover:text-white px-3 py-1.5 rounded-md bg-black/40 border border-white/15"
        >
          <ArrowLeft className="w-4 h-4" /> 返回
        </button>

        <div className="absolute bottom-0 left-0 w-full px-8 pb-16">
          <div className="max-w-7xl mx-auto flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="px-4 py-1.5 rounded-full bg-secondary/10 border border-secondary/20 text-secondary text-xs font-bold tracking-wider uppercase">
              LIVE NOW
            </span>
            <span className="px-4 py-1.5 rounded-full bg-[#ff6b98]/10 border border-[#ff6b98]/20 text-[#ff6b98] text-xs font-bold tracking-wider uppercase">SELLING FAST</span>
          </div>

          <h1 className="text-6xl md:text-7xl font-extrabold tracking-tighter font-headline text-white max-w-4xl leading-[1.1]">
            {exhibition.title.includes("：") ? (
              <>
                {exhibition.title.split("：")[0]}：
                <br />
                <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  {exhibition.title.split("：")[1]}
                </span>
              </>
            ) : exhibition.title}
          </h1>

          <div className="flex items-center gap-6 mt-2">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-secondary" /> <span className="text-on-surface-variant font-medium">{formatDate(exhibition.dateStr)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-secondary" /> <span className="text-on-surface-variant font-medium">{venue}</span>
            </span>
          </div>
        </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-8 mt-12 grid grid-cols-12 gap-12">
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Panel title="AI 亮點摘要" icon={<Sparkles className="w-4 h-4 text-[#774AD9]" />}>
              <p
                className="text-sm text-white/80 leading-relaxed"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 6,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {exhibition.aiSummary || "本次展覽以城市夜色與聲光節奏為核心，結合場域敘事與沉浸式互動，適合喜歡視覺衝擊與新媒體藝術的觀眾。"}
              </p>
            </Panel>
            <Panel title="社群評分" icon={<Star className="w-4 h-4 text-[#ff6b98]" />}>
              <div className="flex items-end gap-1.5 mt-4 mb-2">
                {[28, 44, 52, 64, 58].map((h, idx) => (
                  <div
                    key={idx}
                    className="w-7 bg-primary rounded-sm opacity-90"
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>
              <div className="text-xs text-white/65 space-y-1">
                <div>熱度趨勢：上升</div>
                <div>關注值：{Math.min(5, Math.max(4.2, (likes % 100) / 100 + 4.1)).toFixed(1)} / 5.0</div>
              </div>
            </Panel>
          </div>

          <section className="flex flex-col gap-6">
            <h3 className="text-lg font-bold text-white mb-3">現場直擊</h3>
            <div className="grid grid-cols-3 gap-3">
              {SHOT_IMAGES.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={`現場直擊 ${idx + 1}`}
                  className="h-28 md:h-32 w-full object-cover rounded-md border border-white/10"
                />
              ))}
            </div>
          </section>

          <section className="rounded-xl bg-[#131318] p-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">藝術愛好者討論區</h3>
              <button className="text-xs text-secondary font-bold hover:underline">查看全部留言</button>
            </div>
            <div className="space-y-4">
              <CommentRow name="Lydia Wang" time="3 小時前" text="展場的互動體驗做得很好，尤其是聲光區讓我停留很久，推薦平日晚上來，人比較少。" />
              <CommentRow name="Chen Kei" time="5 小時前" text="場館動線清楚，拍照角度很多，建議先下載導覽地圖，才能完整跑完每個展區。" />
            </div>
          </section>
        </div>

        <aside className="col-span-12 lg:col-span-4 flex flex-col gap-8">
          <div className="p-8 rounded-xl bg-[#1f1f26] border border-[#48474d]/20 flex flex-col gap-6 sticky top-28">
            <div className="flex items-baseline justify-between mb-4 gap-3">
              <span className="text-xs text-on-surface-variant font-bold tracking-widest uppercase">Ticket Price</span>
              <span className={`text-4xl font-extrabold font-headline leading-none text-right whitespace-nowrap max-w-[62%] truncate ${isFree ? "text-secondary" : "text-white"}`}>
                {numericPrice}
              </span>
            </div>
            <p className="text-xs text-secondary font-medium mt-1">現正提供早鳥優惠至 11/10</p>

            <button
              disabled
              title="購票整合即將推出"
              className="w-full py-4 rounded-full bg-gradient-to-br from-primary to-[#d878ff] text-[#4f006d] font-bold text-lg transition-colors flex items-center justify-center gap-2 opacity-95 cursor-not-allowed"
            >
              立即預約門票 <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={handleToggleFavorite}
              className={`w-full py-4 rounded-full bg-[#25252c] text-primary font-bold flex items-center justify-center gap-2 transition-colors ${
                favorited
                  ? "ring-1 ring-primary/40"
                  : "hover:bg-[#2c2b33]"
              }`}
            >
              {user ? (
                favorited ? <><Heart className="w-4 h-4 fill-purple-400 text-purple-400" /> 已收藏</> : <><BookmarkPlus className="w-4 h-4" /> 加入收藏</>
              ) : (
                <><Lock className="w-4 h-4" /> 登入後即可收藏</>
              )}
            </button>
            <div className="pt-6 border-t border-[#48474d]/20 space-y-3 text-sm">
              <InfoMini icon={<Clock3 className="w-3.5 h-3.5" />} label="預估停留時間" value="90 - 120 分鐘" />
              <InfoMini icon={<Ticket className="w-3.5 h-3.5" />} label="場次限制" value="每 30 分鐘進場" />
              <InfoMini icon={<MessageCircle className="w-3.5 h-3.5" />} label="年齡限制" value="無限制" />
            </div>
          </div>

          <div className="rounded-xl overflow-hidden bg-[#131318] flex flex-col gap-4 p-1">
            <img
              src="https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=600&auto=format&fit=crop&q=80"
              alt="場館外觀"
              className="w-full h-48 object-cover rounded-lg"
            />
            <div className="p-4 flex flex-col gap-2">
              <h3 className="font-bold text-on-surface font-headline">{venue}</h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">{locationParts.city || "台北市"} ・捷運站步行 10 分鐘</p>
              <Link
                to="/map"
                className="mt-2 text-xs font-bold text-secondary flex items-center gap-1 group"
              >
                在 Google Maps 中開啟 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-bold text-white mb-3">你可能也會喜歡</h3>
            <div className="space-y-3">
              {suggestions.map((item) => (
                <Link
                  key={item.id}
                  to={`/exhibition/${encodeURIComponent(item.id)}`}
                  state={{ exhibition: item }}
                  className="flex gap-4 group cursor-pointer"
                >
                  <img src={item.imageUrl || FALLBACK_HERO} alt={item.title} className="w-20 h-20 object-cover rounded-lg shrink-0 group-hover:scale-105 transition-transform" />
                  <div className="flex flex-col justify-center gap-1 min-w-0">
                    <p className="text-xs text-[#ff6b98] font-bold line-clamp-1">{item.tags?.[0] || "藝術特展"}</p>
                    <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors line-clamp-2">{item.title}</p>
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-tight line-clamp-1">{item.location}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-md border border-white/10 bg-[#0f1727]/88 p-4 h-[220px] flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function CommentRow({ name, time, text }: { name: string; time: string; text: string }) {
  return (
    <div className="flex gap-3 border-t border-white/5 pt-3 first:border-t-0 first:pt-0">
      <div className="w-8 h-8 rounded-md bg-[#223459] flex items-center justify-center text-xs text-white/70">
        {name.slice(0, 1)}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-white/85">
          {name} <span className="text-white/40 text-xs ml-1">{time}</span>
        </p>
        <p className="text-xs text-white/65 mt-1 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function InfoMini({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-white/45">
        {icon}
        {label}
      </span>
      <span className="text-white/80">{value}</span>
    </div>
  );
}
