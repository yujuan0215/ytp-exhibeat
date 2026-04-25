import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Exhibition } from "@/data/mock";
import { Heart, Calendar, MapPin, ArrowRight, Lock } from "lucide-react";
import { AddToTripListMenu } from "@/components/collection/AddToTripListMenu";
import { Card, CardContent } from "./ui/card";
import { isFavorited, toggleFavorite } from "@/lib/favorites";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { SignInPrompt } from "@/components/SignInPrompt";
import { ActionToast } from "@/components/ActionToast";

export function ExhibitionCard({
  exhibition,
  isCollectionVariant = false,
  tripListContextId = null,
}: {
  exhibition: Exhibition;
  isCollectionVariant?: boolean;
  /** When set (e.g. viewing a list), menu can remove item from this list. */
  tripListContextId?: string | null;
}) {
  const { theme } = useTheme();
  const isV1 = theme === "v1";
  const [favorited, setFavorited] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    setFavorited(isFavorited(exhibition.id));

    const handleSync = () => setFavorited(isFavorited(exhibition.id));
    window.addEventListener("favorites-changed", handleSync);
    return () => window.removeEventListener("favorites-changed", handleSync);
  }, [exhibition.id]);

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      setShowSignInPrompt(true);
      return;
    }
    const newState = await toggleFavorite(exhibition);
    setFavorited(newState);
    setToastMessage(newState ? "已加入收藏" : "已取消收藏");
    setShowToast(true);
  };

  useEffect(() => {
    if (!showToast) return;
    const timer = window.setTimeout(() => setShowToast(false), 1800);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  const detailHref = `/exhibition/${encodeURIComponent(exhibition.id)}`;

  return (
    <Card className="bg-surface-container-low border-transparent ring-0 overflow-hidden group transition-all duration-300 relative hover:-translate-y-1 hover:shadow-2xl">
      <Link to={detailHref} state={{ exhibition }} className="block">
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={exhibition.imageUrl}
            alt={exhibition.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            onError={(e) => {
              const imgs = [
                "https://images.unsplash.com/photo-1549490349-8643362247b5?w=600&auto=format&fit=crop&q=80",
                "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
                "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop&q=80",
              ];
              (e.target as HTMLImageElement).src = imgs[exhibition.title.length % imgs.length];
            }}
          />
          <div
            className="absolute top-4 left-4 z-20"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <AddToTripListMenu kind="event" exhibition={exhibition} currentListId={tripListContextId} align="start" />
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void handleToggleFavorite(e);
            }}
            title={user ? (favorited ? "取消收藏" : "加入收藏") : "請先登入以使用收藏"}
            className={`absolute top-4 right-4 z-20 p-2 ${isV1 ? "rounded-md" : "rounded-full"} bg-background/20 backdrop-blur-md hover:bg-background/40 transition-colors`}
          >
            {user ? (
              <Heart className={`w-5 h-5 transition-all ${favorited ? 'fill-purple-500 text-purple-500 scale-110' : 'text-white hover:scale-110'}`} />
            ) : (
              <Lock className="w-5 h-5 text-white/70 hover:text-white" />
            )}
          </button>
        </div>
      </Link>

      <CardContent className="p-5 flex flex-col h-[300px]">
        <div className="flex justify-between items-start gap-3 min-h-[56px]">
          <Link
            to={detailHref}
            state={{ exhibition }}
            className="font-bold text-lg leading-tight flex-1 min-w-0 line-clamp-2 hover:text-primary transition-colors"
            title={exhibition.title}
          >
            {exhibition.title}
          </Link>
          {!isCollectionVariant && (
            <span
              className={`font-semibold min-w-0 max-w-[44%] text-right truncate whitespace-nowrap ${exhibition.price === 'FREE' ? 'text-secondary' : 'text-secondary'}`}
              title={exhibition.price === undefined ? undefined : String(exhibition.price)}
            >
              {exhibition.price}
            </span>
          )}
        </div>

        <div className="space-y-2 text-sm text-muted-foreground mt-4 mb-4 min-h-[52px]">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 opacity-70" />
            <span className="line-clamp-1">{exhibition.dateStr}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 opacity-70" />
            <span className="line-clamp-1">{exhibition.location}</span>
          </div>
        </div>

        {!isCollectionVariant && exhibition.aiSummary && (
          <div className="bg-surface/50 rounded-md p-1.5 mb-4 min-h-[84px]">
            <div className="rounded-md bg-surface-container-low border-l-2 border-primary/60 px-3 py-2.5">
              <p className="text-xs leading-relaxed line-clamp-2">
                <span className="font-bold text-purple-400 mr-2">AI 摘要：</span>
                <span className="text-muted-foreground">{exhibition.aiSummary ?? ""}</span>
              </p>
            </div>
          </div>
        )}

        <Link
          to={detailHref}
          state={{ exhibition }}
          className={`w-full py-2.5 mt-auto ${isV1 ? "rounded-md" : "rounded-full"} text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            isV1 ? "bg-surface-container-highest hover:bg-primary hover:text-on-primary" : "bg-white/5 hover:bg-purple-500 hover:text-white"
          }`}
        >
          查看詳情 <ArrowRight className="w-4 h-4" />
        </Link>
      </CardContent>
      <SignInPrompt
        open={showSignInPrompt}
        from={location.pathname + location.search}
        title="想收藏這個展覽嗎？"
        description="登入 ExhiBeat 後就能把活動加入收藏，並在收藏頁快速找到它。"
        onClose={() => setShowSignInPrompt(false)}
      />
      <ActionToast open={showToast} message={toastMessage} />
    </Card>
  );
}
