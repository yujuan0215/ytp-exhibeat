import { collectionExhibitions, recommendations } from "@/data/mock";
import { ExhibitionCard } from "@/components/ExhibitionCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function Collection() {
  return (
    <div className="px-8 py-10 w-full flex flex-col lg:flex-row gap-10">
      
      {/* Main Content Area */}
      <div className="flex-1">
        <header className="flex flex-col md:flex-row items-baseline justify-between mb-8 gap-4">
          <div>
            <h2 className="text-[#0cf] text-sm font-bold tracking-widest uppercase mb-2">Personal Gallery</h2>
            <h1 className="text-4xl font-extrabold text-white">我的收藏</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <Tabs defaultValue="date" className="w-[180px]">
              <TabsList className="grid w-full grid-cols-2 bg-[#1a1625] rounded-full border border-white/5">
                <TabsTrigger value="date" className="rounded-full data-[state=active]:bg-white/10 data-[state=active]:text-white">按日期</TabsTrigger>
                <TabsTrigger value="distance" className="rounded-full data-[state=active]:bg-transparent data-[state=active]:text-white/60">按距離</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" className="rounded-full bg-[#1a1625] border-white/5 text-white hover:bg-white/10">
              <span className="mr-2">⚡</span> 篩選
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {collectionExhibitions.map(exhibition => (
            <ExhibitionCard key={exhibition.id} exhibition={exhibition} isCollectionVariant={true} />
          ))}
        </div>
      </div>

      {/* Sidebar Area */}
      <aside className="w-full lg:w-80 flex flex-col gap-8">
        
        {/* Recommendations */}
        <div className="bg-[#1a1625]/50 rounded-3xl p-6 border border-white/5">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">推薦給您</h3>
            <span className="text-purple-500 text-2xl">✨</span>
          </div>
          
          <div className="space-y-4">
            {recommendations.map(rec => (
              <div key={rec.id} className="flex gap-4 items-center group cursor-pointer hover:bg-white/5 p-2 -mx-2 rounded-xl transition-colors">
                <img src={rec.imageUrl} alt={rec.title} className="w-16 h-16 rounded-lg object-cover" />
                <div>
                  <span className="text-[10px] text-[#0cf] font-medium tracking-wider mb-1 block">
                    {rec.tag}
                  </span>
                  <h4 className="font-bold text-sm text-white mb-1 leading-tight group-hover:text-purple-400 transition-colors w-40 truncate">
                    {rec.title}
                  </h4>
                  <p className="text-xs text-muted-foreground">{rec.location}</p>
                </div>
              </div>
            ))}
          </div>
          
          <Button variant="outline" className="w-full mt-6 rounded-full border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300 bg-transparent transition-colors">
            探索更多推薦
          </Button>
        </div>

        {/* Stats */}
        <Card className="bg-[#1a1625]/50 border-white/5 border rounded-3xl pt-2">
          <CardContent className="p-6">
            <h3 className="text-lg font-bold text-white mb-6">收藏統計</h3>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-4xl font-light text-purple-400 mb-1">12</p>
                <p className="text-xs text-muted-foreground uppercase tracking-widest">收藏活動</p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-light text-[#0cf] mb-1">3</p>
                <p className="text-xs text-muted-foreground uppercase tracking-widest">即將結束</p>
              </div>
            </div>
          </CardContent>
        </Card>

      </aside>
    </div>
  );
}
