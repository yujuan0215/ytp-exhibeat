import { useState, useEffect } from "react";
import type { Exhibition } from "@/data/mock";
import { Heart, Calendar, MapPin, BookmarkPlus, ArrowRight } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { isFavorited, toggleFavorite } from "@/lib/favorites";

export function ExhibitionCard({ exhibition, isCollectionVariant = false }: { exhibition: Exhibition; isCollectionVariant?: boolean }) {
  const [favorited, setFavorited] = useState(false);

  useEffect(() => {
    setFavorited(isFavorited(exhibition.id));
    
    const handleSync = () => setFavorited(isFavorited(exhibition.id));
    window.addEventListener("favorites-changed", handleSync);
    return () => window.removeEventListener("favorites-changed", handleSync);
  }, [exhibition.id]);

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newState = toggleFavorite(exhibition);
    setFavorited(newState);
  };

  return (
    <Card className="bg-[#1a1625] border-transparent overflow-hidden group hover:ring-2 hover:ring-purple-500/50 transition-all duration-300 relative">
      <div className="relative aspect-[4/3] overflow-hidden">
        <img 
          src={exhibition.imageUrl} 
          alt={exhibition.title} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            const imgs = [
              "https://images.unsplash.com/photo-1549490349-8643362247b5?w=600&auto=format&fit=crop&q=80",
              "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
              "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop&q=80",
            ];
            (e.target as HTMLImageElement).src = imgs[exhibition.title.length % imgs.length];
          }}
        />
        <button 
          onClick={handleToggleFavorite}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-background/20 backdrop-blur-md hover:bg-background/40 transition-colors"
        >
          <Heart className={`w-5 h-5 transition-all ${favorited ? 'fill-purple-500 text-purple-500 scale-110' : 'text-white hover:scale-110'}`} />
        </button>
        <div className="absolute bottom-4 left-4 flex gap-2">
          {exhibition.tags.map(tag => (
            <Badge key={tag} variant="secondary" className="bg-[#0cf]/20 text-[#0cf] hover:bg-[#0cf]/30 border-none backdrop-blur-md">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
      
      <CardContent className="p-5">
        <div className="flex justify-between items-start mb-4">
          <h3 className="font-bold text-lg leading-tight w-[70%]">{exhibition.title}</h3>
          {!isCollectionVariant && (
            <span className={`font-semibold ${exhibition.price === 'FREE' ? 'text-[#0cf]' : 'text-[#0cf]'}`}>
              {exhibition.price}
            </span>
          )}
        </div>
        
        <div className="space-y-2 text-sm text-muted-foreground mb-6">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 opacity-70" />
            <span>{exhibition.dateStr}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 opacity-70" />
            <span>{exhibition.location}</span>
          </div>
        </div>

        {!isCollectionVariant && exhibition.aiSummary && (
          <div className="bg-purple-900/10 border border-purple-500/20 rounded-lg p-3 mb-6">
            <p className="text-xs leading-relaxed">
              <span className="font-bold text-purple-400 mr-2">AI 摘要 :</span>
              <span className="text-muted-foreground">{exhibition.aiSummary}</span>
            </p>
          </div>
        )}

        <button className={`w-full py-2.5 rounded-full text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
          exhibition.price === 'FREE' && !isCollectionVariant
            ? 'bg-white/5 hover:bg-white/10'
            : 'bg-white/5 hover:bg-purple-500 hover:text-white'
        }`}>
          {isCollectionVariant ? '查看詳情' : (exhibition.price === 'FREE' ? <><BookmarkPlus className="w-4 h-4" /> 加入收藏</> : <>立即預約 <ArrowRight className="w-4 h-4" /></>)}
        </button>
      </CardContent>
    </Card>
  );
}
