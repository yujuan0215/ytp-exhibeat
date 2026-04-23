import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Bell, Settings, LogIn, LogOut, User as UserIcon, Heart, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const linkClass = (path: string) =>
    `text-sm font-medium transition-colors hover:text-foreground/90 ${
      location.pathname === path ? "text-primary border-b-2 border-primary pb-1" : "text-foreground/60"
    }`;

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate("/");
  };

  const initials = user?.display_name
    ? user.display_name.slice(0, 2).toUpperCase()
    : user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : "US";

  return (
    <nav className="fixed top-0 z-50 w-full h-20 flex items-center justify-between px-8 border-b border-white/5 bg-background/70 backdrop-blur-xl shadow-[0_8px_32px_rgba(223,142,255,0.08)]">
      <div className="flex items-center gap-8">
        <Link
          to="/"
          className="inline-block text-3xl font-extrabold py-1 tracking-tight"
          style={{ color: "#df8eff", fontFamily: '"The Seasons", serif', fontWeight: 400 }}
        >
          ExhiBeat
        </Link>
        <div className="hidden md:flex gap-6">
          <Link to="/" className={linkClass("/")}>首頁</Link>
          <Link to="/map" className={linkClass("/map")}>地圖探索</Link>
          <Link to="/collection" className={linkClass("/collection")}>收藏頁</Link>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="搜尋展覽、藝術家..."
            className="h-9 w-64 rounded-md border border-white/10 bg-[#1f1f26]/80 pl-9 pr-4 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <button className="text-muted-foreground hover:text-foreground transition-colors p-2 hover:bg-[#1f1f26] rounded-md">
          <Bell className="h-5 w-5" />
        </button>
        <div className="hidden md:flex items-center gap-1 rounded-md border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setTheme("v1")}
            className={`px-2 py-1 text-xs rounded-sm transition-colors ${theme === "v1" ? "bg-[#774AD9] text-white" : "text-white/65 hover:text-white"}`}
            title="一版（詳情頁風格）"
          >
            一版
          </button>
          <button
            type="button"
            onClick={() => setTheme("v2")}
            className={`px-2 py-1 text-xs rounded-sm transition-colors ${theme === "v2" ? "bg-[#774AD9] text-white" : "text-white/65 hover:text-white"}`}
            title="二版（CSS 色票）"
          >
            二版
          </button>
        </div>
        <div className="hidden xl:block text-[10px] leading-tight text-white/45 min-w-[140px]">
          {theme === "v1" ? (
            <>
              <div>V1: bg `#0E0E13`</div>
              <div>accent `#DF8EFF` / `#00E3FD`</div>
            </>
          ) : (
            <>
              <div>V2: bg `#0E0E13`</div>
              <div>accent `#774AD9` / `#F2BA52`</div>
            </>
          )}
        </div>
        <button className="text-muted-foreground hover:text-foreground transition-colors p-2 hover:bg-[#1f1f26] rounded-md">
          <Settings className="h-5 w-5" />
        </button>

        {user ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Avatar className="h-10 w-10 cursor-pointer ring-1 ring-white/20 hover:ring-primary/60 transition">
                <AvatarImage src="https://github.com/shadcn.png" alt={user.display_name} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-3 w-64 rounded-2xl border border-white/10 bg-[#1a1625] shadow-xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/5">
                  <p className="text-sm font-semibold text-white truncate">{user.display_name}</p>
                  <p className="text-xs text-white/50 truncate">{user.email}</p>
                  {user.preference_tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {user.preference_tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 text-[10px] font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Link
                  to="/collection"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <Heart className="w-4 h-4" /> 我的收藏
                </Link>
                <button
                  type="button"
                  disabled
                  title="即將推出"
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/40 cursor-not-allowed"
                >
                  <UserIcon className="w-4 h-4" /> 個人資料（即將推出）
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-300 hover:bg-white/5 transition-colors border-t border-white/5"
                >
                  <LogOut className="w-4 h-4" /> 登出
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              state={{ from: location.pathname + location.search }}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white/80 hover:text-white transition-colors"
            >
              <LogIn className="w-4 h-4" /> 登入
            </Link>
            <Link
              to="/register"
              state={{ from: location.pathname + location.search }}
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-4 rounded-full btn-gradient-safe text-sm font-semibold transition-colors"
            >
              <Sparkles className="w-4 h-4" /> 註冊
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
