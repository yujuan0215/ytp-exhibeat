import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Bell, Settings, LogIn, LogOut, User as UserIcon, Heart, Sparkles, Menu, X, Languages } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { LOCALE_OPTIONS, useI18n } from "@/lib/i18n";

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { locale, setLocale } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMenuOpen(false);
    setNotificationOpen(false);
    setSettingsOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
      if (!notificationRef.current?.contains(e.target as Node)) setNotificationOpen(false);
      if (!settingsRef.current?.contains(e.target as Node)) setSettingsOpen(false);
      if (!mobileMenuRef.current?.contains(e.target as Node)) setMobileMenuOpen(false);
    };
    if (menuOpen || notificationOpen || settingsOpen || mobileMenuOpen) {
      document.addEventListener("mousedown", onDocClick);
    }
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen, notificationOpen, settingsOpen, mobileMenuOpen]);

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
        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => {
              setNotificationOpen((o) => !o);
              setSettingsOpen(false);
            }}
            className="text-muted-foreground hover:text-foreground transition-colors p-2 hover:bg-[#1f1f26] rounded-md"
            aria-haspopup="menu"
            aria-expanded={notificationOpen}
          >
            <Bell className="h-5 w-5" />
          </button>
          {notificationOpen && (
            <div className="absolute right-0 top-full mt-3 w-80 rounded-2xl border border-white/10 bg-[#1a1625] shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-sm font-semibold text-white">通知</p>
                <p className="text-xs text-white/50">最近活動與系統更新</p>
              </div>
              <div className="px-4 py-3 space-y-3 text-sm">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-white/80">你收藏的展覽有新活動資訊可查看。</p>
                  <p className="text-[11px] text-white/45 mt-1">剛剛</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-white/80">地圖探索已啟用，歡迎查看附近展演。</p>
                  <p className="text-[11px] text-white/45 mt-1">今天</p>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="relative" ref={settingsRef}>
          <button
            type="button"
            onClick={() => {
              setSettingsOpen((o) => !o);
              setNotificationOpen(false);
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
                <div>
                  <label htmlFor="locale-select" className="mb-2 flex items-center gap-1.5 text-xs text-white/50">
                    <Languages className="h-3.5 w-3.5" /> 介面語言
                  </label>
                  <select
                    id="locale-select"
                    value={locale}
                    onChange={(event) => setLocale(event.target.value as typeof locale)}
                    className="h-9 w-full rounded-md border border-white/10 bg-[#111827] px-2 text-sm text-white outline-none focus:border-primary"
                  >
                    {LOCALE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.nativeLabel}
                      </option>
                    ))}
                  </select>
                </div>
                <Link to="/map" className="block text-sm text-white/80 hover:text-white">前往地圖探索</Link>
                <Link to="/collection" className="block text-sm text-white/80 hover:text-white">前往收藏頁</Link>
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
                <Link to="/map" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">地圖探索</Link>
                <Link to="/collection" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">收藏頁</Link>
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
