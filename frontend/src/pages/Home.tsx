import { homeExhibitions } from "@/data/mock";
import { ExhibitionCard } from "@/components/ExhibitionCard";
import { Button } from "@/components/ui/button";

export function Home() {
  return (
    <div className="w-full pb-20">
      {/* Hero Section */}
      <section className="relative w-full h-[600px] rounded-bl-[4rem] rounded-br-[4rem] overflow-hidden mb-12">
        <div className="absolute inset-0">
          <img 
            src="https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1200&auto=format&fit=crop&q=80" 
            alt="Hero Background" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
        </div>
        
        <div className="relative h-full flex flex-col justify-center px-8 md:px-16 max-w-4xl">
          <div className="flex gap-3 mb-6">
            <span className="px-3 py-1 rounded-full bg-pink-500/20 text-pink-400 text-xs font-bold ring-1 ring-pink-500/50">
              AI 靈感推薦
            </span>
            <span className="px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-bold">
              台北 • 今日熱門
            </span>
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black text-white mb-6 leading-tight tracking-tight">
            異次元<br />
            <span className="inline-block text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-300 drop-shadow-[0_0_15px_rgba(192,132,252,0.5)] py-2">
              台北之光
            </span>
          </h1>
          
          <p className="text-lg text-white/80 max-w-xl mb-10 leading-relaxed">
            結合 AI 運算與沉浸式光影，這場展覽將重新定義你對這座城市的認知。系統根據你的喜好分析：極高概率會讓你流連忘返。
          </p>
          
          <div className="flex gap-4">
            <Button size="lg" className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-full px-8 text-base">
              立即預訂
            </Button>
            <Button size="lg" variant="outline" className="rounded-full px-8 text-base border-white/20 bg-black/20 backdrop-blur hover:bg-white/10 hover:text-white text-white">
              查看詳情
            </Button>
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="px-8 mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <button className="px-6 py-2 rounded-full bg-[#0cf] text-black font-semibold text-sm transition-colors hover:bg-opacity-90">
            全部展演
          </button>
          {['雨天備案', '夜間推薦', '親子友善', '限時免費'].map(filter => (
            <button key={filter} className="px-6 py-2 rounded-full bg-white/5 border border-white/10 text-white/70 font-medium text-sm transition-colors hover:bg-white/10">
              {filter}
            </button>
          ))}
        </div>
        <button className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors">
          <span className="opacity-50">≡</span> 最新發布優先
        </button>
      </section>

      {/* Exhibition Grid */}
      <section className="px-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {homeExhibitions.map(exhibition => (
          <ExhibitionCard key={exhibition.id} exhibition={exhibition} />
        ))}
      </section>
      
      <div className="mt-12 flex justify-center">
        <Button variant="outline" className="rounded-full px-8 border-white/20 text-white hover:bg-white/10 bg-transparent">
          探索更多精彩展演
        </Button>
      </div>
    </div>
  );
}
