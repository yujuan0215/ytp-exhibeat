import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock3,
  Heart,
  Loader2,
  Lock,
  MapPin,
  Plus,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import type { Exhibition } from "@/data/mock";
import { getCollectionRecommendations, getHomeRecommendations, listTagStats, type TagStat } from "@/lib/api";
import { getFavorites, isFavorited, toggleFavorite } from "@/lib/favorites";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { ExternalNavigationModal } from "@/components/ExternalNavigationModal";
import { AddToTripListMenu } from "@/components/collection/AddToTripListMenu";
import { SignInPrompt } from "@/components/SignInPrompt";

const FALLBACK_HERO = "https://images.unsplash.com/photo-1549490349-8643362247b5?w=1200&auto=format&fit=crop&q=80";
const CUSTOM_TAG_STORAGE_KEY = "exhibeat_custom_tags_by_exhibition_v1";
const HIDDEN_BASE_TAG_STORAGE_KEY = "exhibeat_hidden_base_tags_by_exhibition_v1";

const MOCK_COMMENTS = [
  { name: "Lydia Wang", time: "3 小時前", text: "展場的互動體驗做得很好，尤其是聲光區讓我停留很久，推薦平日晚上來，人比較少。" },
  { name: "Chen Kei", time: "5 小時前", text: "場館動線清楚，拍照角度很多，建議先下載導覽地圖，才能完整跑完每個展區。" },
  { name: "阿哲", time: "1 天前", text: "策展脈絡寫得很清楚，入口處的導覽影片建議先看，後面會更有感。" },
  { name: "Mina", time: "2 天前", text: "親子友善，推車動線 OK，假日下午人稍多但排隊可接受。" },
  { name: "老張", time: "3 天前", text: "周邊餐飲選擇多，看完展還能散步到河堤，整體行程很舒服。" },
  { name: "Sora", time: "4 天前", text: "語音導覽很加分，若英文版再完整一點會更適合帶外國朋友來。" },
  { name: "小K", time: "5 天前", text: "紀念品店選品有誠意，不是只有印 logo 的 T 恤，值得逛一下。" },
];
const SHOT_IMAGES = [
  "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=420&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1582653291997-079a1c04e5a1?w=420&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1605723517503-3cadb5818a0b?w=420&auto=format&fit=crop&q=80",
];

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  return dateStr.replace(" -> ", " — ");
}

/** 從票價字串解析新台幣數字（供價位分級）；無法解析時回傳 null。 */
function parseTwdPrice(raw: string): number | null {
  const s = raw.trim();
  if (!s || /^free$/i.test(s)) return null;
  const normalized = s.replace(/[,，]/g, "");
  const range = normalized.match(/(\d+)\s*[–—-]\s*(\d+)/);
  if (range) {
    const a = parseInt(range[1], 10);
    const b = parseInt(range[2], 10);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.round((a + b) / 2);
  }
  const nums = normalized.match(/\d+/g)?.map((x) => parseInt(x, 10)).filter(Number.isFinite) ?? [];
  if (!nums.length) return null;
  return Math.max(...nums);
}

function normalizeHashtagInput(value: string): string {
  const stripped = String(value).trim().replace(/^#+/, "").replace(/\s+/g, "");
  if (!stripped) return "";
  return `#${stripped}`;
}

function loadCustomTagMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(CUSTOM_TAG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const normalized: Record<string, string[]> = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (!Array.isArray(value)) return;
      normalized[key] = value
        .map((item) => normalizeHashtagInput(String(item ?? "")))
        .filter(Boolean);
    });
    return normalized;
  } catch {
    return {};
  }
}

function saveCustomTagsForExhibition(exhibitionId: string, tags: string[]) {
  const map = loadCustomTagMap();
  map[exhibitionId] = Array.from(new Set(tags.map((item) => normalizeHashtagInput(item)).filter(Boolean)));
  localStorage.setItem(CUSTOM_TAG_STORAGE_KEY, JSON.stringify(map));
}

function loadHiddenBaseTagMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(HIDDEN_BASE_TAG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const normalized: Record<string, string[]> = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (!Array.isArray(value)) return;
      normalized[key] = value
        .map((item) => normalizeHashtagInput(String(item ?? "")))
        .filter(Boolean);
    });
    return normalized;
  } catch {
    return {};
  }
}

