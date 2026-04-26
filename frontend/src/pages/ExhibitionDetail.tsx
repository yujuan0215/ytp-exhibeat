import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock3,
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
import { getLocaleCopy, useLanguage } from "@/lib/language";
import { useTheme } from "@/lib/theme";
import { ExternalNavigationModal } from "@/components/ExternalNavigationModal";
import { AddToTripListMenu } from "@/components/collection/AddToTripListMenu";
import { SignInPrompt } from "@/components/SignInPrompt";
import { AnimatedHeart } from "@/components/ui/AnimatedHeart";

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
const MOCK_COMMENTS_EN = [
  { name: "Lydia Wang", time: "3h ago", text: "The interactive zones were excellent, especially the light-and-sound area. Weekday evenings are less crowded." },
  { name: "Chen Kei", time: "5h ago", text: "The visitor flow is clear and there are lots of photo spots. Download the guide map first to cover all sections." },
  { name: "Alex", time: "1 day ago", text: "The curatorial narrative is easy to follow. Watch the intro video near the entrance before you start." },
  { name: "Mina", time: "2 days ago", text: "Family-friendly and stroller-friendly. Sunday afternoons are busier, but queues are still manageable." },
  { name: "Zhang", time: "3 days ago", text: "Plenty of nearby food options, and a nice riverside walk after the exhibition." },
  { name: "Sora", time: "4 days ago", text: "Audio guide quality is great. A fuller English version would be even better for international friends." },
  { name: "K", time: "5 days ago", text: "The gift shop curation is thoughtful and not just logo merchandise. Worth a look." },
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
  const { locale } = useLanguage();
  const { theme } = useTheme();
  const isV1 = theme === "v1";
  const copy = getLocaleCopy(locale, {
    "zh-TW": {
      notFoundMessage: "找不到這筆展覽，可能已下架或連結失效。",
      loadFailedMessage: "載入展覽資料失敗，請稍後再試。",
      loadingDetail: "載入展覽詳情中…",
      exhibitionNotFound: "找不到這筆展覽",
      backHome: "回首頁",
      freePriceLabel: "FREE",
      defaultPaidPrice: "NT$450",
      externalInfoAction: "前往展演資訊（外部）",
      externalTicketAction: "前往購票連結（外部）",
      externalInfoHint: "免費展演通常可直接入場，請以主辦單位公告為準。",
      externalTicketHint: "購票前將導向外部票務平台。",
      aiSummaryFallback:
        "本次展覽以城市夜色與聲光節奏為核心，結合場域敘事與沉浸式互動，適合喜歡視覺衝擊與新媒體藝術的觀眾。",
      previousImage: "上一張圖片",
      nextImage: "下一張圖片",
      back: "返回",
      ratingSr: "評分",
      starsOutOf5: "星，滿分 5 星",
      priceSr: "價錢",
      freeExhibitionAria: "免費展演（已劃叉的金錢符號表示不需付費）",
      priceTierAriaPrefix: "價位：",
      viewMap: "查看地圖",
      favorited: "已收藏",
      addFavorite: "加入收藏",
      signInToFavorite: "登入後即可收藏",
      tags: "標籤",
      noTags: "尚未設定標籤",
      addHashtag: "新增 hashtag",
      tagManagement: "標籤管理",
      currentTagsRemovable: "目前標籤（可刪除）",
      deleteTag: "刪除此標籤",
      noCurrentTags: "目前沒有標籤",
      tagInputPlaceholder: "#輸入標籤前幾個字",
      add: "新增",
      allTags: "所有標籤",
      exhibitionCount: "展演數量",
      noMatchingTags: "無符合標籤",
      visitDuration: "參觀時間",
      approxDuration: "約 90 – 120 分鐘",
      ticketPrice: "票價",
      tripList: "行程清單",
      aiExhibitionBrief: "AI 展覽簡介",
      collapseContent: "收合內容",
      moreContent: "更多內容",
      venueAndGoogleMaps: "地點與 Google Maps",
      venueExterior: "場館外觀",
      defaultCity: "台北市",
      walkFromMrt: "捷運站步行 10 分鐘",
      openInGoogleMaps: "在 Google Maps 中開啟",
      discussionTitle: "藝術愛好者討論區",
      allCommentsShownPrefix: "已顯示全部",
      currentlyShowingTop5Prefix: "目前顯示前 5 則，共",
      commentsSuffix: "則留言",
      collapseComments: "收合留言",
      moreComments: "更多留言",
      recommendedEvents: "推薦展演活動",
      removeFavorite: "取消收藏",
      signInToUseFavorite: "請先登入以使用收藏",
      externalModalTitle: "即將前往外部平台",
      externalModalDesc: "此外部展演/購票連結功能仍在建置中。未來將導向主辦或票務平台，敬請期待。",
      iUnderstand: "我知道了",
      close: "關閉",
      ratingTrendTitle: "社群評分趨勢",
      recent7DaysHint: "最近 7 天：依討論量、收藏與頁面停留換算之熱度指標（示意）",
      currentCompositeRatingPrefix: "目前綜合評分",
      favoriteNeedSignInTitle: "收藏活動需要先登入",
      favoriteNeedSignInDesc: "登入或註冊後即可使用收藏功能，並同步你的收藏清單。",
      weekdays: ["週一", "週二", "週三", "週四", "週五", "週六", "週日"],
    },
    en: {
      notFoundMessage: "This exhibition cannot be found. It may have been removed or the link is invalid.",
      loadFailedMessage: "Failed to load exhibition details. Please try again later.",
      loadingDetail: "Loading exhibition details…",
      exhibitionNotFound: "Exhibition not found",
      backHome: "Back to home",
      freePriceLabel: "FREE",
      defaultPaidPrice: "NT$450",
      externalInfoAction: "View exhibition info (external)",
      externalTicketAction: "Go to ticket link (external)",
      externalInfoHint: "Free exhibitions are usually open entry. Please follow the organizer's announcement.",
      externalTicketHint: "You will be redirected to an external ticketing platform before purchase.",
      aiSummaryFallback:
        "This exhibition centers on urban nightscapes and rhythmic light design, blending spatial storytelling with immersive interaction for visitors who enjoy bold visual impact and new media art.",
      previousImage: "Previous image",
      nextImage: "Next image",
      back: "Back",
      ratingSr: "Rating",
      starsOutOf5: "stars out of 5",
      priceSr: "Price",
      freeExhibitionAria: "Free exhibition (crossed-out currency symbol indicates no payment required)",
      priceTierAriaPrefix: "Price tier:",
      viewMap: "View map",
      favorited: "Favorited",
      addFavorite: "Add to favorites",
      signInToFavorite: "Sign in to favorite",
      tags: "Tags",
      noTags: "No tags yet",
      addHashtag: "Add hashtag",
      tagManagement: "Tag management",
      currentTagsRemovable: "Current tags (click to remove)",
      deleteTag: "Remove this tag",
      noCurrentTags: "No tags currently",
      tagInputPlaceholder: "#Type the first few characters",
      add: "Add",
      allTags: "All tags",
      exhibitionCount: "Exhibitions",
      noMatchingTags: "No matching tags",
      visitDuration: "Visit time",
      approxDuration: "About 90-120 minutes",
      ticketPrice: "Ticket price",
      tripList: "Trip list",
      aiExhibitionBrief: "AI Exhibition Summary",
      collapseContent: "Show less",
      moreContent: "Read more",
      venueAndGoogleMaps: "Venue and Google Maps",
      venueExterior: "Venue exterior",
      defaultCity: "Taipei City",
      walkFromMrt: "10-minute walk from MRT station",
      openInGoogleMaps: "Open in Google Maps",
      discussionTitle: "Art Enthusiast Discussion",
      allCommentsShownPrefix: "Showing all",
      currentlyShowingTop5Prefix: "Showing first 5 of",
      commentsSuffix: "comments",
      collapseComments: "Show fewer comments",
      moreComments: "Show more comments",
      recommendedEvents: "Recommended exhibitions",
      removeFavorite: "Remove from favorites",
      signInToUseFavorite: "Please sign in to use favorites",
      externalModalTitle: "You are leaving to an external platform",
      externalModalDesc: "This external exhibition/ticket link is still under construction. It will redirect to organizer or ticket platforms in a future update.",
      iUnderstand: "Got it",
      close: "Close",
      ratingTrendTitle: "Community Rating Trend",
      recent7DaysHint: "Last 7 days: indicative popularity score based on discussion volume, favorites, and dwell time.",
      currentCompositeRatingPrefix: "Current composite rating",
      favoriteNeedSignInTitle: "Sign in to save favorites",
      favoriteNeedSignInDesc: "Sign in or register to use favorites and sync your saved list.",
      weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    },
    fr: {
      notFoundMessage: "Aucune donnée trouvée",
      loadFailedMessage: "Échec du chargement",
      loadingDetail: "Chargement des détails…",
      exhibitionNotFound: "Exposition introuvable",
      backHome: "Retour à l'accueil",
      freePriceLabel: "Gratuit",
      defaultPaidPrice: "Payant",
      externalInfoAction: "Voir les informations externes",
      externalTicketAction: "Billets externes",
      externalInfoHint: "Ouvrir la page d'information officielle",
      externalTicketHint: "Ouvrir la page de billetterie officielle",
      aiSummaryFallback: "Résumé IA indisponible pour le moment",
      previousImage: "Image précédente",
      nextImage: "Image suivante",
      back: "Retour",
      ratingSr: "Note",
      starsOutOf5: "étoiles sur 5",
      priceSr: "Prix",
      freeExhibitionAria: "Exposition gratuite",
      priceTierAriaPrefix: "Niveau de prix",
      viewMap: "Voir la carte",
      favorited: "Ajouté aux favoris",
      addFavorite: "Ajouter aux favoris",
      signInToFavorite: "Connectez-vous pour ajouter aux favoris",
      tags: "Tags",
      noTags: "Aucun tag",
      addHashtag: "Ajouter un hashtag",
      tagManagement: "Gestion des tags",
      currentTagsRemovable: "Tags actuels (supprimables)",
      deleteTag: "Supprimer le tag",
      noCurrentTags: "Aucun tag actuel",
      tagInputPlaceholder: "Ajouter un tag…",
      add: "Ajouter",
      allTags: "Tous les tags",
      exhibitionCount: "Nombre d'expositions",
      noMatchingTags: "Aucun tag correspondant",
      visitDuration: "Durée de visite",
      approxDuration: "Durée approximative",
      ticketPrice: "Prix du billet",
      tripList: "Liste de voyage",
      aiExhibitionBrief: "Résumé IA de l'exposition",
      collapseContent: "Réduire le contenu",
      moreContent: "Voir plus",
      venueAndGoogleMaps: "Lieu & Google Maps",
      venueExterior: "Extérieur du lieu",
      defaultCity: "Ville non spécifiée",
      walkFromMrt: "À pied depuis le MRT",
      openInGoogleMaps: "Ouvrir dans Google Maps",
      discussionTitle: "Discussion",
      allCommentsShownPrefix: "Tous les",
      currentlyShowingTop5Prefix: "Affichage des 5 premiers sur",
      commentsSuffix: "commentaires",
      collapseComments: "Réduire les commentaires",
      moreComments: "Voir plus de commentaires",
      recommendedEvents: "Événements recommandés",
      removeFavorite: "Retirer des favoris",
      signInToUseFavorite: "Connectez-vous pour utiliser les favoris",
      externalModalTitle: "Ouvrir un lien externe",
      externalModalDesc: "Vous allez quitter ExhiBeat et ouvrir un site externe.",
      iUnderstand: "J'ai compris",
      close: "Fermer",
      ratingTrendTitle: "Tendance des notes",
      recent7DaysHint: "7 derniers jours",
      currentCompositeRatingPrefix: "Note composite actuelle",
      favoriteNeedSignInTitle: "Connexion requise",
      favoriteNeedSignInDesc: "Connectez-vous pour utiliser les favoris.",
      weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    },
  });

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

    getHomeRecommendations({ limit: 5000, offset: 0, locale })
      .then((list) => {
        const match = list.find((e) => e.id === decoded);
        if (match) {
          setExhibition(match);
          setError(null);
        } else {
          setError((prev) => prev ?? copy.notFoundMessage);
        }
      })
      .catch((err) => {
        console.error(err);
        setError(copy.loadFailedMessage);
      })
      .finally(() => {
        if (!exhibition && !fromFavorites) setLoading(false);
      });
  }, [copy.loadFailedMessage, copy.notFoundMessage, id, exhibition, locale]);

  useEffect(() => {
    getHomeRecommendations({ locale })
      .then((list) => {
        if (!id) {
          setSuggestions(list.slice(0, 6));
          return;
        }
        const currentId = decodeURIComponent(id);
        setSuggestions(list.filter((e) => e.id !== currentId).slice(0, 6));
      })
      .catch(() => {
        getCollectionRecommendations({ locale })
          .then((data) => {
            const mapped = (data.collectionExhibitions ?? []) as Exhibition[];
            setSuggestions(mapped.slice(0, 6));
          })
          .catch(() => setSuggestions([]));
      });
  }, [id, locale]);

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
    const labels = copy.weekdays;
    return labels.map((label, i) => {
      const barH = 28 + ((seed + likes + i * 23) % 48);
      const score = Math.min(5, Math.max(3.4, 3.8 + (((seed >> (i % 4)) ^ (likes + i)) % 120) / 200));
      return { label, barH, score };
    });
  }, [copy.weekdays, exhibition, likes]);

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
        <Loader2 className="w-5 h-5 animate-spin" /> {copy.loadingDetail}
      </div>
    );
  }

  if (error || !exhibition) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-white/60">{error ?? copy.exhibitionNotFound}</p>
        <Link to="/" className="px-5 py-2 rounded-full bg-purple-500/80 hover:bg-purple-500 text-white text-sm font-semibold transition-colors">
          {copy.backHome}
        </Link>
      </div>
    );
  }

  const isFree = exhibition.price === "FREE" || Boolean(exhibition._meta?.isFree);
  const numericPrice = isFree
    ? copy.freePriceLabel
    : typeof exhibition.price === "string" && exhibition.price
      ? exhibition.price
      : copy.defaultPaidPrice;
  const venue = locationParts.venue || exhibition.location;
  const actionLabel = isFree ? copy.externalInfoAction : copy.externalTicketAction;
  const actionHint = isFree ? copy.externalInfoHint : copy.externalTicketHint;

  const priceTierMeta = getPriceTierMeta(isFree, typeof numericPrice === "string" ? numericPrice : String(numericPrice));
  const aiSummaryText =
    exhibition.aiSummary ||
    copy.aiSummaryFallback;
  const comments = locale === "en" ? MOCK_COMMENTS_EN : MOCK_COMMENTS;
  const fullDescriptionText = (exhibition.fullDescription ?? "").trim();
  const aiDisplayText = fullDescriptionText || aiSummaryText;
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
              aria-label={copy.previousImage}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleNextImage}
              className="absolute right-5 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-sm transition-colors flex items-center justify-center"
              aria-label={copy.nextImage}
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </>
        )}

        <button
          onClick={() => navigate(-1)}
          className="absolute top-5 left-6 flex items-center gap-1.5 text-sm text-white/85 hover:text-white px-3 py-1.5 rounded-md bg-black/40 border border-white/15"
        >
          <ArrowLeft className="w-4 h-4" /> {copy.back}
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
                <span className="sr-only">{copy.ratingSr}</span>
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
                  {communityRating.toFixed(1)} {copy.starsOutOf5}
                </span>
              </button>
              <div className="h-11 min-w-[148px] rounded-lg border border-white/10 bg-[#1f1f26] px-3">
                <span className="sr-only">{copy.priceSr}</span>
                {priceTierMeta.kind === "free" ? (
                  <div
                    className="relative flex h-full w-full items-center justify-center"
                    aria-label={copy.freeExhibitionAria}
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
                      aria-label={`${copy.priceTierAriaPrefix} ${"＄".repeat(priceTierMeta.count)}`}
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
                title={copy.viewMap}
                aria-label={copy.viewMap}
              >
                <div className="flex h-full items-center justify-center gap-2 text-white/90">
                
                  <span className="text-sm font-semibold">{copy.viewMap}</span>  
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
                title={user ? (favorited ? copy.favorited : copy.addFavorite) : copy.signInToFavorite}
                aria-label={user ? (favorited ? copy.favorited : copy.addFavorite) : copy.signInToFavorite}
              >
                {user ? (
                  <AnimatedHeart
                    checked={favorited}
                    size={20}
                    className="text-white"
                    title={user ? (favorited ? copy.favorited : copy.addFavorite) : copy.signInToFavorite}
                  />
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
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/40">{copy.tags}</p>
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
                    <span className="text-[12px] text-white/40">{copy.noTags}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTagPickerOpen((open) => !open)}
                className="absolute bottom-1 right-0 flex h-7 w-7 items-center justify-center rounded-full border border-[#8eb4d4]/45 bg-[#2a3244] text-[#a8d4f0] transition-colors hover:bg-[#33415a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8eb4d4]/70"
                aria-label={copy.addHashtag}
                title={copy.addHashtag}
              >
                <Plus className="h-4 w-4" />
              </button>

              {tagPickerOpen && (
                <div className="absolute right-0 top-full z-30 mt-3 w-full max-w-md rounded-xl border border-white/10 bg-[#141a28] p-3 shadow-xl">
                  <p className="mb-2 text-xs font-semibold text-white/70">{copy.tagManagement}</p>
                  <div className="mb-3 rounded-md border border-white/10 bg-[#101726] p-2">
                    <p className="mb-2 text-[11px] text-white/45">{copy.currentTagsRemovable}</p>
                    <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                      {pixivStyleTags.length > 0 ? (
                        pixivStyleTags.map((tag) => (
                          <button
                            key={`manage-current-${tag}`}
                            type="button"
                            onClick={() => handleRemoveCurrentTag(tag)}
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#1f1f26] px-2 py-1 text-xs text-white/80 hover:bg-[#2b3345]"
                            title={copy.deleteTag}
                          >
                            <span>{tag}</span>
                            <X className="h-3 w-3 text-white/60" />
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-white/45">{copy.noCurrentTags}</p>
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
                      placeholder={copy.tagInputPlaceholder}
                      className="h-9 flex-1 rounded-md border border-white/10 bg-[#1f1f26] px-3 text-sm text-white outline-none focus:border-[#8eb4d4]/70"
                    />
                    <button
                      type="button"
                      onClick={handleCreateCustomTag}
                      className="h-9 rounded-md border border-[#8eb4d4]/45 px-3 text-xs font-semibold text-[#a8d4f0] hover:bg-[#2a3244]"
                    >
                      {copy.add}
                    </button>
                  </div>

                  <div className="mt-2 rounded-md border border-white/10 bg-[#101726]">
                    <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[11px] text-white/45">
                      <span>{copy.allTags}</span>
                      <span>{copy.exhibitionCount}</span>
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
                        <p className="px-3 py-2 text-xs text-white/45">{copy.noMatchingTags}</p>
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
                    <span className="text-white/55">{copy.visitDuration}</span>{" "}
                    <span className="text-white/90">{copy.approxDuration}</span>
                  </span>
                </p>
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/45">{copy.ticketPrice}</span>
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
                <span className="text-xs text-on-surface-variant">{copy.tripList}</span>
                <AddToTripListMenu kind="event" exhibition={exhibition} align="end" />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-[#0f1727]/88 p-6">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#774AD9]" />
              <h3 className="text-base font-bold text-white">{copy.aiExhibitionBrief}</h3>
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
                {aiExpanded ? copy.collapseContent : copy.moreContent}
              </button>
            )}
          </section>

          <section
            ref={venueMapRef}
            id="exhibition-venue-map"
            className="scroll-mt-24 rounded-xl overflow-hidden bg-[#131318] border border-white/10 flex flex-col gap-4 p-4"
          >
            <h3 className="text-sm font-bold text-white px-1">{copy.venueAndGoogleMaps}</h3>
            <img
              src="https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=900&auto=format&fit=crop&q=80"
              alt={copy.venueExterior}
              className="w-full h-64 object-cover rounded-lg"
            />
            <div className="px-1 pb-1 flex flex-col gap-2">
              <h4 className="font-bold text-on-surface font-headline">{venue}</h4>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {locationParts.city || copy.defaultCity} ・{copy.walkFromMrt}
              </p>
              <Link
                to="/map"
                className="mt-2 text-xs font-bold text-secondary flex items-center gap-1 group"
              >
                {copy.openInGoogleMaps} <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </section>

          <section className="rounded-xl bg-[#131318] p-8">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-white">{copy.discussionTitle}</h3>
              <p className="mt-1 text-xs text-white/50">
                {commentsExpanded
                  ? `${copy.allCommentsShownPrefix} ${comments.length} ${copy.commentsSuffix}`
                  : `${copy.currentlyShowingTop5Prefix} ${comments.length} ${copy.commentsSuffix}`}
              </p>
            </div>
            <div className="space-y-0">
              {(commentsExpanded ? comments : comments.slice(0, 5)).map((c, i) => (
                <CommentRow key={`comment-${i}`} name={c.name} time={c.time} text={c.text} />
              ))}
            </div>
            {comments.length > 5 && (
              <button
                type="button"
                onClick={() => setCommentsExpanded((v) => !v)}
                className="mt-4 text-sm font-bold text-secondary hover:underline"
              >
                {commentsExpanded ? copy.collapseComments : copy.moreComments}
              </button>
            )}
          </section>
        </div>

        <aside className="col-span-12 lg:col-span-4">
          <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-[#0f0f1a] p-5">
            <header className="mb-4">
              <h3 className="text-lg font-bold text-white">{copy.recommendedEvents}</h3>
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
                          title={user ? (isFavorited(item.id) ? copy.removeFavorite : copy.addFavorite) : copy.signInToUseFavorite}
                          className="shrink-0 p-1"
                        >
                          {user ? (
                            <AnimatedHeart
                              checked={isFavorited(item.id)}
                              size={16}
                              className="text-white"
                              title={user ? (isFavorited(item.id) ? copy.removeFavorite : copy.addFavorite) : copy.signInToUseFavorite}
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
        title={copy.externalModalTitle}
        description={copy.externalModalDesc}
        confirmLabel={copy.iUnderstand}
        cancelLabel={copy.close}
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
                    {copy.ratingTrendTitle}
                  </h3>
                  <p className="mt-1 text-xs text-white/55 leading-relaxed">
                    {copy.recent7DaysHint}
                  </p>
                  <p className="mt-2 text-sm text-white/80">
                    {copy.currentCompositeRatingPrefix} <span className="font-bold text-secondary">{communityRating.toFixed(1)}</span> / 5.0
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRatingTrendOpen(false)}
                className="shrink-0 rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                aria-label={copy.close}
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
                {copy.close}
              </button>
            </div>
          </div>
        </div>
      )}
      <SignInPrompt
        open={showSignInPrompt}
        from={location.pathname + location.search}
        title={copy.favoriteNeedSignInTitle}
        description={copy.favoriteNeedSignInDesc}
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

