import { Link, useLocation } from "react-router-dom";
import { Search, Bell, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Navbar() {
  const location = useLocation();

  return (
    <nav className="flex items-center justify-between px-8 py-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-8">
        <Link to="/" className="inline-block text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600 py-1">
          ExhiBeat
        </Link>
        <div className="hidden md:flex gap-6">
          <Link to="/" className={`text-sm font-medium transition-colors hover:text-foreground/80 ${location.pathname === '/' ? 'text-foreground border-b-2 border-purple-500 pb-[1.1rem] -mb-4' : 'text-foreground/60'}`}>
            首頁
          </Link>
          <Link to="#" className={`text-sm font-medium transition-colors hover:text-foreground/80 text-foreground/60`}>
            地圖探索
          </Link>
          <Link to="/collection" className={`text-sm font-medium transition-colors hover:text-foreground/80 ${location.pathname === '/collection' ? 'text-foreground border-b-2 border-purple-500 pb-[1.1rem] -mb-4' : 'text-foreground/60'}`}>
            收藏頁
          </Link>
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="搜尋展覽、藝術家..."
            className="h-9 w-64 rounded-md border border-input bg-muted/50 pl-9 pr-4 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <Bell className="h-5 w-5" />
        </button>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <Settings className="h-5 w-5" />
        </button>
        <Avatar className="h-8 w-8 cursor-pointer ring-2 ring-purple-500/20">
          <AvatarImage src="https://github.com/shadcn.png" alt="@user" />
          <AvatarFallback>US</AvatarFallback>
        </Avatar>
      </div>
    </nav>
  );
}