function saveHiddenBaseTagsForExhibition(exhibitionId: string, tags: string[]) {
  const map = loadHiddenBaseTagMap();
  map[exhibitionId] = Array.from(new Set(tags.map((item) => normalizeHashtagInput(item)).filter(Boolean)));
  localStorage.setItem(HIDDEN_BASE_TAG_STORAGE_KEY, JSON.stringify(map));
}

/**
 * 價位分級（新台幣，單人票常見區間）：
 * - 低：未滿 400 → ＄
 * - 中：400–749 → ＄＄
 * - 高：≥ 750 → ＄＄＄
 * 無法解析時視為中價位。
 */
function getPriceTierMeta(
  isFree: boolean,
  priceLabel: string,
): { kind: "free" } | { kind: "paid"; count: 1 | 2 | 3 } {
  if (isFree) return { kind: "free" };
  const n = parseTwdPrice(priceLabel);
  if (n == null || n <= 0) return { kind: "paid", count: 2 };
  if (n < 400) return { kind: "paid", count: 1 };
  if (n < 750) return { kind: "paid", count: 2 };
  return { kind: "paid", count: 3 };
}

export function ExhibitionDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();
  const isV1 = theme === "v1";

  const stateExhibition = (location.state as { exhibition?: Exhibition } | null)?.exhibition;

  const [exhibition, setExhibition] = useState<Exhibition | null>(stateExhibition ?? null);
  const [loading, setLoading] = useState(!stateExhibition);
  const [error, setError] = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [suggestions, setSuggestions] = useState<Exhibition[]>([]);
  const [externalModalOpen, setExternalModalOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [, setFavoritesTick] = useState(0);
  const [ratingTrendOpen, setRatingTrendOpen] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [tagStats, setTagStats] = useState<TagStat[]>([]);
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [hiddenBaseTags, setHiddenBaseTags] = useState<string[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [activeTagOptionIndex, setActiveTagOptionIndex] = useState(-1);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const venueMapRef = useRef<HTMLElement | null>(null);
  const tagPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFavorited(id ? isFavorited(id) : false);
    const handleSync = () => {
      setFavorited(id ? isFavorited(id) : false);
      setFavoritesTick((t) => t + 1);
    };
    window.addEventListener("favorites-changed", handleSync);
    return () => window.removeEventListener("favorites-changed", handleSync);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const decoded = decodeURIComponent(id);

    const fromFavorites = getFavorites().find((e) => e.id === decoded);
    if (fromFavorites && !exhibition) {
      setExhibition(fromFavorites);
    }
    if (!exhibition && !fromFavorites) setLoading(true);

    getHomeRecommendations({ limit: 5000, offset: 0 })
      .then((list) => {
        const match = list.find((e) => e.id === decoded);
        if (match) {
          setExhibition(match);
          setError(null);
        } else {
          setError((prev) => prev ?? "找不到這筆展覽，可能已下架或連結失效。");
        }
      })
      .catch((err) => {
        console.error(err);
        setError((prev) => prev ?? "載入展覽資料失敗，請稍後再試。");
      })
      .finally(() => {
        if (!exhibition && !fromFavorites) setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    getHomeRecommendations()
      .then((list) => {
        if (!id) {
          setSuggestions(list.slice(0, 6));
          return;
        }
        const currentId = decodeURIComponent(id);
        setSuggestions(list.filter((e) => e.id !== currentId).slice(0, 6));
      })
      .catch(() => {
        getCollectionRecommendations()
          .then((data) => {
            const mapped = (data.collectionExhibitions ?? []) as Exhibition[];
            setSuggestions(mapped.slice(0, 6));
          })
          .catch(() => setSuggestions([]));
      });
  }, [id]);

  useEffect(() => {
    listTagStats()
      .then((rows) => setTagStats(rows))
      .catch(() => setTagStats([]));
  }, []);

  useEffect(() => {
    if (!exhibition?.id) return;
    const customMap = loadCustomTagMap();
    const hiddenMap = loadHiddenBaseTagMap();
    setCustomTags(Array.isArray(customMap[exhibition.id]) ? customMap[exhibition.id] : []);
    setHiddenBaseTags(Array.isArray(hiddenMap[exhibition.id]) ? hiddenMap[exhibition.id] : []);
  }, [exhibition?.id]);

  useEffect(() => {
    if (!tagPickerOpen) return;
    const onDocumentMouseDown = (event: globalThis.MouseEvent) => {
      if (!tagPickerRef.current?.contains(event.target as Node)) {
        setTagPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [tagPickerOpen]);

  const galleryImages = useMemo(() => {
    const imageSet = new Set<string>();
    if (exhibition?.imageUrl) imageSet.add(exhibition.imageUrl);
    const fromMeta = exhibition?._meta?.allImages ?? [];
    if (Array.isArray(fromMeta)) {
      fromMeta.forEach((img) => {
        if (img) imageSet.add(img);
      });
    }
    SHOT_IMAGES.forEach((img) => imageSet.add(img));
    imageSet.add(FALLBACK_HERO);
    return Array.from(imageSet);
  }, [exhibition]);
  const heroImage = galleryImages[activeImageIndex] ?? FALLBACK_HERO;
  const locationParts = useMemo(() => {
    if (!exhibition) return { venue: "", city: "" };
    const [venue, city] = exhibition.location.split("•").map((s) => s.trim());
    return { venue: venue ?? "", city: city ?? "" };
  }, [exhibition]);

  const likes = useMemo(() => {
    if (!exhibition) return 120;
    return Math.max(120, (exhibition.title.length * 13) % 300 + 120);
  }, [exhibition]);

  const communityRating = useMemo(
    () => Math.min(5, Math.max(4.2, (likes % 100) / 100 + 4.1)),
    [likes],
  );

  const trendWeek = useMemo(() => {
    if (!exhibition) return [] as { label: string; barH: number; score: number }[];
    const seed = exhibition.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const labels = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];
    return labels.map((label, i) => {
      const barH = 28 + ((seed + likes + i * 23) % 48);
      const score = Math.min(5, Math.max(3.4, 3.8 + (((seed >> (i % 4)) ^ (likes + i)) % 120) / 200));
      return { label, barH, score };
    });
  }, [exhibition, likes]);

  const baseTags = useMemo(() => {
    if (!exhibition) return [];
    return (exhibition.tags ?? [])
      .map((t) => normalizeHashtagInput(t))
      .filter(Boolean);
  }, [exhibition]);

  const pixivStyleTags = useMemo(() => {
    if (!exhibition) return [];
    const hiddenSet = new Set(hiddenBaseTags.map((tag) => normalizeHashtagInput(tag)).filter(Boolean));
    const raw = [...baseTags.filter((tag) => !hiddenSet.has(tag)), ...customTags]
      .map((t) => normalizeHashtagInput(t))
      .filter(Boolean);
    return Array.from(new Set(raw));
  }, [baseTags, customTags, exhibition, hiddenBaseTags]);

  const normalizedTagQuery = useMemo(
    () => String(tagInput).trim().replace(/^#+/, "").toLowerCase(),
    [tagInput],
  );

  const tagAutocompleteOptions = useMemo(() => {
    const rows = normalizedTagQuery
      ? tagStats.filter((row) => row.tag.replace(/^#+/, "").toLowerCase().startsWith(normalizedTagQuery))
      : tagStats;
    return rows.slice(0, 30);
  }, [normalizedTagQuery, tagStats]);

  const currentTagSet = useMemo(
    () => new Set(pixivStyleTags.map((tag) => normalizeHashtagInput(tag)).filter(Boolean)),
    [pixivStyleTags],
  );

  useEffect(() => {
    if (!tagPickerOpen) {
      setActiveTagOptionIndex(-1);
      return;
    }
    setActiveTagOptionIndex((prev) => {
      if (tagAutocompleteOptions.length === 0) return -1;
      if (prev < 0) return -1;
      return prev >= tagAutocompleteOptions.length ? tagAutocompleteOptions.length - 1 : prev;
    });
  }, [tagAutocompleteOptions, tagPickerOpen]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [galleryImages]);

  const handleToggleFavorite = async () => {
    if (!exhibition) return;
    if (!user) {
      setShowSignInPrompt(true);
      return;
    }
    const next = await toggleFavorite(exhibition);
    setFavorited(next);
  };

  const handleSuggestionFavoriteClick = async (e: MouseEvent, item: Exhibition) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      setShowSignInPrompt(true);
      return;
    }
    await toggleFavorite(item);
    setFavoritesTick((t) => t + 1);
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

  const isFree = exhibition.price === "FREE" || Boolean(exhibition._meta?.isFree);
  const numericPrice = isFree
    ? "FREE"
    : typeof exhibition.price === "string" && exhibition.price
      ? exhibition.price
      : "NT$450";
  const venue = locationParts.venue || exhibition.location;
  const actionLabel = isFree ? "前往展演資訊（外部）" : "前往購票連結（外部）";
  const actionHint = isFree ? "免費展演通常可直接入場，請以主辦單位公告為準。" : "購票前將導向外部票務平台。";

  const priceTierMeta = getPriceTierMeta(isFree, typeof numericPrice === "string" ? numericPrice : String(numericPrice));
  const aiSummaryText =
    exhibition.aiSummary ||
    "本次展覽以城市夜色與聲光節奏為核心，結合場域敘事與沉浸式互動，適合喜歡視覺衝擊與新媒體藝術的觀眾。";
  const aiDisplayText = aiSummaryText;
  const AI_SUMMARY_LIMIT = 100;
  const aiSummaryTooLong = aiDisplayText.length > AI_SUMMARY_LIMIT;
  const aiSummaryPreview = aiSummaryTooLong
    ? `${aiDisplayText.slice(0, AI_SUMMARY_LIMIT).trimEnd()}...`
    : aiDisplayText;

  const handleExternalAction = () => setExternalModalOpen(true);
  const handlePrevImage = () => {
    setActiveImageIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);
  };
  const handleNextImage = () => {
    setActiveImageIndex((prev) => (prev + 1) % galleryImages.length);
  };

  const scrollToVenueMap = () => {
    venueMapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const appendCustomTag = (rawValue: string) => {
    if (!exhibition?.id) return;
    const normalized = normalizeHashtagInput(rawValue);
    if (!normalized) return;
    const existingBaseTags = new Set(baseTags);
    setCustomTags((prev) => {
      if (prev.includes(normalized) || existingBaseTags.has(normalized)) return prev;
      const next = [...prev, normalized];
      saveCustomTagsForExhibition(exhibition.id, next);
      return next;
    });
    setTagInput("");
  };

  const handleCreateCustomTag = () => {
    appendCustomTag(tagInput);
  };

  const handleAddTagFromOption = (rawValue: string) => {
    if (!exhibition?.id) return;
    const normalized = normalizeHashtagInput(rawValue);
    if (!normalized) return;
    if (baseTags.includes(normalized)) {
      setHiddenBaseTags((prev) => {
        const next = prev.filter((tag) => normalizeHashtagInput(tag) !== normalized);
        saveHiddenBaseTagsForExhibition(exhibition.id, next);
        return next;
      });
      return;
    }
    appendCustomTag(normalized);
  };

  const handleRemoveCurrentTag = (rawValue: string) => {
    if (!exhibition?.id) return;
    const normalized = normalizeHashtagInput(rawValue);
    if (!normalized) return;
    if (baseTags.includes(normalized)) {
      setHiddenBaseTags((prev) => {
        if (prev.includes(normalized)) return prev;
        const next = [...prev, normalized];
        saveHiddenBaseTagsForExhibition(exhibition.id, next);
        return next;
      });
      return;
    }
    setCustomTags((prev) => {
      const next = prev.filter((tag) => normalizeHashtagInput(tag) !== normalized);
      saveCustomTagsForExhibition(exhibition.id, next);
      return next;
    });
  };

  const handleSubmitFromEditor = () => {
    if (activeTagOptionIndex >= 0 && activeTagOptionIndex < tagAutocompleteOptions.length) {
      handleAddTagFromOption(tagAutocompleteOptions[activeTagOptionIndex].tag);
      return;
    }
    handleCreateCustomTag();
  };

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

        {galleryImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrevImage}
              className="absolute left-5 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-sm transition-colors flex items-center justify-center"
              aria-label="上一張圖片"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleNextImage}
              className="absolute right-5 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-sm transition-colors flex items-center justify-center"
              aria-label="下一張圖片"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </>
        )}

        <button
          onClick={() => navigate(-1)}
          className="absolute top-5 left-6 flex items-center gap-1.5 text-sm text-white/85 hover:text-white px-3 py-1.5 rounded-md bg-black/40 border border-white/15"
        >
          <ArrowLeft className="w-4 h-4" /> 返回
        </button>

        <div className="absolute bottom-0 left-0 w-full px-8 pb-10">
          <div className="max-w-7xl mx-auto flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-6 mt-2 text-white/90">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-secondary" /> <span className="font-medium">{formatDate(exhibition.dateStr)}</span>
            </span>
            <button
              type="button"
              onClick={scrollToVenueMap}
              className="flex items-center gap-1.5 text-left font-medium underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-sm"
            >
              <MapPin className="w-4 h-4 text-secondary shrink-0" /> <span className="line-clamp-2">{venue}</span>
            </button>
          </div>
        </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-8 mt-8">
        <div className="border-b border-white/10 pb-6">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight font-headline text-white leading-tight">
            {exhibition.title}
          </h1>
          <div className="mt-5 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="grid grid-cols-3 gap-3 w-full md:w-auto">
              <button
                type="button"
                onClick={() => setRatingTrendOpen(true)}
                className="h-11 min-w-[148px] rounded-lg border border-white/10 bg-[#1f1f26] px-3 text-left transition-colors hover:border-secondary/40 hover:bg-[#252532] focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50"
                aria-haspopup="dialog"
                aria-expanded={ratingTrendOpen}
              >
                <span className="sr-only">評分</span>
                <div className="flex h-full items-center gap-0.5" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((i) => {
                    const d = communityRating - i;
                    if (d >= 1) {
                      return <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />;
                    }
                    if (d >= 0.5) {
                      return <Star key={i} className="h-5 w-5 fill-amber-400/55 text-amber-400" />;
                    }
                    return <Star key={i} className="h-5 w-5 fill-transparent text-white/30" />;
                  })}
                </div>
                <span className="sr-only">
                  {communityRating.toFixed(1)} 星，滿分 5 星
                </span>
              </button>
              <div className="h-11 min-w-[148px] rounded-lg border border-white/10 bg-[#1f1f26] px-3">
                <span className="sr-only">價錢</span>
                {priceTierMeta.kind === "free" ? (
                  <div
                    className="relative flex h-full w-full items-center justify-center"
                    aria-label="免費展演（已劃叉的金錢符號表示不需付費）"
                  >
                    <span className="text-2xl font-bold leading-none tracking-tight text-secondary/95" aria-hidden="true">
                      ＄
                    </span>
                    <X
                      className="pointer-events-none absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-secondary drop-shadow-[0_0_2px_rgba(0,0,0,0.6)]"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <p
                      className="text-2xl font-bold leading-none tracking-tight text-secondary/95"
                      aria-label={`價位：${"＄".repeat(priceTierMeta.count)}`}
                    >
                      {"＄".repeat(priceTierMeta.count)}
                    </p>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  navigate(`/map?eventId=${encodeURIComponent(exhibition.id)}`, {
                    state: { prefillEvent: exhibition },
                  })
                }
                className="h-11 min-w-[148px] rounded-lg border border-white/10 bg-[#1f1f26] px-3 text-left transition-colors hover:border-secondary/40 hover:bg-[#252532] focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50"
                title="查看地圖"
                aria-label="查看地圖"
              >
                <div className="flex h-full items-center justify-center gap-2 text-white/90">
                
                  <span className="text-sm font-semibold">查看地圖</span>  
                  <MapPin className="h-4 w-4 text-secondary" />
                </div>
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleToggleFavorite}
                className={`h-11 w-11 rounded-full bg-[#25252c] text-primary flex items-center justify-center transition-colors ${
                  favorited ? "ring-1 ring-primary/40" : "hover:bg-[#2c2b33]"
                }`}
                title={user ? (favorited ? "已收藏" : "加入收藏") : "登入後即可收藏"}
                aria-label={user ? (favorited ? "已收藏" : "加入收藏") : "登入後即可收藏"}
              >
                {user ? (
                  <Heart className={`w-5 h-5 ${favorited ? "fill-purple-400 text-purple-400" : ""}`} />
                ) : (
                  <Lock className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 mt-8 grid grid-cols-12 gap-12">
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-12">
          <section className="rounded-xl border border-[#48474d]/20 bg-[#1f1f26] p-5">
            <div ref={tagPickerRef} className="relative border-b border-white/10 pb-9">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/40">標籤</p>
              <div className="-mx-1 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
                <div className="flex min-h-[1.75rem] flex-nowrap items-center gap-x-3 px-1 py-0.5">
                  {pixivStyleTags.length > 0 ? (
                    pixivStyleTags.map((tag, i) => (
                      <button
                        key={`${tag}-${i}`}
                        type="button"
                        className="shrink-0 whitespace-nowrap rounded px-1 py-0.5 text-left text-[13px] leading-snug text-[#8eb4d4] transition-colors hover:bg-[#2a3244] hover:text-[#a8d4f0] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#8eb4d4]/60"
                      >
                        {tag}
                      </button>
                    ))
                  ) : (
                    <span className="text-[12px] text-white/40">尚未設定標籤</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTagPickerOpen((open) => !open)}
                className="absolute bottom-1 right-0 flex h-7 w-7 items-center justify-center rounded-full border border-[#8eb4d4]/45 bg-[#2a3244] text-[#a8d4f0] transition-colors hover:bg-[#33415a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8eb4d4]/70"
                aria-label="新增 hashtag"
                title="新增 hashtag"
              >
                <Plus className="h-4 w-4" />
              </button>

              {tagPickerOpen && (
                <div className="absolute right-0 top-full z-30 mt-3 w-full max-w-md rounded-xl border border-white/10 bg-[#141a28] p-3 shadow-xl">
                  <p className="mb-2 text-xs font-semibold text-white/70">標籤管理</p>
                  <div className="mb-3 rounded-md border border-white/10 bg-[#101726] p-2">
                    <p className="mb-2 text-[11px] text-white/45">目前標籤（可刪除）</p>
                    <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                      {pixivStyleTags.length > 0 ? (
                        pixivStyleTags.map((tag) => (
                          <button
                            key={`manage-current-${tag}`}
                            type="button"
                            onClick={() => handleRemoveCurrentTag(tag)}
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#1f1f26] px-2 py-1 text-xs text-white/80 hover:bg-[#2b3345]"
                            title="刪除此標籤"
                          >
                            <span>{tag}</span>
                            <X className="h-3 w-3 text-white/60" />
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-white/45">目前沒有標籤</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => {
                        setTagInput(e.target.value);
                        setActiveTagOptionIndex(-1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          if (tagAutocompleteOptions.length === 0) return;
                          e.preventDefault();
                          setActiveTagOptionIndex((prev) => (prev + 1) % tagAutocompleteOptions.length);
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          if (tagAutocompleteOptions.length === 0) return;
                          e.preventDefault();
                          setActiveTagOptionIndex((prev) =>
                            prev <= 0 ? tagAutocompleteOptions.length - 1 : prev - 1,
                          );
                          return;
                        }
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSubmitFromEditor();
                          return;
                        }
                        if (e.key === "Escape") {
                          setTagPickerOpen(false);
                        }
                      }}
                      placeholder="#輸入標籤前幾個字"
                      className="h-9 flex-1 rounded-md border border-white/10 bg-[#1f1f26] px-3 text-sm text-white outline-none focus:border-[#8eb4d4]/70"
                    />
                    <button
                      type="button"
                      onClick={handleCreateCustomTag}
                      className="h-9 rounded-md border border-[#8eb4d4]/45 px-3 text-xs font-semibold text-[#a8d4f0] hover:bg-[#2a3244]"
                    >
                      新增
                    </button>
                  </div>

                  <div className="mt-2 rounded-md border border-white/10 bg-[#101726]">
                    <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[11px] text-white/45">
                      <span>所有標籤</span>
                      <span>展演數量</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {tagAutocompleteOptions.length > 0 ? (
                        tagAutocompleteOptions.map((row, index) => {
                          const normalized = normalizeHashtagInput(row.tag);
                          const exists = currentTagSet.has(normalized);
                          return (
                            <button
                              key={row.tag}
                              type="button"
                              onClick={() => handleAddTagFromOption(row.tag)}
                              onMouseEnter={() => setActiveTagOptionIndex(index)}
                              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                                exists
                                  ? "text-white/40"
                                  : "text-white/85 hover:bg-white/5"
                              } ${
                                activeTagOptionIndex === index ? "bg-white/10" : ""
                              }`}
                              disabled={exists}
                            >
                              <span>{row.tag}</span>
                              <span className="text-xs text-white/50">{row.count}</span>
                            </button>
                          );
                        })
                      ) : (
                        <p className="px-3 py-2 text-xs text-white/45">無符合標籤</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-5 text-sm text-white/80">
              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start lg:gap-x-8 lg:gap-y-3">
                <p className="flex min-w-0 items-center gap-2 text-white/90">
                  <Calendar className="h-4 w-4 shrink-0 text-[#8eb4d4]" />
                  <span className="whitespace-nowrap">{formatDate(exhibition.dateStr)}</span>
                </p>
                <button
                  type="button"
                  onClick={scrollToVenueMap}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left text-white/90 hover:text-white lg:min-w-[10rem] lg:max-w-md rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8eb4d4]/50"
                >
                  <MapPin className="h-4 w-4 shrink-0 text-[#8eb4d4] mt-0.5" />
                  <span className="leading-snug underline-offset-2 hover:underline">{exhibition.location}</span>
                </button>
                <p className="flex min-w-0 items-center gap-2 text-white/90 lg:shrink-0">
                  <Clock3 className="h-4 w-4 shrink-0 text-[#8eb4d4]" />
                  <span>
                    <span className="text-white/55">參觀時間</span>{" "}
                    <span className="text-white/90">約 90 – 120 分鐘</span>
                  </span>
                </p>
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/45">票價</span>
                  <span className={`text-2xl font-extrabold font-headline ${isFree ? "text-secondary" : "text-white"}`}>
                    {numericPrice}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#8eb4d4]/90">{actionHint}</p>
                <button
                  type="button"
                  onClick={handleExternalAction}
                  title={actionLabel}
                  className="mt-4 w-full sm:w-auto px-6 py-3 rounded-full btn-gradient-safe font-bold transition-colors flex items-center justify-center gap-2"
                >
                  {actionLabel} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-center gap-2 border-t border-[#48474d]/20 pt-4">
                <span className="text-xs text-on-surface-variant">行程清單</span>
                <AddToTripListMenu kind="event" exhibition={exhibition} align="end" />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-[#0f1727]/88 p-6">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#774AD9]" />
              <h3 className="text-base font-bold text-white">AI 展覽簡介</h3>
            </div>
            <p className="text-sm leading-relaxed text-white/80">
              {aiExpanded ? aiDisplayText : aiSummaryPreview}
            </p>
            {aiSummaryTooLong && (
              <button
                type="button"
                onClick={() => setAiExpanded((v) => !v)}
                className="mt-3 text-xs font-bold text-secondary hover:underline"
              >
                {aiExpanded ? "收合內容" : "更多內容"}
              </button>
            )}
          </section>

          <section
            ref={venueMapRef}
            id="exhibition-venue-map"
            className="scroll-mt-24 rounded-xl overflow-hidden bg-[#131318] border border-white/10 flex flex-col gap-4 p-4"
          >
            <h3 className="text-sm font-bold text-white px-1">地點與 Google Maps</h3>
            <img
              src="https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=900&auto=format&fit=crop&q=80"
              alt="場館外觀"
              className="w-full h-64 object-cover rounded-lg"
            />
            <div className="px-1 pb-1 flex flex-col gap-2">
              <h4 className="font-bold text-on-surface font-headline">{venue}</h4>
              <p className="text-xs text-on-surface-variant leading-relaxed">{locationParts.city || "台北市"} ・捷運站步行 10 分鐘</p>
              <Link
                to="/map"
                className="mt-2 text-xs font-bold text-secondary flex items-center gap-1 group"
              >
                在 Google Maps 中開啟 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </section>

          <section className="rounded-xl bg-[#131318] p-8">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-white">藝術愛好者討論區</h3>
              <p className="mt-1 text-xs text-white/50">
                {commentsExpanded
                  ? `已顯示全部 ${MOCK_COMMENTS.length} 則留言`
                  : `目前顯示前 5 則，共 ${MOCK_COMMENTS.length} 則留言`}
              </p>
            </div>
            <div className="space-y-0">
              {(commentsExpanded ? MOCK_COMMENTS : MOCK_COMMENTS.slice(0, 5)).map((c, i) => (
                <CommentRow key={`comment-${i}`} name={c.name} time={c.time} text={c.text} />
              ))}
            </div>
            {MOCK_COMMENTS.length > 5 && (
              <button
                type="button"
                onClick={() => setCommentsExpanded((v) => !v)}
                className="mt-4 text-sm font-bold text-secondary hover:underline"
              >
                {commentsExpanded ? "收合留言" : "更多留言"}
              </button>
            )}
          </section>
        </div>

        <aside className="col-span-12 lg:col-span-4">
          <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-[#0f0f1a] p-5">
            <header className="mb-4">
              <h3 className="text-lg font-bold text-white">推薦展演活動</h3>
            </header>
            <div className="space-y-3">
              {suggestions.map((item) => (
                <Link
                  key={item.id}
                  to={`/exhibition/${encodeURIComponent(item.id)}`}
                  state={{ exhibition: item }}
                  className={`block w-full border p-3 text-left transition-colors border-white/5 bg-[#171725] hover:bg-[#1b1b2b] ${isV1 ? "rounded-md" : "rounded-2xl"}`}
                >
                  <div className="flex gap-3">
                    <img
                      src={item.imageUrl || FALLBACK_HERO}
                      alt={item.title}
                      className={`h-20 w-24 shrink-0 object-cover ${isV1 ? "rounded-md" : "rounded-xl"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-bold text-white">{item.title}</p>
                        <button
                          type="button"
                          onClick={(e) => void handleSuggestionFavoriteClick(e, item)}
                          title={user ? (isFavorited(item.id) ? "取消收藏" : "加入收藏") : "請先登入以使用收藏"}
                          className="shrink-0 p-1"
                        >
                          {user ? (
                            <Heart
                              className={`h-4 w-4 transition-all ${
                                isFavorited(item.id) ? "fill-purple-500 text-purple-500" : "text-white/50 hover:text-white/80"
                              }`}
                            />
                          ) : (
                            <Lock className="h-4 w-4 text-white/60 hover:text-white/85" />
                          )}
                        </button>
                      </div>
                      <p className="mb-1 flex items-center gap-1 text-[11px] text-white/60">
                        <MapPin className="h-3 w-3 shrink-0" /> <span className="line-clamp-1">{item.location}</span>
                      </p>
                      <p className="flex items-center gap-1 text-[11px] text-white/50">
                        <Clock3 className="h-3 w-3 shrink-0" />{" "}
                        {item.dateStr ? item.dateStr.replace(" -> ", " — ") : "—"}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
      <ExternalNavigationModal
        open={externalModalOpen}
        title="即將前往外部平台"
        description="此外部展演/購票連結功能仍在建置中。未來將導向主辦或票務平台，敬請期待。"
        confirmLabel="我知道了"
        cancelLabel="關閉"
        onConfirm={() => setExternalModalOpen(false)}
        onCancel={() => setExternalModalOpen(false)}
      />

      {ratingTrendOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4"
          role="presentation"
          onClick={() => setRatingTrendOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#181622] p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rating-trend-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <TrendingUp className="h-6 w-6 shrink-0 text-secondary mt-0.5" />
                <div className="min-w-0">
                  <h3 id="rating-trend-title" className="text-lg font-bold text-white">
                    社群評分趨勢
                  </h3>
                  <p className="mt-1 text-xs text-white/55 leading-relaxed">
                    最近 7 天：依討論量、收藏與頁面停留換算之熱度指標（示意）
                  </p>
                  <p className="mt-2 text-sm text-white/80">
                    目前綜合評分 <span className="font-bold text-secondary">{communityRating.toFixed(1)}</span> / 5.0
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRatingTrendOpen(false)}
                className="shrink-0 rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                aria-label="關閉"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 flex h-44 items-end justify-between gap-1 border-t border-white/10 pt-4">
              {trendWeek.map(({ label, barH, score }) => (
                <div key={label} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[10px] font-medium text-secondary">{score.toFixed(1)}</span>
                  <div
                    className="w-full max-w-[2.25rem] rounded-t-sm bg-gradient-to-t from-primary/30 to-primary/90 mx-auto"
                    style={{ height: `${barH}px` }}
                  />
                  <span className="text-[10px] text-white/50">{label}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setRatingTrendOpen(false)}
                className="rounded-full bg-[#774AD9] px-5 py-2 text-sm font-semibold text-white hover:bg-[#6a41c0] transition-colors"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
      <SignInPrompt
        open={showSignInPrompt}
        from={location.pathname + location.search}
        title="收藏活動需要先登入"
        description="登入或註冊後即可使用收藏功能，並同步你的收藏清單。"
        onClose={() => setShowSignInPrompt(false)}
      />
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

