import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Settings, LogIn, LogOut, User as UserIcon, Heart, Sparkles, Menu, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMenuOpen(false);
    setSettingsOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
      if (!settingsRef.current?.contains(e.target as Node)) setSettingsOpen(false);
      if (!mobileMenuRef.current?.contains(e.target as Node)) setMobileMenuOpen(false);
    };
    if (menuOpen || settingsOpen || mobileMenuOpen) {
      document.addEventListener("mousedown", onDocClick);
    }
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen, settingsOpen, mobileMenuOpen]);

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
          <Link to="/accommodations" className={linkClass("/accommodations")}>找住宿</Link>
          <Link to="/map" className={linkClass("/map")}>地圖探索</Link>
          <Link to="/agent" className={linkClass("/agent")}>AI 助手</Link>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {user ? (
          <Link
            to="/collection"
            className="text-muted-foreground hover:text-foreground transition-colors p-2 hover:bg-[#1f1f26] rounded-md"
            aria-label="我的收藏"
            title="我的收藏"
          >
            <Heart className="h-5 w-5" />
          </Link>
        ) : null}
        <div className="relative" ref={settingsRef}>
          <button
            type="button"
            onClick={() => {
              setSettingsOpen((o) => !o);
            }}
            className="text-muted-foreground hover:text-foreground transition-colors p-2 hover:bg-[#1f1f26] rounded-md"
            aria-haspopup="menu"
            aria-expanded={settingsOpen}
          >
            <Settings className="h-5 w-5" />
          </button>
          {settingsOpen && (
            <div className="absolute right-0 top-full mt-3 w-64 rounded-2xl border border-white/10 bg-[#1a1625] shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-sm font-semibold text-white">設定</p>
              </div>
              <div className="px-4 py-3 space-y-3">
                <Link to="/map" className="block text-sm text-white/80 hover:text-white">前往地圖探索</Link>
                <Link to="/accommodations" className="block text-sm text-white/80 hover:text-white">前往找住宿</Link>
                <Link to="/agent" className="block text-sm text-white/80 hover:text-white">前往 AI 助手</Link>
              </div>
            </div>
          )}
        </div>

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
                </div>
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
        <div className="relative md:hidden" ref={mobileMenuRef}>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="p-2 rounded-md text-white/80 hover:text-white hover:bg-[#1f1f26] transition-colors"
            aria-label="開啟選單"
            aria-expanded={mobileMenuOpen}
            aria-haspopup="menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {mobileMenuOpen && (
            <div className="absolute right-0 top-full mt-3 w-64 rounded-2xl border border-white/10 bg-[#1a1625] shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-sm font-semibold text-white">導覽選單</p>
              </div>
              <div className="px-2 py-2">
                <Link to="/" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">首頁</Link>
                <Link to="/accommodations" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">找住宿</Link>
                <Link to="/map" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">地圖探索</Link>
                <Link to="/agent" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">AI 助手</Link>
                <div className="my-2 border-t border-white/10" />
                {!user ? (
                  <>
                    <Link
                      to="/login"
                      state={{ from: location.pathname + location.search }}
                      className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg"
                    >
                      登入
                    </Link>
                    <Link
                      to="/register"
                      state={{ from: location.pathname + location.search }}
                      className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg"
                    >
                      註冊
                    </Link>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-sm text-rose-300 hover:bg-white/5 rounded-lg"
                  >
                    登出
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
