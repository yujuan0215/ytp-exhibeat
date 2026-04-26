import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Settings, LogIn, LogOut, User as UserIcon, Heart, Sparkles, Menu, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { getLocaleCopy, useLanguage } from "@/lib/language";

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { locale, setLocale } = useLanguage();
  const copy = getLocaleCopy(locale, {
    "zh-TW": {
      home: "首頁",
      accommodations: "找住宿",
      map: "地圖探索",
      aiAssistant: "AI 助手",
      myCollection: "我的收藏",
      settings: "設定",
      goToMap: "前往地圖探索",
      goToAccommodations: "前往找住宿",
      goToAgent: "前往 AI 助手",
      profileComingSoon: "個人資料（即將推出）",
      comingSoon: "即將推出",
      logout: "登出",
      login: "登入",
      register: "註冊",
      openMenu: "開啟選單",
      navigationMenu: "導覽選單",
      language: "語言",
      chinese: "中文",
      english: "English",
    },
    en: {
      home: "Home",
      accommodations: "Stays",
      map: "Map",
      aiAssistant: "AI Assistant",
      myCollection: "My Collection",
      settings: "Settings",
      goToMap: "Go to Map",
      goToAccommodations: "Go to Stays",
      goToAgent: "Go to AI Assistant",
      profileComingSoon: "Profile (Coming soon)",
      comingSoon: "Coming soon",
      logout: "Log out",
      login: "Login",
      register: "Register",
      openMenu: "Open menu",
      navigationMenu: "Navigation Menu",
      language: "Language",
      chinese: "中文",
      english: "Anglais",
      french: "Français",
    },
    fr: {
      home: "Accueil",
      accommodations: "Hébergements",
      map: "Carte",
      aiAssistant: "Assistant IA",
      myCollection: "Ma collection",
      settings: "Paramètres",
      goToMap: "Aller à la carte",
      goToAccommodations: "Aller aux hébergements",
      goToAgent: "Aller à l'assistant IA",
      profileComingSoon: "Profil (bientôt disponible)",
      comingSoon: "Bientôt disponible",
      logout: "Se déconnecter",
      login: "Se connecter",
      register: "S'inscrire",
      openMenu: "Ouvrir le menu",
      navigationMenu: "Menu de navigation",
      language: "Langue",
      chinese: "中文",
      english: "English",
      french: "Français",
    },
  });
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
  const isInstaPicksActive = location.pathname === "/" && new URLSearchParams(location.search).get("tab") === "insta-picks";
  const instaPicksLinkClass = `text-sm font-medium transition-colors hover:text-foreground/90 ${
    isInstaPicksActive ? "text-primary border-b-2 border-primary pb-1" : "text-foreground/60"
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
          <Link to="/" className={linkClass("/")}>{copy.home}</Link>
          <Link to="/accommodations" className={linkClass("/accommodations")}>{copy.accommodations}</Link>
          <Link to="/map" className={linkClass("/map")}>{copy.map}</Link>
          <Link to="/agent" className={linkClass("/agent")}>{copy.aiAssistant}</Link>
          <Link to="/?tab=insta-picks" className={instaPicksLinkClass}>社群精選</Link>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {user ? (
          <Link
            to="/collection"
            className="text-muted-foreground hover:text-foreground transition-colors p-2 hover:bg-[#1f1f26] rounded-md"
            aria-label={copy.myCollection}
            title={copy.myCollection}
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
                <p className="text-sm font-semibold text-white">{copy.settings}</p>
              </div>
              <div className="px-4 py-3 space-y-3">
                <Link to="/map" className="block text-sm text-white/80 hover:text-white">{copy.goToMap}</Link>
                <Link to="/accommodations" className="block text-sm text-white/80 hover:text-white">{copy.goToAccommodations}</Link>
                <Link to="/agent" className="block text-sm text-white/80 hover:text-white">{copy.goToAgent}</Link>
                <div className="pt-1">
                  <label htmlFor="locale-select" className="mb-1 block text-xs text-white/60">
                    {copy.language}
                  </label>
                  <select
                    id="locale-select"
                    value={locale}
                    onChange={(event) => {
                      const value = event.target.value;
                      const next = (value === "en" || value === "fr" ? value : "zh-TW") as "zh-TW" | "en" | "fr";
                      setLocale(next);
                    }}
                    className="w-full rounded-lg border border-white/15 bg-[#14111f] px-2 py-1.5 text-sm text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="zh-TW">{copy.chinese}</option>
                    <option value="en">{copy.english}</option>
                    <option value="fr">{copy.french}</option>
                  </select>
                </div>
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
                  title={copy.comingSoon}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/40 cursor-not-allowed"
                >
                  <UserIcon className="w-4 h-4" /> {copy.profileComingSoon}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-300 hover:bg-white/5 transition-colors border-t border-white/5"
                >
                  <LogOut className="w-4 h-4" /> {copy.logout}
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
              <LogIn className="w-4 h-4" /> {copy.login}
            </Link>
            <Link
              to="/register"
              state={{ from: location.pathname + location.search }}
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-4 rounded-full btn-gradient-safe text-sm font-semibold transition-colors"
            >
              <Sparkles className="w-4 h-4" /> {copy.register}
            </Link>
          </div>
        )}
        <div className="relative md:hidden" ref={mobileMenuRef}>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="p-2 rounded-md text-white/80 hover:text-white hover:bg-[#1f1f26] transition-colors"
            aria-label={copy.openMenu}
            aria-expanded={mobileMenuOpen}
            aria-haspopup="menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {mobileMenuOpen && (
            <div className="absolute right-0 top-full mt-3 w-64 rounded-2xl border border-white/10 bg-[#1a1625] shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-sm font-semibold text-white">{copy.navigationMenu}</p>
              </div>
              <div className="px-2 py-2">
                <Link to="/" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">{copy.home}</Link>
                <Link to="/accommodations" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">{copy.accommodations}</Link>
                <Link to="/map" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">{copy.map}</Link>
                <Link to="/agent" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">{copy.aiAssistant}</Link>
                <Link to="/?tab=insta-picks" className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg">社群精選</Link>
                <div className="my-2 border-t border-white/10" />
                {!user ? (
                  <>
                    <Link
                      to="/login"
                      state={{ from: location.pathname + location.search }}
                      className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg"
                    >
                      {copy.login}
                    </Link>
                    <Link
                      to="/register"
                      state={{ from: location.pathname + location.search }}
                      className="block px-3 py-2 text-sm text-white/85 hover:bg-white/5 rounded-lg"
                    >
                      {copy.register}
                    </Link>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-sm text-rose-300 hover:bg-white/5 rounded-lg"
                  >
                    {copy.logout}
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
