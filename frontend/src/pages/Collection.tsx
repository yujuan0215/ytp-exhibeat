import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Exhibition, Recommendation } from "@/data/mock";
import { getCollectionRecommendations, getMoreCollectionRecommendations } from "@/lib/api";
import { ExhibitionCard } from "@/components/ExhibitionCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, ChevronDown, Lock, MessageCircle, ArrowLeft } from "lucide-react";
import { getFavorites } from "@/lib/favorites";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import {
  createTripList,
  deleteTripList,
  DEFAULT_TRIP_LIST_ID_KEY,
  getTripLists,
  queueAgentPrefillFromList,
  renameTripList,
  TRIP_LISTS_CHANGE_EVENT,
  type TripList,
} from "@/lib/tripLists";
import { TripListMosaicHeader } from "@/components/collection/TripListMosaicHeader";
import { TripListRail } from "@/components/collection/TripListRail";
import { TripListActionsMenu } from "@/components/collection/TripListActionsMenu";
import { StayListCard } from "@/components/collection/StayListCard";
import { ActionToast } from "@/components/ActionToast";
import { useDynamicTranslation } from "@/hooks/useDynamicTranslation";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1549490349-8643362247b5?w=300&auto=format&fit=crop&q=60";

export function Collection() {
  const { theme } = useTheme();
  const isV1 = theme === "v1";
  const navigate = useNavigate();
  const { user, status } = useAuth();
  const [tripLists, setTripLists] = useState<TripList[]>(() => getTripLists());
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const [collectionExhibitions, setCollectionExhibitions] = useState<Exhibition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allRecs, setAllRecs] = useState<Recommendation[]>([]);
  const [recsVisible, setRecsVisible] = useState(3);
  const [hasMoreRecs, setHasMoreRecs] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const selectedList = selectedListId ? tripLists.find((l) => l.id === selectedListId) ?? null : null;

  useEffect(() => {
    const sync = () => setTripLists(getTripLists());
    window.addEventListener(TRIP_LISTS_CHANGE_EVENT, sync);
    return () => window.removeEventListener(TRIP_LISTS_CHANGE_EVENT, sync);
  }, []);

  useEffect(() => {
    if (selectedListId && !tripLists.some((l) => l.id === selectedListId)) {
      setSelectedListId(null);
    }
  }, [tripLists, selectedListId]);

  useEffect(() => {
    setCollectionExhibitions(getFavorites());

    getCollectionRecommendations()
      .then((data) => {
        setAllRecs(data.recommendations);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch collection recommendations", err);
        setLoading(false);
      });

    const handleSync = () => setCollectionExhibitions(getFavorites());
    window.addEventListener("favorites-changed", handleSync);
    return () => window.removeEventListener("favorites-changed", handleSync);
  }, []);

  const handleLoadMoreRecs = async () => {
    if (recsVisible < allRecs.length) {
      setRecsVisible((v) => Math.min(v + 3, allRecs.length));
      return;
    }
    setLoadingMore(true);
    try {
      const newRecs = await getMoreCollectionRecommendations();
      const combined = [...allRecs, ...newRecs.filter((r) => !allRecs.find((e) => e.id === r.id))];
      setAllRecs(combined);
      setRecsVisible((v) => v + 3);
      if (combined.length <= recsVisible + 3) setHasMoreRecs(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const visibleRecs = allRecs.slice(0, recsVisible);
  const collectionTranslationTexts = [
    ...eventItems.flatMap((item) => [item.payload.title, item.payload.location, item.payload.aiSummary ?? ""]),
    ...visibleRecs.flatMap((rec) => [rec.title, rec.location, rec.tag]),
  ];
  const translateCollectionText = useDynamicTranslation(
    collectionTranslationTexts,
    "collection shared exhibition content",
  );
  const endingSoon = collectionExhibitions.filter((e) => {
    const end = new Date(e.dateStr.replace(/.*-> /, "").trim());
    const diff = (end.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  }).length;

  const handleCreateTripList = () => {
    const name = window.prompt("新行程清單名稱", `新行程 ${new Date().toLocaleDateString("zh-TW")}`);
    if (name === null) return;
    createTripList(name);
    setTripLists(getTripLists());
  };

  const handleSendListToAgent = () => {
    if (!selectedList) return;
    // Current flow: Collection -> sessionStorage prefill -> Agent page auto-sends.
    queueAgentPrefillFromList(selectedList);
    setToastMessage("已將清單帶入助理對話");
    setShowToast(true);
    window.setTimeout(() => navigate("/agent"), 180);
  };

  useEffect(() => {
    if (!showToast) return;
    const timer = window.setTimeout(() => setShowToast(false), 1800);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  const canDeleteList = (list: TripList) => list.id !== DEFAULT_TRIP_LIST_ID_KEY;

  const handleRenameList = (listId: string, nextName: string) => {
    renameTripList(listId, nextName);
    setTripLists(getTripLists());
  };

  const handleDeleteList = (listId: string) => {
    deleteTripList(listId);
    setTripLists(getTripLists());
    if (selectedListId === listId) setSelectedListId(null);
  };

  const eventItems = selectedList?.items.filter((i) => i.kind === "event") ?? [];
  const stayItems = selectedList?.items.filter((i) => i.kind === "stay") ?? [];

  const recommendationsAside = (
    <div className={`bg-surface-container-low ${isV1 ? "rounded-md" : "rounded-3xl"} p-6`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white">推薦給您</h3>
        <Sparkles className="w-6 h-6 text-purple-500" />
      </div>
      <div className="space-y-4">
        {loading ? (
          <div className="text-white/50 text-sm text-center py-4 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> 載入推薦…
          </div>
        ) : visibleRecs.length > 0 ? (
          visibleRecs.map((rec) => (
            <Link
              key={rec.id}
              to={`/exhibition/${encodeURIComponent(rec.id)}`}
              className={`flex gap-4 items-center group cursor-pointer hover:bg-white/5 p-2 -mx-2 min-h-[82px] ${isV1 ? "rounded-md" : "rounded-xl"} transition-colors`}
            >
              <img
                src={rec.imageUrl}
                alt={translateCollectionText(rec.title)}
                className={`w-16 h-16 ${isV1 ? "rounded-md" : "rounded-lg"} object-cover flex-shrink-0`}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
                }}
              />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] text-secondary font-medium tracking-wider mb-1 block truncate">
                  {translateCollectionText(rec.tag)}
                </span>
                <h4 className="font-bold text-sm text-white mb-1 leading-tight group-hover:text-primary transition-colors line-clamp-2 min-h-[34px]">
                  {translateCollectionText(rec.title)}
                </h4>
                <p className="text-xs text-muted-foreground line-clamp-1">{translateCollectionText(rec.location)}</p>
              </div>
            </Link>
          ))
        ) : (
          <div className="text-white/50 text-sm py-4">目前沒有推薦</div>
        )}
      </div>
      {hasMoreRecs && (
        <Button
          variant="outline"
          className={`w-full mt-6 ${isV1 ? "rounded-md" : "rounded-full"} border-primary/30 text-primary hover:bg-primary/10 hover:text-primary bg-transparent transition-colors gap-2`}
          onClick={handleLoadMoreRecs}
          disabled={loadingMore}
        >
          {loadingMore ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> 載入中…
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" /> 探索更多推薦
            </>
          )}
        </Button>
      )}
      {!hasMoreRecs && <p className="text-center text-white/30 text-xs mt-4">已顯示全部推薦</p>}
    </div>
  );

  const statsCard = (
    <Card className={`bg-surface-container-low border-transparent ring-0 ${isV1 ? "rounded-md" : "rounded-3xl"} pt-2`}>
      <CardContent className="p-6">
        <h3 className="text-lg font-bold text-white mb-6">收藏統計</h3>
        <div className="flex justify-between items-end">
          <div>
            <p className="text-4xl font-light text-primary mb-1">{collectionExhibitions.length}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">喜歡的展演</p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-light text-secondary mb-1">{endingSoon}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">即將結束</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const listOverviewCenter = (
    <section className="mx-auto w-full max-w-4xl">
      <div className="mb-6 flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <h2 className="text-secondary text-sm font-bold tracking-widest uppercase">Trip lists</h2>
          <h3 className="mt-1 text-2xl font-bold text-white">行程清單</h3>
          <p className="mt-1 text-sm text-white/55">建立多份清單，規劃不同旅程；可加入展演與旅宿。</p>
        </div>
        <Button
          type="button"
          onClick={handleCreateTripList}
          className={`${isV1 ? "rounded-md" : "rounded-full"} bg-[#00d6ff] px-5 py-2.5 font-semibold text-[#042028] hover:bg-[#20deff]`}
        >
          新建清單
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {tripLists.map((list) => (
          <div
            key={list.id}
            className={`border border-white/10 bg-surface-container-low p-4 transition-colors hover:border-cyan-400/40 hover:bg-white/5 ${isV1 ? "rounded-md" : "rounded-2xl"}`}
          >
            <div className="mb-2 flex justify-end">
              <TripListActionsMenu
                list={list}
                canDelete={canDeleteList(list)}
                onRename={handleRenameList}
                onDelete={handleDeleteList}
              />
            </div>
            <button type="button" onClick={() => setSelectedListId(list.id)} className="w-full text-left">
              <TripListMosaicHeader list={list} className="mb-4 max-h-48" />
              <p className="font-bold text-white">{list.name}</p>
              <p className="mt-1 text-xs text-white/55">
                {list.items.length} 項
                {list.items.some((i) => i.kind === "stay") ? " · 含旅宿" : ""}
              </p>
            </button>
          </div>
        ))}
      </div>
    </section>
  );

  const listDetailMain = selectedList && (
    <div className="min-w-0 flex-1">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => setSelectedListId(null)}
            className={`mb-3 inline-flex items-center gap-2 border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/85 hover:bg-white/10 ${isV1 ? "rounded-md" : "rounded-full"}`}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回清單總覽
          </button>
          <h2 className="text-3xl font-extrabold text-white">{selectedList.name}</h2>
          <p className="mt-1 text-sm text-white/55">
            {selectedList.items.length} 項 · 展演 {eventItems.length} · 旅宿 {stayItems.length}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Button
            type="button"
            onClick={handleSendListToAgent}
            disabled={selectedList.items.length === 0}
            className={`inline-flex items-center gap-2 ${isV1 ? "rounded-md" : "rounded-full"} bg-purple-600 px-4 py-2.5 font-semibold text-white hover:bg-purple-500 disabled:opacity-50`}
          >
            <MessageCircle className="h-4 w-4" />
            傳給助理規劃行程
          </Button>
        </div>
      </div>

      {selectedList.items.length === 0 ? (
        <div className={`border border-white/10 py-16 text-center text-white/55 ${isV1 ? "rounded-md" : "rounded-2xl"}`}>
          這份清單還是空的，請從展演卡、旅宿或 AI 推薦加入項目。
        </div>
      ) : (
        <div className="space-y-10">
          {eventItems.length > 0 && (
            <div>
              <h3 className="mb-4 text-lg font-bold text-white">展演</h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {eventItems.map((item) => (
                  <ExhibitionCard
                    key={item.payload.id}
                    exhibition={item.payload}
                    isCollectionVariant
                    tripListContextId={selectedList.id}
                    translateText={translateCollectionText}
                  />
                ))}
              </div>
            </div>
          )}
          {stayItems.length > 0 && (
            <div>
              <h3 className="mb-4 text-lg font-bold text-white">旅宿</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {stayItems.map((item) => (
                  <StayListCard key={item.payload.id} stay={item.payload} currentListId={selectedList.id} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-10 px-8 py-10">
      <header className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
        <div>
          <h2 className="text-secondary mb-2 text-sm font-bold tracking-widest uppercase">Personal Gallery</h2>
          <h1 className="text-4xl font-extrabold text-white">我的收藏</h1>
          <p className="mt-2 max-w-xl text-sm text-white/55">喜歡的展演與行程清單分開管理；清單可交給 AI 助理協助排行程。</p>
        </div>
      </header>

      {status === "loading" ? (
        <div className="flex justify-center gap-3 py-20 text-white/50">
          <Loader2 className="h-5 w-5 animate-spin" /> 檢查登入狀態…
        </div>
      ) : !user ? (
        <div
          className={`mx-auto flex max-w-lg flex-col items-center justify-center gap-4 py-16 text-center ${isV1 ? "rounded-md" : "rounded-3xl"} bg-surface-container/50`}
        >
          <div className={`flex h-14 w-14 items-center justify-center ${isV1 ? "rounded-md" : "rounded-full"} bg-primary/10`}>
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <p className="font-semibold text-white/80">登入後解鎖收藏與行程清單</p>
          <div className="flex gap-3">
            <Link
              to="/login"
              state={{ from: "/collection" }}
              className={`px-5 py-2 text-sm font-semibold transition-colors ${isV1 ? "rounded-md bg-primary hover:bg-primary/90" : "rounded-full btn-gradient-safe"}`}
            >
              前往登入
            </Link>
            <Link
              to="/register"
              state={{ from: "/collection" }}
              className={`px-5 py-2 text-sm font-semibold text-white/80 transition-colors ${isV1 ? "rounded-md" : "rounded-full"} border border-outline-variant/30 bg-surface-container-low hover:bg-surface-container-high hover:text-white`}
            >
              建立帳號
            </Link>
          </div>
        </div>
      ) : selectedListId ? (
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-8">
          {listDetailMain}
          <aside className="flex w-full shrink-0 flex-col gap-8 lg:w-80">
            <TripListRail
              lists={tripLists}
              selectedListId={selectedListId}
              onSelect={setSelectedListId}
              onCreateList={handleCreateTripList}
              onRenameList={handleRenameList}
              onDeleteList={handleDeleteList}
              canDeleteList={canDeleteList}
            />
            {recommendationsAside}
            {statsCard}
          </aside>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-14">
          {listOverviewCenter}
          <div className="flex flex-col gap-8">
            {recommendationsAside}
            {statsCard}
          </div>
        </div>
      )}
      <ActionToast open={showToast} message={toastMessage} />
    </div>
  );
}
