import type { Exhibition } from "@/data/mock";
import { Heart, Calendar, MapPin, BookmarkPlus, ArrowRight } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";

export function ExhibitionCard({ exhibition, isCollectionVariant = false }: { exhibition: Exhibition; isCollectionVariant?: boolean }) {
  return (
    <Card className="bg-[#1a1625] border-transparent overflow-hidden group hover:ring-2 hover:ring-purple-500/50 transition-all duration-300">
      <div className="relative aspect-[4/3] overflow-hidden">
        <img 
          src={exhibition.imageUrl} 
          alt={exhibition.title} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <button className="absolute top-4 right-4 p-2 rounded-full bg-background/20 backdrop-blur-md hover:bg-background/40 transition-colors">
          <Heart className={`w-5 h-5 ${exhibition.isFavorite ? 'fill-purple-500 text-purple-500' : 'text-white'}`} />
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
